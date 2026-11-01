-- Organization-status control, part 2: the real control. 0026 itself anticipated this
-- exact state ("Ability to change an organization's own status (e.g. to a future
-- suspended/archived state DOMAIN.md already anticipates)") but organizations.status has
-- held only ('created', 'active') since 202608260001, is set to 'active' unconditionally
-- by create_organization, and -- confirmed by a full-tree grep before writing this
-- migration -- was read by ZERO existing RLS policies or RPCs anywhere in the schema. A
-- suspended organization that nothing checks would be a cosmetic label, not a real
-- control, so this migration adds a shared private.organization_is_operable(org_id) helper
-- and threads it into the organization's own highest-value write paths: creating a
-- program, inviting an organization member, inviting a researcher to a program, submitting
-- a program for review, and changing a member's role. A researcher's own actions inside an
-- ALREADY-JOINED program (submit_report, retest/mediation responses, evidence) are
-- deliberately NOT gated here -- halting those belongs to per-program pause_program
-- (already real, per 202608300001), not to the organization's suspension switch, and
-- conflating the two would mean a platform admin's org-suspension decision instantly (and
-- silently) blocks researchers from responding to already-open reports, which is a bigger
-- and less reversible blast radius than this slice intends. This is a disclosed scope
-- boundary, not an oversight.
--
-- Also deliberately NOT gated in this slice: pause_program/resume_program/close_program
-- (an organization should still be able to pause or close its own program while
-- suspended -- that only narrows what researchers can do, it doesn't let the org do
-- anything new) and the bounty/payment RPCs (finalize_bounty, adjust_bounty,
-- create_payment_obligation, initiate_manual_payment_attempt) -- an organization already
-- owes a payout for a resolved report regardless of a later suspension, and blocking
-- payment specifically would punish researchers awaiting money rather than the
-- organization being disciplined. Threading the gate into money-movement RPCs is real
-- future work, disclosed here rather than silently assumed handled.
--
-- Dual control: 0026 names "suspending an organization" as one of exactly two actions
-- requiring two distinct platform admins, not one unilateral actor -- the single highest
-- blast-radius item on that list. This slice does NOT implement dual control, following
-- 0027's own precedent of shipping the single-admin version first and disclosing the gap
-- explicitly rather than silently assuming it away. A single platform admin can suspend or
-- reinstate an organization. A future slice would need a real propose/confirm two-admin
-- mechanism for this specific action; none exists today for any platform-admin action in
-- this schema.

-- ---------------------------------------------------------------------------
-- private.organization_is_operable: the one new shared helper. 'created' counts as
-- operable (it is not currently reachable in practice -- create_organization always
-- inserts 'active' directly -- but a status this schema already defines as a non-suspended
-- state should not be silently treated as blocked by a control this migration adds).
-- ---------------------------------------------------------------------------

create or replace function private.organization_is_operable(target_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select status <> 'suspended' from public.organizations where id = target_org_id),
    false
  );
$$;

revoke all on function private.organization_is_operable(uuid) from public;

-- ---------------------------------------------------------------------------
-- suspend_organization / reinstate_organization: platform-admin-only, real audit trail.
-- ---------------------------------------------------------------------------

create or replace function public.suspend_organization(target_org_id uuid, p_reason text)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  org public.organizations;
  updated public.organizations;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to suspend an organization' using errcode = '42501';
  end if;

  select * into org from public.organizations where id = target_org_id for update;
  if org.id is null then raise exception 'ORGANIZATION_NOT_FOUND: organization not found' using errcode = 'P0002'; end if;

  if org.status = 'suspended' then
    raise exception 'ALREADY_SUSPENDED: this organization is already suspended' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_SUSPENSION: explain why this organization is being suspended' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_SUSPENSION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.organizations set status = 'suspended', updated_at = now() where id = target_org_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'platform.organization_suspended', 'organization', target_org_id, jsonb_build_object('reason', trimmed_reason));

  return updated;
end;
$$;

revoke all on function public.suspend_organization(uuid, text) from public;
grant execute on function public.suspend_organization(uuid, text) to authenticated;

create or replace function public.reinstate_organization(target_org_id uuid, p_reason text)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  org public.organizations;
  updated public.organizations;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to reinstate an organization' using errcode = '42501';
  end if;

  select * into org from public.organizations where id = target_org_id for update;
  if org.id is null then raise exception 'ORGANIZATION_NOT_FOUND: organization not found' using errcode = 'P0002'; end if;

  if org.status <> 'suspended' then
    raise exception 'NOT_SUSPENDED: this organization is not currently suspended' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_REINSTATEMENT: explain why this organization is being reinstated' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REINSTATEMENT: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.organizations set status = 'active', updated_at = now() where id = target_org_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'platform.organization_reinstated', 'organization', target_org_id, jsonb_build_object('reason', trimmed_reason));

  return updated;
