-- Phase 2: organization membership lifecycle, invitations, account provisioning, and
-- authenticated-role mutation functions for the Organization Control Center.
--
-- Deviations from the schema sketch in the Phase 2 task, and why:
--
-- 1. organization_members keeps its existing composite primary key
--    (organization_id, user_id) instead of gaining a surrogate `id`. Nothing in Phase 1
--    referenced a membership by a separate id, and audit_logs already targets
--    (organization_id, entity_id = user_id); adding a surrogate key here would be pure
--    churn with no consumer.
-- 2. organization_members has no `invited` status and no `invited_at` column.
--    `user_id` is a NOT NULL foreign key to public.users, so a person cannot have an
--    organization_members row before they have an account and have accepted an
--    invitation. The pending/INVITED phase of the member lifecycle is represented
--    entirely by a row in the new organization_invitations table (keyed by email, not
--    user_id); accepting an invitation is exactly the transition that creates or
--    reactivates the organization_members row at ACTIVE. This is documented in
--    DOMAIN.md's member lifecycle section.
-- 3. Account provisioning (public.users row creation from auth.users, plus a
--    denormalized, RLS-safe `email` column) is added here because it is a hard
--    prerequisite for organization membership to mean anything, and docs/architecture.md
--    already named it as the first Phase 2 slice.

-- ---------------------------------------------------------------------------
-- Roles and status
-- ---------------------------------------------------------------------------

alter type public.organization_member_role rename to organization_member_role_v1;
create type public.organization_member_role as enum ('owner', 'security_admin', 'program_manager', 'triager', 'billing_admin');

-- Phase 1 only ever had three roles and no real organizations yet; map them onto the
-- closest Phase 2 equivalent rather than adding a backward-compatibility shim.
alter table public.organization_members
  alter column role type public.organization_member_role
  using (
    case role::text
      when 'owner' then 'owner'
      when 'manager' then 'program_manager'
      when 'member' then 'triager'
    end
  )::public.organization_member_role;

drop type public.organization_member_role_v1;

create type public.organization_member_status as enum ('active', 'suspended', 'removed');
create type public.organization_status as enum ('created', 'active');

-- ---------------------------------------------------------------------------
-- organizations: lifecycle status
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column status public.organization_status not null default 'active';
comment on column public.organizations.status is 'CREATED->ACTIVE lifecycle. Deletion is out of scope for Phase 2; see AGENTS.md.';

-- ---------------------------------------------------------------------------
-- organization_members: lifecycle columns
-- ---------------------------------------------------------------------------

alter table public.organization_members
  add column status public.organization_member_status not null default 'active',
  add column invited_by uuid references public.users(id) on delete set null,
  add column joined_at timestamptz not null default now(),
  add column suspended_at timestamptz,
  add column removed_at timestamptz,
  add column updated_at timestamptz not null default now();

update public.organization_members set joined_at = created_at, updated_at = created_at;

alter table public.organization_members
  add constraint organization_members_suspended_at_check check (status = 'suspended' or suspended_at is null),
  add constraint organization_members_removed_at_check check (status = 'removed' or removed_at is null);

-- ---------------------------------------------------------------------------
-- Account provisioning: public.users gains email; auth.users creates/syncs it
-- ---------------------------------------------------------------------------

alter table public.users add column email text check (email = lower(email));
create unique index users_email_key on public.users(email) where email is not null;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_username text;
begin
  candidate_username := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '_', 'g');
  candidate_username := left(candidate_username, 24) || '_' || left(replace(new.id::text, '-', ''), 6);

  insert into public.users (id, username, display_name, email)
  values (new.id, candidate_username, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), lower(new.email))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.handle_auth_user_email_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = lower(new.email), updated_at = now()
  where id = new.id and email is distinct from lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_auth_user_email_sync();

-- ---------------------------------------------------------------------------
-- organization_invitations
-- ---------------------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.organization_member_role not null,
  invited_by uuid not null references public.users(id) on delete restrict,
  token_hash text not null unique,
  message text check (char_length(message) <= 500),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_resolution_check check (not (accepted_at is not null and revoked_at is not null))
);

create index organization_invitations_org_idx on public.organization_invitations(organization_id, created_at desc);
-- At most one unresolved invitation per (organization, email) at a time: this is what
-- turns "invitation email already pending" into a real, server-enforced error case.
create unique index organization_invitations_pending_unique on public.organization_invitations(organization_id, email)
  where accepted_at is null and revoked_at is null;

comment on column public.organization_invitations.token_hash is
  'SHA-256 hex digest of the invitation token. The raw token is returned once to the caller and never persisted.';

