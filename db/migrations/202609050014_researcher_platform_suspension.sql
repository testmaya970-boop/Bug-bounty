-- Cross-program (platform-wide) researcher suspension. users.is_suspended has existed
-- since 202608250001 and is already CHECKED (join_public_program), but until now nothing
-- could ever SET it -- there was no suspend/reinstate RPC anywhere in the schema. This
-- migration adds the real write path, platform-admin-gated, and closes the remaining gap:
-- join_public_program was the only enforcement point; accept_program_invitation,
-- accept_program_invitation_by_id, and submit_report did not check it at all, so a
-- suspended researcher could still accept an invite or submit a report through those
-- paths. All three now check it, using the exact same pattern join_public_program
-- already established (select is_suspended, coalesce-to-true, FORBIDDEN).
--
-- Dual control: 0026 (Section on platform-admin authority) names "platform-wide-banning
-- a researcher" as one of exactly two actions that should require two distinct platform
-- admins, not one unilateral actor. This slice does NOT implement dual control -- it
-- follows 0027's own explicit precedent (platform_admin grant/revoke is single-admin-only
-- today, disclosed as a known gap rather than silently assumed safe). A single platform
-- admin can suspend or reinstate a researcher. This is a real, disclosed limitation: a
-- future slice would need a propose/confirm two-admin mechanism for this action, which
-- this migration does not build.

create or replace function public.suspend_researcher_platform_wide(target_user_id uuid, p_reason text)
returns public.users
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  target public.users;
  updated public.users;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to suspend a researcher' using errcode = '42501';
  end if;

  select * into target from public.users where id = target_user_id for update;
  if target.id is null then raise exception 'USER_NOT_FOUND: user not found' using errcode = 'P0002'; end if;

  if target.is_suspended then
    raise exception 'ALREADY_SUSPENDED: this account is already suspended' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_SUSPENSION: explain why this account is being suspended' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_SUSPENSION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.users set is_suspended = true, updated_at = now() where id = target_user_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.researcher_suspended', 'user', target_user_id, jsonb_build_object('reason', trimmed_reason));

  return updated;
end;
$$;

revoke all on function public.suspend_researcher_platform_wide(uuid, text) from public;
grant execute on function public.suspend_researcher_platform_wide(uuid, text) to authenticated;

create or replace function public.reinstate_researcher_platform_wide(target_user_id uuid, p_reason text)
returns public.users
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  target public.users;
  updated public.users;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to reinstate a researcher' using errcode = '42501';
  end if;

  select * into target from public.users where id = target_user_id for update;
  if target.id is null then raise exception 'USER_NOT_FOUND: user not found' using errcode = 'P0002'; end if;

  if not target.is_suspended then
    raise exception 'NOT_SUSPENDED: this account is not currently suspended' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_REINSTATEMENT: explain why this account is being reinstated' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REINSTATEMENT: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.users set is_suspended = false, updated_at = now() where id = target_user_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.researcher_reinstated', 'user', target_user_id, jsonb_build_object('reason', trimmed_reason));

  return updated;
end;
$$;

revoke all on function public.reinstate_researcher_platform_wide(uuid, text) from public;
grant execute on function public.reinstate_researcher_platform_wide(uuid, text) to authenticated;

-- list_suspended_researchers_for_admin: the queue a platform admin actually works from.
-- Same shape as every other list_*_for_admin RPC in 0027/this session's escalation work.