end;
$$;

revoke all on function public.reinstate_organization(uuid, text) from public;
grant execute on function public.reinstate_organization(uuid, text) to authenticated;

create or replace function public.list_suspended_organizations_for_admin()
returns table (id uuid, name text, suspended_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select o.id, o.name, o.updated_at
  from public.organizations o
  where o.status = 'suspended'
  order by o.updated_at desc;
end;
$$;

revoke all on function public.list_suspended_organizations_for_admin() from public;
grant execute on function public.list_suspended_organizations_for_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- create_program, redefined: identical to 202609030002's version plus one new check,
-- inserted immediately after the existing has_org_role authorization (an org actor who
-- isn't even authorized to create a program should still see FORBIDDEN first, not a
-- suspension-specific message that leaks operational status to someone with no standing).
-- ---------------------------------------------------------------------------

create or replace function public.create_program(target_org_id uuid, program_name text, p_idempotency_key uuid default null, p_program_type public.program_type default 'bounty')
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(program_name);
  new_program public.programs;
  existing public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot create a program in this organization' using errcode = '42501';
  end if;

  if not private.organization_is_operable(target_org_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot create programs' using errcode = '42501';
  end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_NAME: Enter a program name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 160 then
    raise exception 'INVALID_NAME: Use 160 characters or fewer.' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into existing from public.programs
      where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
    if existing.id is not null then
      return existing;
    end if;
  end if;

  begin
    insert into public.programs (organization_id, name, created_by, idempotency_key, program_type)
    values (target_org_id, trimmed_name, actor, p_idempotency_key, p_program_type)
    returning * into new_program;
  exception
    when unique_violation then
      select * into existing from public.programs
        where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
      if existing.id is not null then
        return existing;
      end if;
      raise;
  end;

  insert into public.program_members (program_id, organization_id, user_id, role, added_by)
  values (new_program.id, target_org_id, actor, 'manager', actor);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'program.created', 'program', new_program.id, jsonb_build_object('name', trimmed_name, 'program_type', p_program_type));

  return new_program;
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_organization_member, redefined: identical to 202608290006's version plus the
-- same operability check, inserted right after authorization and before the rate-limit
-- side effect would otherwise consume the actor's budget for a call that was always going
-- to fail.
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

  if not private.organization_is_operable(target_org_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot invite members' using errcode = '42501';
  end if;

  if not private.check_and_consume_rate_limit('org_invite:' || actor::text, 20, 3600) then
    raise exception 'RATE_LIMITED: too many invitations sent recently, try again later' using errcode = '53400';
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

-- ---------------------------------------------------------------------------
-- invite_researcher_to_program, redefined: identical to 202608290006's version plus the
-- same operability check, same placement rationale as invite_organization_member above.
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

  if not private.organization_is_operable(program.organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot invite researchers' using errcode = '42501';
  end if;

  if not private.check_and_consume_rate_limit('program_invite:' || actor::text, 20, 3600) then
    raise exception 'RATE_LIMITED: too many invitations sent recently, try again later' using errcode = '53400';
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
-- submit_program_for_review, redefined: identical to 202608300001's version plus the same
-- operability check -- a suspended organization should not be able to push a NEW program
-- toward launch (activate_program itself is already platform-admin-only per
-- 202609050013, so this closes the one remaining org-initiated step in that pipeline).
-- ---------------------------------------------------------------------------

create or replace function public.submit_program_for_review(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if not private.organization_is_operable(program.organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot submit a program for review' using errcode = '42501';
  end if;

  if not private.is_valid_program_transition(program.status, 'review') then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program cannot be submitted for review from its current state' using errcode = '23514';
  end if;

  update public.programs set status = 'review', updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.submitted_for_review', 'program', target_program_id, jsonb_build_object('previous_status', program.status));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- change_member_role, redefined: identical to 202608260001's version plus the same
-- operability check, inserted after the owner-only authorization check (an actor with no
-- standing still sees FORBIDDEN first) and before the remaining-owners lock.
-- ---------------------------------------------------------------------------

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

  if not private.organization_is_operable(target_org_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot change member roles' using errcode = '42501';
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