alter table public.organization_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER: the table owner bypasses its own RLS when
-- these functions run, which is what breaks the self-referencing recursion below).
--
-- These live in `private`, not `public`. `public` (plus `graphql_public`) is the
-- schema Supabase's Data API exposes as callable RPC endpoints (see
-- supabase/config.toml's `[api] schemas`); a SECURITY DEFINER function placed there is
-- directly callable over HTTP by any authenticated client, as `supabase.rpc('is_org_member', ...)`,
-- with an arbitrary organization_id. Because the function runs with the definer's
-- privileges, it answers that query by reading across every organization's membership
-- data, bypassing organization_members' own RLS -- so a direct call turns it into a
-- membership/role-existence oracle for organization IDs and user IDs the caller does not
-- belong to, which is exactly the kind of enumeration DOMAIN.md and SECURITY.md require
-- Sentinel not to expose. `revoke ... grant execute ... to authenticated` alone does not
-- close this: `authenticated` genuinely needs EXECUTE for RLS policy evaluation to work
-- at all (the evaluating role must have privilege to invoke every function its active
-- policies reference), so grant-based hardening cannot be the only control here. `private`
-- is not in supabase/config.toml's exposed schemas, so PostgREST never routes an HTTP
-- request to it regardless of grants -- these functions remain callable only as building
-- blocks referenced from RLS policies and from the public, intentionally-exposed RPC
-- functions below, never directly. See docs/security/phase-2-rpc-review.md.
--
-- These are written as `plpgsql`, not `sql`. Supabase's own current RLS documentation
-- shows this exact pattern with `language sql`; `plpgsql` is used here instead because
-- it is never a planner-inlining candidate under any circumstance, which is the more
-- conservative choice regardless of how narrowly the sql-inlining risk actually applies
-- to a SECURITY DEFINER function. `search_path = ''` plus fully schema-qualified names
-- throughout avoids resolving an identifier against a schema an attacker could put
-- earlier in a hijacked search_path; pg_catalog (and therefore built-ins like
-- now()/lower()/count()) is always implicitly searched regardless, so this does not
-- affect ordinary built-in calls.
-- ---------------------------------------------------------------------------

create schema if not exists private;
-- `authenticated` needs USAGE to invoke anything in this schema (required for RLS policy
-- evaluation, see above). Deliberately not granted to `anon` or `PUBLIC`.
grant usage on schema private to authenticated;

create or replace function private.is_org_member(target_org_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.organization_members
    where organization_id = target_org_id and user_id = auth.uid() and status = 'active'
  );
end;
$$;

create or replace function private.has_org_role(target_org_id uuid, allowed_roles public.organization_member_role[])
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.organization_members
    where organization_id = target_org_id and user_id = auth.uid() and status = 'active' and role = any(allowed_roles)
  );
end;
$$;

create or replace function private.shares_organization_with(target_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.organization_members m1
    join public.organization_members m2 on m1.organization_id = m2.organization_id
    where m1.user_id = target_user_id and m2.user_id = auth.uid()
      and m1.status = 'active' and m2.status = 'active'
  );
end;
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, public.organization_member_role[]) from public;
revoke all on function private.shares_organization_with(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.organization_member_role[]) to authenticated;
grant execute on function private.shares_organization_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

drop policy if exists "members read own memberships" on public.organization_members;
create policy "members read organization roster" on public.organization_members
  for select to authenticated
  using (user_id = auth.uid() or private.is_org_member(organization_id));

create policy "users read org co-members" on public.users
  for select to authenticated
  using (id = auth.uid() or private.shares_organization_with(id));

-- Phase 1's "organizations read if member" policy predates member status and never
-- required status = 'active', unlike every policy above -- a suspended/removed member
-- could still read the organization's name/slug. Low severity (not report/member data),
-- but an inconsistency worth closing now that private.is_org_member() exists to express
-- it consistently with the rest of this file.
drop policy if exists "organizations read if member" on public.organizations;
create policy "organizations read if member" on public.organizations
  for select to authenticated
  using (private.is_org_member(id));

create policy "invitations read by org admins" on public.organization_invitations
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));

create policy "audit logs read by org admins" on public.audit_logs
  for select to authenticated
  using (organization_id is not null and private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));

-- organization_invitations and audit_logs stay insert/update/delete-free of policies:
-- every mutation goes through a SECURITY DEFINER function below, never a direct table
-- write from the client. This is the same "service-only" boundary Phase 1 established,
-- expressed as authenticated-role RPCs instead of a service-role key, per SECURITY.md's
-- instruction to minimize service-role key use; see docs/decisions for the write-up.

