-- Researcher Access Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0007-researcher-access.md.
--
-- 1. Researcher participation (program_researchers) is a THIRD authorization domain,
--    never merged with organization_members or program_members. A researcher gains no
--    organization membership and no access to any other program by participating here.
-- 2. Invitation-only in this slice (mirrors invite_organization_member's proven shape:
--    hashed, expiring, single-use, email-bound token) -- application and public
--    self-enrollment are real, deferred capabilities (see 0007), not oversights.
-- 3. No pending/invited status on program_researchers, for the identical reason
--    organization_members has none: the pending phase is entirely a
--    program_invitations row; accepting creates/reactivates the participation row
--    directly at 'active'.
-- 4. Researcher invitation is NOT gated by program.status, unlike scope mutation --
--    no status-transition RPC exists yet (0005), so gating this on anything but
--    'draft' would make the entire slice permanently unreachable. See 0007.
-- 5. private.is_researcher_authorized_for_program takes no researcherId parameter --
--    it derives the actor from auth.uid(), the same single-parameter shape every other
--    private helper in this schema uses, deliberately, so it can never become an
--    arbitrary-researcher-id authorization oracle.

create type public.program_researcher_status as enum ('active', 'suspended', 'revoked');
create type public.program_access_source as enum ('invitation');

-- ---------------------------------------------------------------------------
-- program_invitations: the pending phase. Mirrors organization_invitations' shape.
-- ---------------------------------------------------------------------------

create table public.program_invitations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid not null references public.users(id) on delete restrict,
  token_hash text not null unique,
  message text check (message is null or char_length(message) <= 500),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_invitations_resolution_check check (not (accepted_at is not null and revoked_at is not null)),
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade
);

create index program_invitations_program_idx on public.program_invitations(program_id, created_at desc);
-- At most one unresolved invitation per (program, email) at a time.
create unique index program_invitations_pending_unique on public.program_invitations(program_id, email)
  where accepted_at is null and revoked_at is null;

comment on column public.program_invitations.token_hash is
  'SHA-256 hex digest of the invitation token. The raw token is returned once to the caller and never persisted.';

-- ---------------------------------------------------------------------------
-- program_researchers: the actual participation record. Mirrors organization_members'
-- lifecycle-column shape (status + actor/timestamp per transition).
-- ---------------------------------------------------------------------------

create table public.program_researchers (
  program_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  status public.program_researcher_status not null default 'active',
  source public.program_access_source not null default 'invitation',
  invited_by uuid references public.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspended_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (program_id, user_id),
  constraint program_researchers_suspended_at_check check (status = 'suspended' or (suspended_at is null and suspended_by is null)),
  constraint program_researchers_revoked_at_check check (status = 'revoked' or (revoked_at is null and revoked_by is null)),
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade
);

create index program_researchers_user_id_idx on public.program_researchers(user_id);

alter table public.program_invitations enable row level security;
alter table public.program_researchers enable row level security;

-- ---------------------------------------------------------------------------
-- private.is_researcher_authorized_for_program: same plpgsql/stable/security
-- definer/search_path='' pattern as private.is_org_member and private.is_program_member,
-- and for the identical non-exposure reason (see the 202608260001 migration's own
-- comment, which applies unchanged here).
-- ---------------------------------------------------------------------------

create or replace function private.is_researcher_authorized_for_program(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.program_researchers
    where program_id = target_program_id and user_id = auth.uid() and status = 'active'
  );
end;
$$;

revoke all on function private.is_researcher_authorized_for_program(uuid) from public;
grant execute on function private.is_researcher_authorized_for_program(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Widen existing RLS policies: an active researcher may read the program they
-- participate in, and its currently-active scope only (never removed history --
-- that stays manager-only, per docs/decisions/0007-researcher-access.md).
-- ---------------------------------------------------------------------------

drop policy if exists "programs read by org admins or program members" on public.programs;
create policy "programs read by org admins, program members, or authorized researchers" on public.programs
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(id)
    or private.is_researcher_authorized_for_program(id)
  );

drop policy if exists "scope entries read by org admins or program members" on public.program_scope_entries;
create policy "scope entries read by org admins, program members, or authorized researchers (active only)" on public.program_scope_entries
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
    or (private.is_researcher_authorized_for_program(program_id) and status = 'active')
  );

-- ---------------------------------------------------------------------------
-- program_invitations / program_researchers RLS. No insert/update/delete policy on
-- either: every write goes through the SECURITY DEFINER functions below.
-- ---------------------------------------------------------------------------

create policy "program invitations read by org admins or program managers" on public.program_invitations
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

create policy "program researchers read own row or managers" on public.program_researchers
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

