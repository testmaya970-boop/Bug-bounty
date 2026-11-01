-- Grey-box test findings (Oct 13), money and platform-admin self-dealing:
--
-- 1. finalize_bounty refuses an award the prepaid balance can't cover (bounty + 20% fee).
--    Before, only the later payment step checked, so a researcher could be told of an
--    unfunded bounty.
-- 2. An organization can't cancel a payment once the researcher accepted the award -- that
--    clawed the money back into the balance. Disputes go through mediation.
-- 3. A platform admin can't review their own KYC, reinstate their own account, decide an
--    escalated mediation or retest on their own report, or record a payout to themselves.
-- 4. One bank reference is credited once whatever method it is reported under, and
--    deposits are INR or USD only (the two currencies with funding instructions).

CREATE OR REPLACE FUNCTION public.finalize_bounty(target_report_id uuid, p_amount_minor_units bigint, p_note text)
 RETURNS report_bounty_decisions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  trimmed_note text := nullif(trim(coalesce(p_note, '')), '');
  updated public.report_bounty_decisions;
  remaining bigint;
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

  -- The award must be funded (202610140004): refuse it here, not only later at payment
  -- creation, so a researcher is never told of a bounty the balance can't cover.
  -- ponytail: checked, not reserved -- another award can still spend the money before this
  -- one's payment is created (that insert re-checks under the same lock).
  if p_amount_minor_units > 0 then
    perform pg_advisory_xact_lock(hashtextextended('org_balance:' || report.organization_id || ':' || decision.currency, 0));
    select b.available into remaining from private.organization_balance(report.organization_id) b where b.currency = decision.currency;
    if coalesce(remaining, 0) < p_amount_minor_units + (p_amount_minor_units * 2000) / 10000 then
      raise exception 'INSUFFICIENT_BALANCE: this bounty needs % % with the platform fee but the % balance has % available -- add funds first',
        decision.currency, round((p_amount_minor_units + (p_amount_minor_units * 2000) / 10000) / 100.0, 2), decision.currency, round(coalesce(remaining, 0) / 100.0, 2)
        using errcode = '23514';
    end if;
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
begin
  obligation := private.lock_and_authorize_obligation_for_finance(target_obligation_id);

  if obligation.status not in ('pending', 'failed') then
    raise exception 'PAYMENT_NOT_CANCELLABLE: only a pending or failed payment obligation can be cancelled' using errcode = '23514';
  end if;
  if exists (select 1 from public.bounty_acceptances a where a.report_id = obligation.report_id and a.researcher_id = obligation.researcher_id) then
    raise exception 'BOUNTY_ACCEPTED: the researcher accepted this award -- it can only be changed through mediation' using errcode = '23514';
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