-- ---------------------------------------------------------------------------
-- Mutation functions. Every one re-derives the actor from auth.uid() (never a
-- client-supplied id), re-checks authorization against the current DB state, and
-- writes its audit_logs row in the same transaction as the mutation it describes.
-- ---------------------------------------------------------------------------

create or replace function public.invite_organization_member(
  target_org_id uuid,
  invitee_email text,
  invitee_role public.organization_member_role,
  invite_message text,
  token_hash_input text,
  expires_in_hours integer default 168
)
returns public.organization_invitations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized_email text := lower(trim(invitee_email));
  new_invitation public.organization_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot invite members to this organization' using errcode = '42501';
  end if;
  if invitee_role = 'owner' and not private.has_org_role(target_org_id, array['owner']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner can invite another owner' using errcode = '42501';
  end if;

  insert into public.organization_invitations (organization_id, email, role, invited_by, token_hash, message, expires_at)
  values (target_org_id, normalized_email, invitee_role, actor, token_hash_input, nullif(invite_message, ''), now() + make_interval(hours => expires_in_hours))
  returning * into new_invitation;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.invited', 'organization_invitation', new_invitation.id,
    jsonb_build_object('email', normalized_email, 'role', invitee_role));

  return new_invitation;
exception
  when unique_violation then
    raise exception 'INVITATION_PENDING: an invitation is already pending for this email' using errcode = '23505';
end;
$$;

create or replace function public.accept_organization_invitation(token_hash_input text)
returns public.organization_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.organization_invitations;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select email into actor_email from public.users where id = actor;

  select * into invitation from public.organization_invitations where token_hash = token_hash_input for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  insert into public.organization_members (organization_id, user_id, role, status, invited_by, joined_at, updated_at)
  values (invitation.organization_id, actor, invitation.role, 'active', invitation.invited_by, now(), now())
  on conflict (organization_id, user_id) do update
    set role = excluded.role, status = 'active', joined_at = now(), suspended_at = null, removed_at = null, updated_at = now()
  returning * into membership;

  update public.organization_invitations set accepted_at = now(), accepted_by = actor, updated_at = now() where id = invitation.id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'member.invitation_accepted', 'organization_member', actor,
    jsonb_build_object('role', invitation.role, 'invitation_id', invitation.id));

  return membership;
end;
$$;

create or replace function public.cancel_organization_invitation(invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  invitation public.organization_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into invitation from public.organization_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(invitation.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot manage invitations for this organization' using errcode = '42501';
  end if;
  if invitation.accepted_at is not null then
    raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023';
  end if;

  update public.organization_invitations set revoked_at = now(), updated_at = now() where id = invitation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'member.invitation_cancelled', 'organization_invitation', invitation.id,
    jsonb_build_object('email', invitation.email));
end;
$$;

-- change_member_role is deliberately owner-only: DOMAIN role capabilities give OWNER
-- "manage organization roles" but SECURITY_ADMIN only "manage members" (status actions).
create or replace function public.change_member_role(target_org_id uuid, target_user_id uuid, new_role public.organization_member_role)
returns public.organization_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_membership public.organization_members;
  target_membership public.organization_members;
  remaining_owners integer;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into actor_membership from public.organization_members
    where organization_id = target_org_id and user_id = actor and status = 'active';
  if actor_membership.user_id is null or actor_membership.role <> 'owner' then
    raise exception 'FORBIDDEN: only an owner can change organization roles' using errcode = '42501';
  end if;

  perform 1 from public.organization_members
    where organization_id = target_org_id and role = 'owner' and status = 'active' for update;

  select * into target_membership from public.organization_members
    where organization_id = target_org_id and user_id = target_user_id for update;
  if target_membership.user_id is null or target_membership.status <> 'active' then
    raise exception 'MEMBER_NOT_FOUND: active membership not found' using errcode = 'P0002';
  end if;

  if target_membership.role = 'owner' and new_role <> 'owner' then
    select count(*) into remaining_owners from public.organization_members
      where organization_id = target_org_id and role = 'owner' and status = 'active' and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'LAST_OWNER: An organization must always have at least one active owner.' using errcode = '23514';
    end if;
  end if;

  update public.organization_members set role = new_role, updated_at = now()
    where organization_id = target_org_id and user_id = target_user_id
    returning * into membership;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.role_changed', 'organization_member', target_user_id,
    jsonb_build_object('previous_role', target_membership.role, 'new_role', new_role));

  return membership;
end;
$$;