-- Real gap found live: a program manager could read a researcher's program_researchers
-- row (above) but not the researcher's actual name/email, since public.users' only
-- existing read paths are "self" and "shares_organization_with" (202608260001) -- a
-- researcher shares no organization with the manager at all, by design (0007), so their
-- profile embedded on the roster silently resolved to null ("Unknown researcher"). This
-- widens public.users' read policy with a third, narrowly-scoped path: a manager may read
-- the profile of a user who has ANY program_researchers row (any status, for roster/audit
-- purposes) on a program that manager actually manages -- resolved from the real
-- program_researchers row, never a client-supplied id.
create policy "users read by managers of a program the user participates in" on public.users
  for select to authenticated
  using (
    exists (
      select 1 from public.program_researchers r
      where r.user_id = users.id
        and (
          private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_member(r.program_id)
        )
    )
  );

grant select on public.program_invitations, public.program_researchers to authenticated;
grant select, insert, update, delete on public.program_invitations, public.program_researchers to service_role;

-- ---------------------------------------------------------------------------
-- invite_researcher_to_program
-- ---------------------------------------------------------------------------

create or replace function public.invite_researcher_to_program(
  target_program_id uuid,
  researcher_email text,
  invite_message text,
  token_hash_input text,
  expires_in_hours integer default 168
)
returns public.program_invitations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  normalized_email text := lower(trim(researcher_email));
  new_invitation public.program_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot invite researchers to this program' using errcode = '42501';
  end if;

  begin
    insert into public.program_invitations (program_id, organization_id, email, invited_by, token_hash, message, expires_at)
    values (target_program_id, program.organization_id, normalized_email, actor, token_hash_input, nullif(invite_message, ''), now() + make_interval(hours => expires_in_hours))
    returning * into new_invitation;
  exception when unique_violation then
    raise exception 'INVITATION_PENDING: an invitation is already pending for this email' using errcode = '23505';
  end;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'researcher.invited', 'program_invitation', new_invitation.id,
    jsonb_build_object('program_id', target_program_id, 'email', normalized_email));

  return new_invitation;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_program_invitation (token-based) / accept_program_invitation_by_id
-- (in-app discovery). Both gated by the identical accepting-account-email-must-equal-
-- invitation-email check, mirroring the organization-invitation dual path exactly
-- (see docs/decisions/0003-organization-creation.md's rationale, unchanged here).
-- ---------------------------------------------------------------------------

create or replace function public.accept_program_invitation(token_hash_input text)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.program_invitations;
  participation public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select email into actor_email from public.users where id = actor;

  select * into invitation from public.program_invitations where token_hash = token_hash_input for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by, joined_at, updated_at)
  values (invitation.program_id, invitation.organization_id, actor, 'active', 'invitation', invitation.invited_by, now(), now())
  on conflict (program_id, user_id) do update
    set status = 'active', joined_at = now(), suspended_at = null, suspended_by = null, revoked_at = null, revoked_by = null, updated_at = now()
  returning * into participation;

  update public.program_invitations set accepted_at = now(), accepted_by = actor, updated_at = now() where id = invitation.id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'researcher.invitation_accepted', 'program_researcher', actor,
    jsonb_build_object('program_id', invitation.program_id, 'invitation_id', invitation.id));

  return participation;
end;
$$;

create or replace function public.accept_program_invitation_by_id(invitation_id uuid)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.program_invitations;
  participation public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select email into actor_email from public.users where id = actor;

  select * into invitation from public.program_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by, joined_at, updated_at)
  values (invitation.program_id, invitation.organization_id, actor, 'active', 'invitation', invitation.invited_by, now(), now())
  on conflict (program_id, user_id) do update
    set status = 'active', joined_at = now(), suspended_at = null, suspended_by = null, revoked_at = null, revoked_by = null, updated_at = now()
  returning * into participation;

  update public.program_invitations set accepted_at = now(), accepted_by = actor, updated_at = now() where id = invitation.id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'researcher.invitation_accepted', 'program_researcher', actor,
    jsonb_build_object('program_id', invitation.program_id, 'invitation_id', invitation.id));

  return participation;
end;
$$;

