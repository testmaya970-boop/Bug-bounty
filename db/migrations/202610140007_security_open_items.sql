-- The remaining open items from the Oct 13 security test:
--
-- 1. Functions returning a users row blank password_hash first; the hash never leaves the DB.
-- 2. A chosen display name can't copy another active account's (impersonation in org views).
-- 3. Platform staff can't join programs, accept program invitations or submit reports.
-- 4. A disclosed report from a private program shows "Private program", not its name.
-- 5. A platform admin settling a dispute can cancel an award the researcher accepted
--    (organizations still can't); list_disputed_obligations_for_admin feeds that screen.

CREATE OR REPLACE FUNCTION public.update_my_display_name(p_display_name text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(p_display_name);
  updated public.users;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_DISPLAY_NAME: Enter a display name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 100 then
    raise exception 'INVALID_DISPLAY_NAME: Use 100 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_DISPLAY_NAME: Display name contains invalid characters.' using errcode = '22023';
  end if;

  if exists (select 1 from public.users u where u.id <> actor and u.deactivated_at is null and lower(u.display_name) = lower(trimmed_name)) then
    raise exception 'DISPLAY_NAME_TAKEN: that name is already used by another account -- choose another' using errcode = '22023';
  end if;

  update public.users set display_name = trimmed_name, updated_at = now() where id = actor returning * into updated;

  updated.password_hash := null; -- never leaves the database
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.set_my_public_username(p_username text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  normalized text := lower(trim(coalesce(p_username, '')));
  updated public.users;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if normalized = '' then
    -- Explicit clear: a researcher may remove their public username, which also removes
    -- their public profile (get_public_researcher_profile below returns nothing for a
    -- username no one holds).
    update public.users set public_username = null, updated_at = now() where id = actor returning * into updated;
    updated.password_hash := null; -- never leaves the database
    return updated;
  end if;

  if normalized !~ '^[a-z0-9-]{3,30}$' then
    raise exception 'INVALID_USERNAME: Use 3-30 lowercase letters, numbers, or hyphens.' using errcode = '22023';
  end if;

  if exists (select 1 from public.users where lower(public_username) = normalized and id <> actor) then
    raise exception 'USERNAME_TAKEN: That username is already in use.' using errcode = '23505';
  end if;

  update public.users set public_username = normalized, updated_at = now() where id = actor returning * into updated;
  updated.password_hash := null; -- never leaves the database
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.suspend_researcher_platform_wide(target_user_id uuid, p_reason text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  updated.password_hash := null; -- never leaves the database
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.reinstate_researcher_platform_wide(target_user_id uuid, p_reason text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if target.id = actor then raise exception 'FORBIDDEN: you cannot reinstate your own account' using errcode = '42501'; end if;

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

  updated.password_hash := null; -- never leaves the database
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.delete_researcher_platform_wide(target_user_id uuid, p_reason text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  target public.users;
  updated public.users;
  revoked_tokens integer;
  ended_sessions integer;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to delete a researcher' using errcode = '42501';
  end if;

  select * into target from public.users where id = target_user_id for update;
  if target.id is null then raise exception 'USER_NOT_FOUND: user not found' using errcode = 'P0002'; end if;
  if target.account_type <> 'researcher' then
    raise exception 'NOT_A_RESEARCHER: only a researcher account can be deleted this way' using errcode = '42501';
  end if;
  if target.deactivated_at is not null then
    raise exception 'ALREADY_DEACTIVATED: this account is already deactivated' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_DELETION: explain why this account is being deleted' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_DELETION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.users
  set deactivated_at = now(), is_suspended = true, display_name = 'Deleted user', public_username = null, updated_at = now()
  where id = target_user_id
  returning * into updated;

  update public.researcher_profiles set biography = null, avatar_path = null, updated_at = now() where user_id = target_user_id;
  delete from public.researcher_payout_details where user_id = target_user_id;
  delete from public.researcher_personal_details where user_id = target_user_id;

  update public.personal_access_tokens set revoked_at = now() where user_id = target_user_id and revoked_at is null;
  get diagnostics revoked_tokens = row_count;
  delete from public.sessions where user_id = target_user_id;
  get diagnostics ended_sessions = row_count;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.researcher_deleted', 'user', target_user_id,
    jsonb_build_object('reason', trimmed_reason, 'revoked_tokens', revoked_tokens, 'ended_sessions', ended_sessions));

  updated.password_hash := null; -- never leaves the database
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.reactivate_account_platform_wide(p_email text, p_reason text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  target public.users;
  updated public.users;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to reactivate an account' using errcode = '42501';
  end if;
  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_REACTIVATION: explain why this account is being reactivated' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REACTIVATION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  select * into target from public.users where email = lower(trim(coalesce(p_email, ''))) for update;
  if target.id is null then raise exception 'USER_NOT_FOUND: no account with that email was found' using errcode = 'P0002'; end if;
  if target.deactivated_at is null then
    raise exception 'NOT_DEACTIVATED: this account is already active' using errcode = '23514';
  end if;
  if exists (select 1 from public.audit_logs a where a.action = 'platform.researcher_deleted' and a.entity_id = target.id) then
    raise exception 'ACCOUNT_DELETED: this account was deleted by a platform admin and cannot be reactivated' using errcode = '42501';
  end if;

  update public.users set deactivated_at = null, updated_at = now() where id = target.id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.account_reactivated', 'user', target.id,
    jsonb_build_object('reason', trimmed_reason, 'deactivated_at', target.deactivated_at));

  updated.password_hash := null; -- never leaves the database
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.create_user(p_email text, p_password_hash text, p_display_name text DEFAULT NULL::text, p_requested_username text DEFAULT NULL::text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_id uuid := gen_random_uuid();
  fallback_username text;
  requested_username text;
  resolved_username text;
  created_row public.users;
begin
  fallback_username := regexp_replace(lower(split_part(p_email, '@', 1)), '[^a-z0-9_]', '_', 'g');
  fallback_username := left(fallback_username, 24) || '_' || left(replace(new_id::text, '-', ''), 6);

  requested_username := nullif(lower(trim(p_requested_username)), '');
  resolved_username := fallback_username;

  -- A chosen display name can't copy another active account's (impersonation). The default
  -- (the email's local part) isn't a choice, so it's exempt.
  if nullif(trim(p_display_name), '') is not null and exists (select 1 from public.users u where u.deactivated_at is null and lower(u.display_name) = lower(trim(p_display_name))) then
    raise exception 'DISPLAY_NAME_TAKEN: that name is already used by another account -- choose another' using errcode = '22023';
  end if;

  if requested_username is not null and requested_username ~ '^[a-z0-9_]{3,32}$' then
    begin
      insert into public.users (id, username, display_name, email, password_hash)
      values (new_id, requested_username, coalesce(p_display_name, split_part(p_email, '@', 1)), lower(p_email), p_password_hash)
      returning * into created_row;
      return created_row;
    exception
      when unique_violation then
        -- The requested username (or the email) is already taken. If it was the email,
        -- re-raise -- signup must fail loudly for a duplicate account, never silently
        -- fall through. If it was only the username, fall through to the auto-derived
        -- one below, which is guaranteed unique because it embeds the account's own id.
        if exists (select 1 from public.users where email = lower(p_email)) then
          raise exception 'EMAIL_TAKEN: an account with that email already exists' using errcode = '23505';
        end if;
        null;
    end;
  end if;

  insert into public.users (id, username, display_name, email, password_hash)
  values (new_id, resolved_username, coalesce(p_display_name, split_part(p_email, '@', 1)), lower(p_email), p_password_hash)
  returning * into created_row;
  return created_row;
exception
  when unique_violation then
    raise exception 'EMAIL_TAKEN: an account with that email already exists' using errcode = '23505';
end;
$function$
;


CREATE OR REPLACE FUNCTION public.join_public_program(target_program_id uuid)
 RETURNS program_researchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_suspended boolean;
  program public.programs;
  existing public.program_researchers;
  new_row public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- Platform staff judge disputes, KYC and payouts; they never take part as researchers.
  if exists (select 1 from public.platform_admins pa where pa.user_id = actor) then
    raise exception 'FORBIDDEN: platform staff accounts can''t join programs or submit reports' using errcode = '42501';
  end if;

  select is_suspended into actor_suspended from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot join a program right now' using errcode = '42501';
  end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null or program.visibility <> 'public' or program.status <> 'active' then
    raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002';
  end if;

  if program.requires_kyc and not private.researcher_has_verified_kyc(actor) then
    raise exception 'KYC_REQUIRED: this program requires identity verification before you can join' using errcode = '42501';
  end if;

  select * into existing from public.program_researchers where program_id = target_program_id and user_id = actor;
  if found then
    if existing.status = 'active' then
      return existing;
    end if;
    raise exception 'ACCESS_UNAVAILABLE: your access to this program is not currently active' using errcode = '42501';
  end if;

  insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by)
  values (target_program_id, program.organization_id, actor, 'active', 'public', null)
  returning * into new_row;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'researcher.joined_public_program', 'program_researchers', target_program_id, jsonb_build_object('user_id', actor));

  return new_row;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.accept_program_invitation(token_hash_input text)
 RETURNS program_researchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_email text;
  actor_suspended boolean;
  invitation public.program_invitations;
  program public.programs;
  participation public.program_researchers;
  existing public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- Platform staff judge disputes, KYC and payouts; they never take part as researchers.
  if exists (select 1 from public.platform_admins pa where pa.user_id = actor) then
    raise exception 'FORBIDDEN: platform staff accounts can''t join programs or submit reports' using errcode = '42501';
  end if;

  select is_suspended, case when email_verified_at is not null then email end into actor_suspended, actor_email from public.users where id = actor;
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

  -- An invitation sent before this researcher was suspended or revoked must not undo that.
  select * into existing from public.program_researchers where program_id = invitation.program_id and user_id = actor;
  if existing.status in ('suspended', 'revoked') and greatest(existing.suspended_at, existing.revoked_at) >= invitation.created_at then
    raise exception 'INVITATION_SUPERSEDED: you were removed from this program after this invitation was sent' using errcode = '42501';
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
$function$
;


CREATE OR REPLACE FUNCTION public.accept_program_invitation_by_id(invitation_id uuid)
 RETURNS program_researchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_email text;
  actor_suspended boolean;
  invitation public.program_invitations;
  program public.programs;
  participation public.program_researchers;
  existing public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- Platform staff judge disputes, KYC and payouts; they never take part as researchers.
  if exists (select 1 from public.platform_admins pa where pa.user_id = actor) then
    raise exception 'FORBIDDEN: platform staff accounts can''t join programs or submit reports' using errcode = '42501';
  end if;

  select is_suspended, case when email_verified_at is not null then email end into actor_suspended, actor_email from public.users where id = actor;
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

  -- An invitation sent before this researcher was suspended or revoked must not undo that.
  select * into existing from public.program_researchers where program_id = invitation.program_id and user_id = actor;
  if existing.status in ('suspended', 'revoked') and greatest(existing.suspended_at, existing.revoked_at) >= invitation.created_at then
    raise exception 'INVITATION_SUPERSEDED: you were removed from this program after this invitation was sent' using errcode = '42501';
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
$function$
;


CREATE OR REPLACE FUNCTION public.submit_report(target_program_id uuid, p_asset_type program_asset_type, target_input text, p_title text, p_description text, p_weakness_type report_weakness_type, p_impact text, p_researcher_severity report_severity DEFAULT NULL::report_severity)
 RETURNS reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Platform staff judge disputes, KYC and payouts; they never take part as researchers.
  if exists (select 1 from public.platform_admins pa where pa.user_id = actor) then
    raise exception 'FORBIDDEN: platform staff accounts can''t join programs or submit reports' using errcode = '42501';
  end if;

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
$function$
;


CREATE OR REPLACE FUNCTION public.get_public_disclosure(target_report_id uuid)
 RETURNS TABLE(report_id uuid, published_title text, published_summary text, severity report_severity, program_id uuid, program_name text, organization_id uuid, organization_name text, researcher_username text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select d.report_id, d.published_title, d.published_summary, d.published_severity,
    p.id, case when p.visibility = 'public' then p.name else 'Private program' end, o.id, o.name,
    case when u.public_username is not null and u.deactivated_at is null and not u.is_suspended then u.public_username end,
    d.published_at
  from public.report_disclosures d
  join public.reports r on r.id = d.report_id
  join public.programs p on p.id = r.program_id
  join public.organizations o on o.id = r.organization_id
  join public.users u on u.id = r.researcher_id
  where d.report_id = target_report_id and d.status = 'approved' and d.published_at <= now() and o.status <> 'suspended';
$function$
;


CREATE OR REPLACE FUNCTION public.list_public_disclosures(p_limit integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(report_id uuid, published_title text, published_summary text, severity report_severity, program_id uuid, program_name text, organization_id uuid, organization_name text, researcher_username text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select d.report_id, d.published_title, d.published_summary, d.published_severity,
    p.id, case when p.visibility = 'public' then p.name else 'Private program' end, o.id, o.name,
    case when u.public_username is not null and u.deactivated_at is null and not u.is_suspended then u.public_username end,
    d.published_at
  from public.report_disclosures d
  join public.reports r on r.id = d.report_id
  join public.programs p on p.id = r.program_id
  join public.organizations o on o.id = r.organization_id
  join public.users u on u.id = r.researcher_id
  where d.status = 'approved' and d.published_at <= now() and o.status <> 'suspended'
    and (p_before is null or d.published_at < p_before)
  order by d.published_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$function$
;


CREATE OR REPLACE FUNCTION public.cancel_payment_obligation(target_obligation_id uuid, p_reason text)
 RETURNS payment_obligations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  obligation public.payment_obligations;
  trimmed_reason text := trim(coalesce(p_reason, ''));
  updated public.payment_obligations;
  is_admin boolean := private.is_platform_admin();
begin
  -- A platform admin settling a dispute may cancel any live payment; everyone else goes
  -- through the organization finance-role check.
  if is_admin then
    select * into obligation from public.payment_obligations where id = target_obligation_id for update;
    if obligation.id is null then raise exception 'OBLIGATION_NOT_FOUND: payment obligation not found' using errcode = 'P0002'; end if;
  else
    obligation := private.lock_and_authorize_obligation_for_finance(target_obligation_id);
  end if;

  if obligation.status not in ('pending', 'failed') then
    raise exception 'PAYMENT_NOT_CANCELLABLE: only a pending or failed payment obligation can be cancelled' using errcode = '23514';
  end if;
  if not is_admin and exists (select 1 from public.bounty_acceptances a where a.report_id = obligation.report_id and a.researcher_id = obligation.researcher_id) then
    raise exception 'BOUNTY_ACCEPTED: the researcher accepted this award -- only Unpatched can change it, through a dispute' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_PAYMENT_CANCELLATION: explain why this payment obligation is being cancelled' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_PAYMENT_CANCELLATION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.payment_obligations set status = 'cancelled', updated_at = now() where id = target_obligation_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, obligation.organization_id, 'payment.cancelled', 'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'reason', trimmed_reason));

  return updated;
end;
$function$
;


create or replace function public.list_disputed_obligations_for_admin()
returns table (obligation_id uuid, organization_id uuid, organization_name text, program_id uuid, report_id uuid, report_title text, researcher_name text,
  amount_minor_units bigint, platform_fee_minor_units bigint, currency text, obligation_status text, mediation_status public.report_mediation_status)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select o.id, o.organization_id, org.name, o.program_id, o.report_id, r.title, u.display_name,
    o.amount_minor_units, o.platform_fee_minor_units, o.currency, o.status, m.status
  from public.payment_obligations o
  join public.reports r on r.id = o.report_id
  join public.organizations org on org.id = o.organization_id
  join public.users u on u.id = o.researcher_id
  join lateral (select m.status from public.report_mediations m where m.report_id = o.report_id and m.status in ('open', 'escalated') order by m.opened_at desc limit 1) m on true
  where o.status in ('pending', 'failed')
  order by o.created_at;
end;
$$;
revoke all on function public.list_disputed_obligations_for_admin() from public, anon;
grant execute on function public.list_disputed_obligations_for_admin() to authenticated;
