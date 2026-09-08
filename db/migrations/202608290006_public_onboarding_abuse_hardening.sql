-- Public Onboarding Abuse Hardening.
--
-- Applies the existing Postgres-backed rate-limit primitive (private.rate_limit_
-- counters / private.check_and_consume_rate_limit, from 0018) to the three concrete
-- risks the production-hardening audit named as needing to close before opening
-- researcher onboarding: organization invitations, program/researcher invitations, and
-- binary evidence upload. No new rate-limit mechanism is introduced -- this migration
-- reuses the exact primitive, key format, and atomic-upsert semantics 0018 already
-- proved live.
--
-- See docs/decisions/0019-public-onboarding-abuse-hardening.md for the full reasoning
-- behind each chosen limit, the actor-vs-destination abuse distinction, and the
-- fail-open decision re-affirmed per protected action.

-- ---------------------------------------------------------------------------
-- invite_organization_member: redefined, not duplicated, to add exactly one rate-limit
-- check -- every prior line (authorization, the owner-inviting-owner restriction, the
-- insert, the audit log, the pre-existing INVITATION_PENDING destination-level guard via
-- organization_invitations_pending_unique) is unchanged. Keyed by the server-derived
-- actor id, placed immediately after AUTH_REQUIRED -- the identical position
-- submit_report/create_organization already established in 0018, kept consistent rather
-- than inventing a different placement for just this migration. Destination-level abuse
-- (repeated invites to the SAME email) is already closed by the pre-existing unique
-- index; this rate limit is the actor-level control that was missing.
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

  if not private.check_and_consume_rate_limit('org_invite:' || actor::text, 20, 3600) then
    raise exception 'RATE_LIMITED: too many invitations sent recently, try again later' using errcode = '53400';
  end if;

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

-- ---------------------------------------------------------------------------
-- invite_researcher_to_program: redefined identically -- every prior line (the dual
-- org-admin-or-program-manager authorization check, the insert, the pre-existing
-- INVITATION_PENDING guard via program_invitations_pending_unique, the audit log) is
-- unchanged. Keyed by the server-derived actor id, same position as above.
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

  if not private.check_and_consume_rate_limit('program_invite:' || actor::text, 20, 3600) then
    raise exception 'RATE_LIMITED: too many invitations sent recently, try again later' using errcode = '53400';
  end if;

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
-- check_evidence_upload_rate_limit: a new, standalone pre-check RPC, deliberately NOT
-- folded into add_researcher_file_evidence/add_organization_file_evidence. The existing
-- upload flow (services/report-file-evidence.ts) writes bytes to storage BEFORE calling
-- either finalize RPC (0011's bytes-before-row invariant, unchanged) -- if the rate limit
-- were only checked inside the finalize RPC, the expensive storage write would already
-- have happened by the time a rate-limited request was rejected, which is exactly the
-- ordering this task requires NOT to happen. This RPC is called by the TypeScript
-- service FIRST, before any storage I/O -- see the ordering note in
-- services/report-file-evidence.ts. It is check-and-consume in one atomic call (the same
-- "attempt", not "confirmed success", accounting every other rate limit in this schema
-- uses) so a network failure between this check and a completed upload costs the caller
-- one unit of their own budget -- an accepted, ordinary rate-limiter trade-off, not a
-- correctness bug. SECURITY DEFINER for the identical reason check_sign_in_rate_limit
-- and mark_notification_read already are: it needs to safely reach into `private.*`
-- regardless of what the calling role's own grants allow.
-- ---------------------------------------------------------------------------

create or replace function public.check_evidence_upload_rate_limit()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  return private.check_and_consume_rate_limit('evidence_upload:' || actor::text, 20, 3600);
end;
$$;

revoke all on function public.check_evidence_upload_rate_limit() from public;
grant execute on function public.check_evidence_upload_rate_limit() to authenticated;