-- cancel_program_invitation: manager cancel OR invitee decline (email match) -- the
-- same dual-purpose widening cancel_organization_invitation already has.
create or replace function public.cancel_program_invitation(invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.program_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into invitation from public.program_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;

  select email into actor_email from public.users where id = actor;

  if not (
    private.has_org_role(invitation.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(invitation.program_id)
    or actor_email = invitation.email
  ) then
    raise exception 'FORBIDDEN: actor cannot manage this invitation' using errcode = '42501';
  end if;
  if invitation.accepted_at is not null then
    raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023';
  end if;

  update public.program_invitations set revoked_at = now(), revoked_by = actor, updated_at = now() where id = invitation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'researcher.invitation_cancelled', 'program_invitation', invitation.id,
    jsonb_build_object('program_id', invitation.program_id, 'email', invitation.email, 'cancelled_by_invitee', actor_email = invitation.email));
end;
$$;

-- ---------------------------------------------------------------------------
-- list_my_pending_program_invitations / list_my_program_participations: the
-- researcher's own view, safely crossing the RLS boundary they have no other path
-- across (they are not an organization member, so organizations/programs are not
-- otherwise readable before -- or independent of -- an active participation).
-- Deliberately uses program/organization column aliases distinct from the RETURNS
-- TABLE output column names, avoiding the 0003-class collision bug.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_pending_program_invitations()
returns table (
  id uuid,
  program_id uuid,
  program_name text,
  organization_name text,
  invited_by_name text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select users.email into actor_email from public.users where users.id = actor;
  if actor_email is null then return; end if;

  return query
    select i.id, i.program_id, p.name, o.name, u.display_name, i.expires_at, i.created_at
    from public.program_invitations i
    join public.programs p on p.id = i.program_id
    join public.organizations o on o.id = i.organization_id
    left join public.users u on u.id = i.invited_by
    where i.email = actor_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

create or replace function public.list_my_program_participations()
returns table (
  program_id uuid,
  organization_id uuid,
  program_name text,
  program_status public.program_status,
  organization_name text,
  status public.program_researcher_status,
  joined_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select r.program_id, r.organization_id, p.name, p.status, o.name, r.status, r.joined_at
    from public.program_researchers r
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where r.user_id = actor and r.status <> 'revoked'
    order by r.joined_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- suspend_program_researcher / reinstate_program_researcher / revoke_program_researcher
-- ---------------------------------------------------------------------------

create or replace function public.suspend_program_researcher(target_program_id uuid, target_user_id uuid)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  target public.program_researchers;
  updated public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage researchers for this program' using errcode = '42501';
  end if;

  select * into target from public.program_researchers where program_id = target_program_id and user_id = target_user_id for update;
  if target.user_id is null or target.status <> 'active' then
    raise exception 'RESEARCHER_NOT_FOUND: active participation not found' using errcode = 'P0002';
  end if;

  update public.program_researchers set status = 'suspended', suspended_at = now(), suspended_by = actor, updated_at = now()
    where program_id = target_program_id and user_id = target_user_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'researcher.suspended', 'program_researcher', target_user_id, jsonb_build_object('program_id', target_program_id));

  return updated;
end;
$$;

create or replace function public.reinstate_program_researcher(target_program_id uuid, target_user_id uuid)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  target public.program_researchers;
  updated public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage researchers for this program' using errcode = '42501';
  end if;

  select * into target from public.program_researchers where program_id = target_program_id and user_id = target_user_id for update;
  if target.user_id is null or target.status <> 'suspended' then
    raise exception 'RESEARCHER_NOT_SUSPENDED: researcher is not currently suspended' using errcode = 'P0002';
  end if;

  update public.program_researchers set status = 'active', suspended_at = null, suspended_by = null, updated_at = now()
    where program_id = target_program_id and user_id = target_user_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'researcher.reinstated', 'program_researcher', target_user_id, jsonb_build_object('program_id', target_program_id));

  return updated;
end;
$$;

create or replace function public.revoke_program_researcher(target_program_id uuid, target_user_id uuid)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  target public.program_researchers;
  updated public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage researchers for this program' using errcode = '42501';
  end if;

  select * into target from public.program_researchers where program_id = target_program_id and user_id = target_user_id for update;
  if target.user_id is null or target.status = 'revoked' then
    raise exception 'RESEARCHER_NOT_FOUND: active participation not found' using errcode = 'P0002';
  end if;

  update public.program_researchers set status = 'revoked', revoked_at = now(), revoked_by = actor, suspended_at = null, suspended_by = null, updated_at = now()
    where program_id = target_program_id and user_id = target_user_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'researcher.revoked', 'program_researcher', target_user_id, jsonb_build_object('program_id', target_program_id));

  return updated;
end;
$$;

revoke all on function public.invite_researcher_to_program(uuid, text, text, text, integer) from public;
revoke all on function public.accept_program_invitation(text) from public;
revoke all on function public.accept_program_invitation_by_id(uuid) from public;
revoke all on function public.cancel_program_invitation(uuid) from public;
revoke all on function public.list_my_pending_program_invitations() from public;
revoke all on function public.list_my_program_participations() from public;
revoke all on function public.suspend_program_researcher(uuid, uuid) from public;
revoke all on function public.reinstate_program_researcher(uuid, uuid) from public;
revoke all on function public.revoke_program_researcher(uuid, uuid) from public;

grant execute on function public.invite_researcher_to_program(uuid, text, text, text, integer) to authenticated;
grant execute on function public.accept_program_invitation(text) to authenticated;
grant execute on function public.accept_program_invitation_by_id(uuid) to authenticated;
grant execute on function public.cancel_program_invitation(uuid) to authenticated;
grant execute on function public.list_my_pending_program_invitations() to authenticated;
grant execute on function public.list_my_program_participations() to authenticated;
grant execute on function public.suspend_program_researcher(uuid, uuid) to authenticated;
grant execute on function public.reinstate_program_researcher(uuid, uuid) to authenticated;
grant execute on function public.revoke_program_researcher(uuid, uuid) to authenticated;