create or replace function public.suspend_member(target_org_id uuid, target_user_id uuid)
returns public.organization_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_membership public.organization_members;
  target_membership public.organization_members;
  remaining_owners integer;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into actor_membership from public.organization_members
    where organization_id = target_org_id and user_id = actor and status = 'active';
  if actor_membership.user_id is null or actor_membership.role not in ('owner', 'security_admin') then
    raise exception 'FORBIDDEN: actor cannot suspend members in this organization' using errcode = '42501';
  end if;

  perform 1 from public.organization_members
    where organization_id = target_org_id and role = 'owner' and status = 'active' for update;

  select * into target_membership from public.organization_members
    where organization_id = target_org_id and user_id = target_user_id for update;
  if target_membership.user_id is null or target_membership.status <> 'active' then
    raise exception 'MEMBER_NOT_FOUND: active membership not found' using errcode = 'P0002';
  end if;

  if target_membership.role = 'owner' then
    select count(*) into remaining_owners from public.organization_members
      where organization_id = target_org_id and role = 'owner' and status = 'active' and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'LAST_OWNER: An organization must always have at least one active owner.' using errcode = '23514';
    end if;
  end if;

  update public.organization_members set status = 'suspended', suspended_at = now(), updated_at = now()
    where organization_id = target_org_id and user_id = target_user_id
    returning * into membership;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.suspended', 'organization_member', target_user_id, jsonb_build_object('previous_role', target_membership.role));

  return membership;
end;
$$;

create or replace function public.reactivate_member(target_org_id uuid, target_user_id uuid)
returns public.organization_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_membership public.organization_members;
  target_membership public.organization_members;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into actor_membership from public.organization_members
    where organization_id = target_org_id and user_id = actor and status = 'active';
  if actor_membership.user_id is null or actor_membership.role not in ('owner', 'security_admin') then
    raise exception 'FORBIDDEN: actor cannot reactivate members in this organization' using errcode = '42501';
  end if;

  select * into target_membership from public.organization_members
    where organization_id = target_org_id and user_id = target_user_id for update;
  if target_membership.user_id is null or target_membership.status <> 'suspended' then
    raise exception 'MEMBER_NOT_SUSPENDED: member is not currently suspended' using errcode = 'P0002';
  end if;

  update public.organization_members set status = 'active', suspended_at = null, updated_at = now()
    where organization_id = target_org_id and user_id = target_user_id
    returning * into membership;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.reactivated', 'organization_member', target_user_id, '{}'::jsonb);

  return membership;
end;
$$;

create or replace function public.remove_member(target_org_id uuid, target_user_id uuid)
returns public.organization_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_membership public.organization_members;
  target_membership public.organization_members;
  remaining_owners integer;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into actor_membership from public.organization_members
    where organization_id = target_org_id and user_id = actor and status = 'active';
  if actor_membership.user_id is null or actor_membership.role not in ('owner', 'security_admin') then
    raise exception 'FORBIDDEN: actor cannot remove members from this organization' using errcode = '42501';
  end if;

  perform 1 from public.organization_members
    where organization_id = target_org_id and role = 'owner' and status = 'active' for update;

  select * into target_membership from public.organization_members
    where organization_id = target_org_id and user_id = target_user_id for update;
  if target_membership.user_id is null or target_membership.status = 'removed' then
    raise exception 'MEMBER_NOT_FOUND: active membership not found' using errcode = 'P0002';
  end if;

  if target_membership.role = 'owner' then
    select count(*) into remaining_owners from public.organization_members
      where organization_id = target_org_id and role = 'owner' and status = 'active' and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'LAST_OWNER: An organization must always have at least one active owner.' using errcode = '23514';
    end if;
  end if;

  update public.organization_members set status = 'removed', removed_at = now(), updated_at = now()
    where organization_id = target_org_id and user_id = target_user_id
    returning * into membership;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.removed', 'organization_member', target_user_id, jsonb_build_object('previous_role', target_membership.role));

  return membership;
end;
$$;

revoke all on function public.invite_organization_member(uuid, text, public.organization_member_role, text, text, integer) from public;
revoke all on function public.accept_organization_invitation(text) from public;
revoke all on function public.cancel_organization_invitation(uuid) from public;
revoke all on function public.change_member_role(uuid, uuid, public.organization_member_role) from public;
revoke all on function public.suspend_member(uuid, uuid) from public;
revoke all on function public.reactivate_member(uuid, uuid) from public;
revoke all on function public.remove_member(uuid, uuid) from public;

grant execute on function public.invite_organization_member(uuid, text, public.organization_member_role, text, text, integer) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.cancel_organization_invitation(uuid) to authenticated;
grant execute on function public.change_member_role(uuid, uuid, public.organization_member_role) to authenticated;
grant execute on function public.suspend_member(uuid, uuid) to authenticated;
grant execute on function public.reactivate_member(uuid, uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
