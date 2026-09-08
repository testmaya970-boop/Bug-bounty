-- Program Foundation: the first Program domain object. Organization -> Program is a
-- strict one-to-many boundary (organization_id not null, on delete cascade); a Program
-- never exists without exactly one Organization, and program-level access is a distinct
-- concept from organization-level roles (DOMAIN.md's "Organization membership" section),
-- never derived from an organization_member_role alone. Design decisions recorded here
-- and expanded in docs/decisions/0004-program-authorization.md and
-- docs/decisions/0005-program-lifecycle.md.
--
-- 1. Program creation is restricted to organization roles with full organizational
--    access (owner, security_admin) -- the same set services/authorization.ts's
--    canManageMembers already uses for organization-membership mutations, exposed here
--    under its own name (canCreateProgram) because program creation and member
--    management are separate capabilities that happen to share an allowed-role set
--    today, not the same capability under two names.
-- 2. The creator is added to the new program_members table with role 'manager' in the
--    same transaction as the program insert -- this is a *program-level* role, distinct
--    from the organization_member_role enum's 'program_manager' value. An organization
--    member holding the org-level program_manager role gets NO automatic access to any
--    program; access is granted per-program via program_members, exactly as DOMAIN.md
--    requires ("each program membership...carries its own, separate program-level
--    permissions"). This slice does not build a way to add additional program_members
--    beyond the creator -- see 0004 for what's deferred.
-- 3. Organization owner/security_admin retain oversight (read + the authorization checks
--    below) over every program in their organization regardless of program_members
--    membership, matching their existing "Full" organizationAccess in
--    services/authorization.ts. This is enforced server-side (RLS and RPC checks), not
--    inferred client-side.
-- 4. Status uses DOMAIN.md's already-specified Program lifecycle enum in full
--    (draft/review/active/paused/closed) -- new programs are always created at 'draft'.
--    No transition RPC exists yet in this slice; publishing/review/pause/close are a
--    later slice's responsibility once scope and program policy exist to make those
--    transitions meaningful. A draft program has no public/researcher-facing exposure --
--    no such surface exists yet regardless.
-- 5. No slug. Routing is UUID-based (/organizations/[organizationId]/programs/[programId]),
--    the same reasoning organization creation already used (0003) -- a slug's only real
--    future consumer is a public/researcher-facing discovery page, which does not exist
--    yet. Revisit if/when that consumer exists.
-- 6. Idempotency reuses organization creation's real-database-constraint pattern (a
--    nullable, per-(organization, creator)-unique idempotency_key), including the same
--    unique_violation/GET STACKED DIAGNOSTICS race-safe replay branch. Unlike
--    create_organization there is no slug-collision retry loop needed here -- programs
--    have no unique identifier derived from user input other than the idempotency key.

create type public.program_status as enum ('draft', 'review', 'active', 'paused', 'closed');
create type public.program_member_role as enum ('manager');

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  status public.program_status not null default 'draft',
  created_by uuid not null references public.users(id) on delete restrict,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_id_organization_id_key unique (id, organization_id)
);
create index programs_organization_id_idx on public.programs(organization_id, created_at desc);
create unique index programs_org_created_by_idempotency_key_idx on public.programs(organization_id, created_by, idempotency_key) where idempotency_key is not null;

comment on column public.programs.status is 'DOMAIN.md Program lifecycle: draft->review->active->paused->closed. Created directly at draft; no transition RPC exists yet (see docs/decisions/0005-program-lifecycle.md).';

-- organization_id is denormalized here (rather than joined through programs on every
-- RLS check) so both the FK below and the RLS policy can reference it directly. The
-- composite FK guarantees a program_members row can never disagree with its program's
-- real organization -- this column is not independently client-writable regardless,
-- since program_members has no insert policy and create_program (the only writer)
-- always sets it from the program it just created.
create table public.program_members (
  program_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.program_member_role not null,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (program_id, user_id),
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade
);
create index program_members_user_id_idx on public.program_members(user_id);

alter table public.programs enable row level security;
alter table public.program_members enable row level security;

-- ---------------------------------------------------------------------------
-- RLS helper: same private-schema, plpgsql, search_path='' pattern as
-- private.is_org_member (202608260001) and for the same reason -- placing this in
-- `public` would make it directly callable as an arbitrary-program-id membership oracle
-- over the Data API.
-- ---------------------------------------------------------------------------

create or replace function private.is_program_member(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.program_members
    where program_id = target_program_id and user_id = auth.uid()
  );
end;
$$;

revoke all on function private.is_program_member(uuid) from public;
grant execute on function private.is_program_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies. No insert/update/delete policy on either table: every write goes
-- through create_program below, a SECURITY DEFINER function -- the same "service-only"
-- write boundary every table in this schema already uses (see 202608260001).
-- ---------------------------------------------------------------------------

create policy "programs read by org admins or program members" on public.programs
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(id)
  );

create policy "program members read own row or org admins" on public.program_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
  );

-- ---------------------------------------------------------------------------
-- create_program: one transaction -- authorize, validate, create, assign the creator as
-- program manager, and write the audit event, or none of it happens.
-- ---------------------------------------------------------------------------

create or replace function public.create_program(target_org_id uuid, program_name text, p_idempotency_key uuid default null)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(program_name);
  new_program public.programs;
  existing public.programs;
  conflicting_index text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot create programs in this organization' using errcode = '42501';
  end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_NAME: Enter a program name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 160 then
    raise exception 'INVALID_NAME: Use 160 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_NAME: Program name contains invalid characters.' using errcode = '22023';
  end if;

  -- Idempotent replay: a client-supplied key that already produced a program for this
  -- actor in this organization returns that program instead of creating another one.
  if p_idempotency_key is not null then
    select * into existing from public.programs
      where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
    if found then
      return existing;
    end if;
  end if;

  begin
    insert into public.programs (organization_id, name, status, created_by, idempotency_key)
    values (target_org_id, trimmed_name, 'draft', actor, p_idempotency_key)
    returning * into new_program;
  exception when unique_violation then
    -- Genuine concurrent double-submit with the same idempotency key: fetch and return
    -- the row the other concurrent transaction just committed, the same race-safe
    -- pattern create_organization uses (202608260003).
    get stacked diagnostics conflicting_index = constraint_name;
    if conflicting_index = 'programs_org_created_by_idempotency_key_idx' then
      select * into new_program from public.programs
        where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
    else
      raise;
    end if;
  end;

  insert into public.program_members (program_id, organization_id, user_id, role, added_by)
  values (new_program.id, target_org_id, actor, 'manager', actor);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'program.created', 'program', new_program.id, jsonb_build_object('name', trimmed_name));

  return new_program;
end;
$$;

revoke all on function public.create_program(uuid, text, uuid) from public;
grant execute on function public.create_program(uuid, text, uuid) to authenticated;

-- Base Data API grants -- learned live in 202608260002 that RLS alone is unreachable
-- without these, so both new tables get them proactively this time rather than
-- discovering the gap in production.
grant select on public.programs, public.program_members to authenticated;
grant select, insert, update, delete on public.programs, public.program_members to service_role;
