-- Program-level KYC requirement, enforced as a real access gate. Per explicit product
-- direction this session: KYC is not merely a post-bounty nudge -- an organization can
-- require it before a researcher can even join or submit to a specific program, mirroring
-- HackerOne's own Clear/background-check-gated-program model (docs/decisions/0075).
--
-- Gate point: private.researcher_has_verified_kyc() is the one shared primitive, checked
-- at both join time (join_public_program, accept_program_invitation,
-- accept_program_invitation_by_id) and submission time (submit_report) -- a program
-- could theoretically flip requires_kyc on AFTER a researcher already joined, so
-- submission is re-checked independently rather than relying on the join-time check alone
-- ever being sufficient. "Verified" means at least one GOVERNMENT-ID field (Aadhaar, PAN,
-- or passport) is public.kyc_status = 'verified' -- phone verification alone does not
-- count, since phone is not an identity-verification signal for a program's own
-- compliance purposes. This mirrors get_my_kyc_status's own real per-field shape; no new
-- aggregate "kyc_complete" column is introduced, since the definition of "verified enough"
-- is specifically a program-access decision, not a fact to store per-researcher.

alter table public.programs add column requires_kyc boolean not null default false;

create or replace function private.researcher_has_verified_kyc(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.researcher_kyc
    where user_id = target_user_id
      and (aadhaar_status = 'verified' or pan_status = 'verified' or passport_status = 'verified')
  );
$$;

revoke all on function private.researcher_has_verified_kyc(uuid) from public;

-- ---------------------------------------------------------------------------
-- join_public_program, redefined: identical to 202608310002's version plus one new
-- check, inserted after the existing is_suspended check and before the program lookup
-- resolves, matching the file's own ordering convention (account-level gates before
-- program-level gates).
-- ---------------------------------------------------------------------------

create or replace function public.join_public_program(target_program_id uuid)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_suspended boolean;
  program public.programs;
  existing public.program_researchers;
  new_row public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

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
$$;

-- ---------------------------------------------------------------------------
-- accept_program_invitation / accept_program_invitation_by_id, redefined: identical to
-- 202608260006's versions plus the same KYC check, added right after the invitation is
-- resolved as valid (email match confirmed) and before the participation row is written --
-- an invited researcher without required KYC gets a clear, specific rejection rather than
-- silently becoming a participant of a program they can't actually submit to.
-- ---------------------------------------------------------------------------

create or replace function public.accept_program_invitation(token_hash_input text)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.program_invitations;
  program public.programs;
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
  invitation public.program_invitations;
  program public.programs;
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
-- submit_report, redefined: identical to 202609010001's version plus the same KYC check
-- -- re-checked independently at submission time, since a program could flip
-- requires_kyc on after a researcher already joined, and because a researcher's own
-- verified status could theoretically be revoked (admin_decrypt_kyc_field's review flow)
-- between joining and submitting.
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
  program public.programs;
  trimmed_title text := trim(p_title);
  trimmed_description text := trim(p_description);
  trimmed_impact text := trim(p_impact);
  canon record;
  match_result record;
  new_report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

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

-- ---------------------------------------------------------------------------
-- set_program_kyc_requirement: the org-side toggle. Same narrow authorization as every
-- other program-policy mutation (owner/security_admin or a program member).
-- ---------------------------------------------------------------------------

create or replace function public.set_program_kyc_requirement(target_program_id uuid, p_requires_kyc boolean)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(target_program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage this program' using errcode = '42501';
  end if;

  update public.programs set requires_kyc = p_requires_kyc, updated_at = now() where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.kyc_requirement_set', 'program', target_program_id, jsonb_build_object('requires_kyc', p_requires_kyc));

  return updated;
end;
$$;

revoke all on function public.set_program_kyc_requirement(uuid, boolean) from public;
grant execute on function public.set_program_kyc_requirement(uuid, boolean) to authenticated;
