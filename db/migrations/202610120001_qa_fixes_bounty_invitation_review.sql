-- Fixes from the 2026-10-12 QA pass.
--
-- 1. A report with a finalized bounty could be reopened (failed retest), sent to
--    needs_information and then rejected -- and the bounty stayed payable in full. A
--    finalized bounty now pins the report to a valid outcome: the report trigger refuses
--    any move to rejected / not_applicable / informative / duplicate while one exists.
--    (Every status write goes through this trigger, so the finance RPCs need no re-check.)
-- 2. Accepting a program invitation sent BEFORE a suspension or revocation silently
--    re-activated the researcher. Both accept paths now refuse it (a fresh invitation sent
--    after the removal still works -- that is the org deliberately re-inviting).
-- 3. finalize_bounty / adjust_bounty: amounts outside the policy range need a written
--    reason, and anything above 10,000,000.00 (1e9 minor units) is refused -- that also
--    keeps the fee arithmetic in create_payment_obligation far from bigint overflow.
-- 4. Launch review: submitting needs at least one active in-scope asset, and scope is
--    locked while the program is in review, so what goes live is what was approved.

-- 1 -------------------------------------------------------------------------
create or replace function private.enforce_report_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  original public.reports;
begin
  if new.status is distinct from old.status and not private.is_valid_report_transition(old.status, new.status)
     -- The single reopen path: decide_report_retest(still_vulnerable), in this transaction only.
     and not (old.status = 'resolved' and new.status = 'accepted' and current_setting('app.reopening_report', true) = new.id::text) then
    raise exception 'INVALID_TRANSITION: a report cannot move from % to %', old.status, new.status using errcode = '23514';
  end if;

  if new.status is distinct from old.status
     and new.status in ('rejected', 'not_applicable', 'informative', 'duplicate')
     and exists (select 1 from public.report_bounty_decisions d where d.report_id = new.id and d.state = 'finalized') then
    raise exception 'BOUNTY_FINALIZED: this report has a finalized bounty, so it can only be resolved again' using errcode = '23514';
  end if;

  if new.duplicate_of_report_id is not null and new.duplicate_of_report_id is distinct from old.duplicate_of_report_id then
    select * into original from public.reports where id = new.duplicate_of_report_id;
    if original.id is null or original.program_id <> new.program_id then
      raise exception 'INVALID_DUPLICATE: the original report must be in the same program' using errcode = '22023';
    end if;
    if original.submitted_at > new.submitted_at then
      raise exception 'INVALID_DUPLICATE: a report can only duplicate one submitted before it' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- 3 -------------------------------------------------------------------------
create or replace function private.check_bounty_amount(decision public.report_bounty_decisions, p_amount bigint, p_reason text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Amount cannot be negative.' using errcode = '22023';
  end if;
  if p_amount > 1000000000 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Amount cannot be more than 10,000,000.' using errcode = '22023';
  end if;
  if (p_amount < decision.calculated_min_amount_minor_units or p_amount > decision.calculated_max_amount_minor_units) and p_reason is null then
    raise exception 'INVALID_BOUNTY_AMOUNT: This amount is outside the policy range -- add a note explaining why.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_bounty_amount(public.report_bounty_decisions, bigint, text) from public;

create or replace function public.finalize_bounty(target_report_id uuid, p_amount_minor_units bigint, p_note text)
returns public.report_bounty_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  trimmed_note text := nullif(trim(coalesce(p_note, '')), '');
  updated public.report_bounty_decisions;
begin
  report := private.lock_and_authorize_report_for_finance(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id;
  if decision.id is null then
    raise exception 'BOUNTY_NOT_READY: calculate a bounty recommendation before finalizing one' using errcode = '23514';
  end if;
  if decision.state = 'finalized' then
    raise exception 'BOUNTY_ALREADY_FINALIZED: this report''s bounty has already been finalized' using errcode = '23514';
  end if;
  if decision.state = 'ineligible' then
    raise exception 'BOUNTY_NOT_READY: this report is not eligible for a bounty' using errcode = '23514';
  end if;

  perform private.check_bounty_amount(decision, p_amount_minor_units, trimmed_note);
  if trimmed_note is not null and char_length(trimmed_note) > 2000 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Note must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  update public.report_bounty_decisions set
    state = 'finalized', final_amount_minor_units = p_amount_minor_units, finalized_by = actor, finalized_at = now(),
    finalization_note = trimmed_note, updated_at = now()
    where report_id = target_report_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.finalized', 'report', target_report_id,
    jsonb_build_object('amount_minor_units', p_amount_minor_units, 'currency', decision.currency));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('bounty.finalized', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$$;

create or replace function public.adjust_bounty(target_report_id uuid, p_new_amount_minor_units bigint, p_reason text)
returns public.report_bounty_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  trimmed_reason text := trim(coalesce(p_reason, ''));
  updated public.report_bounty_decisions;
begin
  report := private.lock_and_authorize_report_for_finance(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id;
  if decision.id is null or decision.state <> 'finalized' then
    raise exception 'BOUNTY_NOT_FINALIZED: only an already-finalized bounty can be adjusted' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Explain why this bounty is being adjusted.' using errcode = '22023';
  end if;
  perform private.check_bounty_amount(decision, p_new_amount_minor_units, trimmed_reason);
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Reason must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  update public.report_bounty_decisions set
    final_amount_minor_units = p_new_amount_minor_units, finalized_by = actor, finalized_at = now(),
    finalization_note = trimmed_reason, updated_at = now()
    where report_id = target_report_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.adjusted', 'report', target_report_id,
    jsonb_build_object('previous_amount_minor_units', decision.final_amount_minor_units, 'new_amount_minor_units', p_new_amount_minor_units, 'reason', trimmed_reason));

  return updated;
end;
$$;

-- 4 -------------------------------------------------------------------------
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

  if not exists (select 1 from public.program_scope_entries e where e.program_id = target_program_id and e.status = 'active' and e.scope_state = 'in_scope') then
    raise exception 'SCOPE_REQUIRED: add at least one in-scope asset before submitting for review' using errcode = '23514';
  end if;

  update public.programs set status = 'review', updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.submitted_for_review', 'program', target_program_id, jsonb_build_object('previous_status', program.status));

  return updated;
end;
$$;

create or replace function private.lock_scope_during_review()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.programs p where p.id = new.program_id and p.status = 'review') then
    raise exception 'SCOPE_LOCKED_IN_REVIEW: scope can''t change while the program is in launch review' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.lock_scope_during_review() from public;

drop trigger if exists program_scope_entries_lock_during_review on public.program_scope_entries;
create trigger program_scope_entries_lock_during_review
  before insert or update on public.program_scope_entries
  for each row execute function private.lock_scope_during_review();

-- 2 -------------------------------------------------------------------------
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
  existing public.program_researchers;
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
  existing public.program_researchers;
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
$$;