create or replace function public.list_suspended_researchers_for_admin()
returns table (
  id uuid,
  username text,
  display_name text,
  email text,
  suspended_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select u.id, u.username, u.display_name, u.email, u.updated_at
  from public.users u
  where u.is_suspended = true
  order by u.updated_at desc;
end;
$$;

revoke all on function public.list_suspended_researchers_for_admin() from public;
grant execute on function public.list_suspended_researchers_for_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- accept_program_invitation / accept_program_invitation_by_id, redefined: identical to
-- 202609050012's versions plus the same is_suspended check join_public_program already
-- uses, added right after auth is confirmed and before the invitation is even looked up
-- (matching join_public_program's own ordering: account-level gates first).
-- ---------------------------------------------------------------------------

create or replace function public.accept_program_invitation(token_hash_input text)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  actor_suspended boolean;
  invitation public.program_invitations;
  program public.programs;
  participation public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select is_suspended, email into actor_suspended, actor_email from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot accept a program invitation right now' using errcode = '42501';
  end if;

  select * into invitation from public.program_invitations where token_hash = token_hash_input for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  select * into program from public.programs where id = invitation.program_id;
  if program.requires_kyc and not private.researcher_has_verified_kyc(actor) then
    raise exception 'KYC_REQUIRED: this program requires identity verification before you can join' using errcode = '42501';
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
  actor_suspended boolean;
  invitation public.program_invitations;
  program public.programs;
  participation public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select is_suspended, email into actor_suspended, actor_email from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot accept a program invitation right now' using errcode = '42501';
  end if;

  select * into invitation from public.program_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  select * into program from public.programs where id = invitation.program_id;
  if program.requires_kyc and not private.researcher_has_verified_kyc(actor) then
    raise exception 'KYC_REQUIRED: this program requires identity verification before you can join' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- submit_report, redefined: identical to 202609050012's version plus the same
-- is_suspended check, added right after auth is confirmed (before the rate limit check,
-- matching join_public_program's "account gates first" convention) -- a suspended
-- researcher's existing reports remain fully intact and readable (read-vs-act, the same
-- distinction the file-evidence suspension behavior already established), only new
-- submissions are blocked.
-- ---------------------------------------------------------------------------

create or replace function public.submit_report(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  target_input text,
  p_title text,
  p_description text,
  p_weakness_type public.report_weakness_type,
  p_impact text,
  p_researcher_severity public.report_severity default null
)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_suspended boolean;
  program public.programs;
  trimmed_title text := trim(p_title);
  trimmed_description text := trim(p_description);
  trimmed_impact text := trim(p_impact);
  canon record;
  match_result record;
  new_report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select is_suspended into actor_suspended from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot submit reports right now' using errcode = '42501';
  end if;

  if not private.check_and_consume_rate_limit('report_submit:' || actor::text, 30, 3600) then
    raise exception 'RATE_LIMITED: too many reports submitted recently, try again later' using errcode = '53400';
  end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not private.is_researcher_authorized_for_program(target_program_id) then
    raise exception 'FORBIDDEN: actor is not an authorized researcher for this program' using errcode = '42501';
  end if;

  if program.status in ('paused', 'closed') then
    raise exception 'SUBMISSIONS_CLOSED: this program is not currently accepting reports' using errcode = '55000';
  end if;

  if program.requires_kyc and not private.researcher_has_verified_kyc(actor) then
    raise exception 'KYC_REQUIRED: this program requires identity verification before you can submit reports' using errcode = '42501';
  end if;

  if trimmed_title is null or char_length(trimmed_title) = 0 then
    raise exception 'INVALID_TITLE: Enter a report title.' using errcode = '22023';
  end if;
  if char_length(trimmed_title) > 200 then
    raise exception 'INVALID_TITLE: Use 200 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_TITLE: Report title contains invalid characters.' using errcode = '22023';
  end if;

  if trimmed_description is null or char_length(trimmed_description) = 0 then
    raise exception 'INVALID_DESCRIPTION: Enter a description.' using errcode = '22023';
  end if;
  if char_length(trimmed_description) > 20000 then
    raise exception 'INVALID_DESCRIPTION: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  if p_weakness_type is null then
    raise exception 'INVALID_WEAKNESS_TYPE: Select the type of weakness you found.' using errcode = '22023';
  end if;

  if trimmed_impact is null or char_length(trimmed_impact) = 0 then
    raise exception 'INVALID_IMPACT: Describe the impact of this finding.' using errcode = '22023';
  end if;
  if char_length(trimmed_impact) > 20000 then
    raise exception 'INVALID_IMPACT: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);
  select * into match_result from private.match_program_scope(target_program_id, p_asset_type, canon.canonical, canon.cidr_value, canon.url_origin, canon.url_path);

  if match_result.matched_entry_id is null or match_result.matched_scope_state <> 'in_scope' then
    raise exception 'TARGET_NOT_ELIGIBLE: This target is not currently eligible for this program.' using errcode = '22023';
  end if;

  insert into public.reports (
    program_id, organization_id, researcher_id, title, description, asset_type, target, display_target,
    matched_scope_entry_id, matched_scope_state, matched_target, weakness_type, impact, researcher_severity
  )
  values (
    target_program_id, program.organization_id, actor, trimmed_title, trimmed_description, p_asset_type, canon.canonical, canon.display,
    match_result.matched_entry_id, match_result.matched_scope_state, match_result.matched_target, p_weakness_type, trimmed_impact, p_researcher_severity
  )
  returning * into new_report;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'report.created', 'report', new_report.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values (
    'report.created', 1, 'report', new_report.id, program.organization_id,
    jsonb_build_object(
      'report_id', new_report.id, 'program_id', target_program_id, 'organization_id', program.organization_id,
      'researcher_id', actor, 'title', trimmed_title, 'asset_type', p_asset_type, 'display_target', canon.display
    )
  );

  return new_report;
end;
$$;