CREATE OR REPLACE FUNCTION public.review_kyc_field(target_user_id uuid, p_field text, p_decision kyc_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin required' using errcode = '42501'; end if;
  if target_user_id = actor then raise exception 'FORBIDDEN: you cannot review your own KYC' using errcode = '42501'; end if;
  if p_field not in ('phone', 'aadhaar', 'pan', 'passport') then
    raise exception 'INVALID_FIELD: unknown KYC field' using errcode = '22023';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'INVALID_DECISION: decision must be verified or rejected' using errcode = '22023';
  end if;

  update public.researcher_kyc set
    phone_status = case when p_field = 'phone' then p_decision else phone_status end,
    aadhaar_status = case when p_field = 'aadhaar' then p_decision else aadhaar_status end,
    pan_status = case when p_field = 'pan' then p_decision else pan_status end,
    passport_status = case when p_field = 'passport' then p_decision else passport_status end,
    reviewed_at = now(),
    reviewed_by = actor,
    review_note = coalesce(nullif(trim(p_note), ''), review_note),
    updated_at = now()
  where user_id = target_user_id;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'NOT_FOUND: no KYC submission for this researcher' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'kyc.field_reviewed', 'researcher_kyc', target_user_id, jsonb_build_object('field', p_field, 'decision', p_decision));
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

  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.resolve_escalated_report_mediation(target_mediation_id uuid, p_outcome report_mediation_status, p_resolution_notes text)
 RETURNS report_mediations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  mediation public.report_mediations;
  trimmed_notes text := trim(coalesce(p_resolution_notes, ''));
  updated public.report_mediations;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  select * into mediation from public.report_mediations where id = target_mediation_id for update;
  if mediation.id is null then raise exception 'MEDIATION_NOT_FOUND: mediation request not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.reports r where r.id = mediation.report_id and r.researcher_id = auth.uid()) then
    raise exception 'FORBIDDEN: you cannot decide a dispute about your own report' using errcode = '42501';
  end if;

  if mediation.status <> 'escalated' then
    raise exception 'MEDIATION_NOT_ESCALATED: only an escalated mediation can be resolved this way' using errcode = '23514';
  end if;

  if p_outcome not in ('resolved', 'declined') then
    raise exception 'INVALID_MEDIATION_OUTCOME: outcome must be resolved or declined' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) = 0 then
    raise exception 'INVALID_MEDIATION_OUTCOME: explain the resolution' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) > 3000 then
    raise exception 'INVALID_MEDIATION_OUTCOME: resolution notes must be 3000 characters or fewer' using errcode = '22023';
  end if;

  update public.report_mediations set
    status = p_outcome,
    resolved_by = actor,
    resolved_at = now(),
    resolution_notes = trimmed_notes
    where id = target_mediation_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, mediation.organization_id, 'platform.mediation_resolved', 'report', mediation.report_id, jsonb_build_object('mediation_id', mediation.id, 'outcome', p_outcome));

  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.resolve_escalated_report_retest(target_retest_id uuid, p_outcome report_retest_status, p_decision_notes text)
 RETURNS report_retests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  retest public.report_retests;
  trimmed_notes text := trim(coalesce(p_decision_notes, ''));
  updated public.report_retests;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  select * into retest from public.report_retests where id = target_retest_id for update;
  if retest.id is null then raise exception 'RETEST_NOT_FOUND: retest request not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.reports r where r.id = retest.report_id and r.researcher_id = auth.uid()) then
    raise exception 'FORBIDDEN: you cannot decide a dispute about your own report' using errcode = '42501';
  end if;

  if retest.status <> 'escalated' then
    raise exception 'RETEST_NOT_ESCALATED: only an escalated retest can be resolved this way' using errcode = '23514';
  end if;

  if p_outcome not in ('confirmed_fixed', 'still_vulnerable') then
    raise exception 'INVALID_RETEST_OUTCOME: outcome must be confirmed_fixed or still_vulnerable' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) = 0 then
    raise exception 'INVALID_RETEST_OUTCOME: explain the decision' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) > 2000 then
    raise exception 'INVALID_RETEST_OUTCOME: decision notes must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.report_retests set
    status = p_outcome,
    decided_by = actor,
    decided_at = now(),
    decision_notes = trimmed_notes
    where id = target_retest_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, retest.organization_id, 'platform.retest_resolved', 'report', retest.report_id, jsonb_build_object('retest_id', retest.id, 'outcome', p_outcome));

  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.record_manual_payment_result(target_attempt_id uuid, p_outcome text, p_provider_reference_id text, p_failure_code text, p_failure_message text)
 RETURNS payment_attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  attempt public.payment_attempts;
  obligation public.payment_obligations;
  trimmed_reference text := nullif(trim(coalesce(p_provider_reference_id, '')), '');
  trimmed_failure_code text := nullif(trim(coalesce(p_failure_code, '')), '');
  trimmed_failure_message text := nullif(trim(coalesce(p_failure_message, '')), '');
  updated public.payment_attempts;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: Unpatched records the result of a payout it sent' using errcode = '42501';
  end if;

  select * into attempt from public.payment_attempts where id = target_attempt_id for update;
  if attempt.id is null then raise exception 'ATTEMPT_NOT_FOUND: payment attempt not found' using errcode = 'P0002'; end if;
  select * into obligation from public.payment_obligations where id = attempt.payment_obligation_id for update;
  if obligation.researcher_id = actor then raise exception 'FORBIDDEN: you cannot record a payout to yourself' using errcode = '42501'; end if;

  if attempt.state <> 'requires_operator_action' then
    raise exception 'ATTEMPT_ALREADY_RESOLVED: this attempt has already recorded a result' using errcode = '23514';
  end if;
  if obligation.status <> 'processing' then
    raise exception 'PAYMENT_NOT_PROCESSING: this obligation is not awaiting an attempt result' using errcode = '23514';
  end if;
  if p_outcome not in ('succeeded', 'failed') then
    raise exception 'INVALID_PAYMENT_OUTCOME: outcome must be succeeded or failed' using errcode = '22023';
  end if;
  if p_outcome = 'succeeded' and trimmed_reference is null then
    raise exception 'INVALID_PAYMENT_OUTCOME: a transfer reference is required when recording a completed payment' using errcode = '22023';
  end if;
  if p_outcome = 'failed' and trimmed_failure_code is null then
    raise exception 'INVALID_PAYMENT_OUTCOME: a failure code is required when recording a failed payment' using errcode = '22023';
  end if;
  if trimmed_failure_message is not null and char_length(trimmed_failure_message) > 500 then
    raise exception 'INVALID_PAYMENT_OUTCOME: failure message must be 500 characters or fewer' using errcode = '22023';
  end if;

  update public.payment_attempts set
    state = p_outcome,
    provider_reference_id = trimmed_reference,
    failure_code = case when p_outcome = 'failed' then trimmed_failure_code else null end,
    failure_message = case when p_outcome = 'failed' then trimmed_failure_message else null end,
    completed_at = now()
    where id = target_attempt_id
    returning * into updated;

  update public.payment_obligations set status = p_outcome, updated_at = now() where id = attempt.payment_obligation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, obligation.organization_id, case when p_outcome = 'succeeded' then 'payment.succeeded' else 'payment.failed' end, 'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'attempt_id', attempt.id, 'amount_minor_units', obligation.amount_minor_units, 'currency', obligation.currency, 'failure_code', trimmed_failure_code));
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.request_organization_deposit(p_organization_id uuid, p_currency text, p_amount_minor_units bigint, p_method text, p_payer_reference text)
 RETURNS organization_deposits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  reference text := upper(trim(coalesce(p_payer_reference, '')));
  deposit public.organization_deposits;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can add funds' using errcode = '42501';
  end if;
  if p_method in ('upi', 'imps', 'neft', 'rtgs') and p_currency <> 'INR' then
    raise exception 'INVALID_DEPOSIT: UPI, IMPS, NEFT and RTGS transfers are in INR only' using errcode = '22023';
  end if;
  if char_length(reference) < 4 then
    raise exception 'INVALID_DEPOSIT: enter the transfer reference your bank gave you (e.g. the UTR)' using errcode = '22023';
  end if;
  if not private.check_and_consume_rate_limit('org_deposit:' || p_organization_id, 20, 86400) then
    raise exception 'RATE_LIMITED: too many deposits reported today -- try again tomorrow' using errcode = '53400';
  end if;
  if exists (select 1 from public.organization_deposits d where upper(d.payer_reference) = reference and d.status <> 'rejected') then
    raise exception 'DEPOSIT_ALREADY_REPORTED: this transfer reference has already been reported' using errcode = '23505';
  end if;

  insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, requested_by)
  values (p_organization_id, p_currency, p_amount_minor_units, p_method, reference, actor)
  returning * into deposit;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'billing.deposit_reported', 'organization', p_organization_id,
    jsonb_build_object('deposit_id', deposit.id, 'currency', deposit.currency, 'amount_minor_units', deposit.amount_minor_units, 'method', deposit.method));
  return deposit;
end;
$function$
;


drop index public.organization_deposits_one_claim_per_reference;
create unique index organization_deposits_one_claim_per_reference on public.organization_deposits (upper(payer_reference)) where status <> 'rejected';
alter table public.organization_deposits add constraint organization_deposits_currency_supported check (currency in ('INR', 'USD'));
