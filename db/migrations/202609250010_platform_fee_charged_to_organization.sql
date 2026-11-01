-- The platform fee is charged to the ORGANIZATION on top of the bounty, not deducted from
-- the researcher's payout (product decision, 2026-09-25). 202609250001 had it the other
-- way: the researcher netted amount - fee, and the manual payout requested that net figure.
--
-- Now:
--   amount_minor_units        the finalized bounty -- the researcher receives ALL of it
--   platform_fee_minor_units  20% of the bounty (still frozen at obligation creation by
--                             create_payment_obligation, unchanged), billed to the org
--   org's total due           amount_minor_units + platform_fee_minor_units (computed,
--                             never stored, so the three can't drift apart)
--
-- Only initiate_manual_payment_attempt changes: the operator transfers the full bounty to
-- the researcher. Attempts recorded before this migration keep the net figure they were
-- created with -- that is what was actually requested then; payment history is not rewritten.

comment on column public.payment_obligations.platform_fee_minor_units is
  'Platform fee billed to the organization ON TOP of amount_minor_units (20% of the bounty, frozen at creation). Never deducted from the researcher, who receives amount_minor_units in full. Org total due = amount + fee.';

create or replace function public.initiate_manual_payment_attempt(target_obligation_id uuid)
returns public.payment_attempts
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  obligation public.payment_obligations;
  next_attempt_number integer;
  attempt public.payment_attempts;
begin
  obligation := private.lock_and_authorize_obligation_for_finance(target_obligation_id);

  if obligation.status = 'processing' then
    raise exception 'PAYMENT_ALREADY_PROCESSING: an attempt is already in progress for this obligation' using errcode = '23514';
  end if;
  if obligation.status in ('succeeded', 'cancelled') then
    raise exception 'PAYMENT_NOT_ELIGIBLE_FOR_ATTEMPT: this obligation is % and cannot receive a new attempt', obligation.status using errcode = '23514';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into next_attempt_number from public.payment_attempts where payment_obligation_id = target_obligation_id;

  -- The full bounty: the fee is the organization's charge, not the researcher's.
  insert into public.payment_attempts (payment_obligation_id, attempt_number, provider, state, requested_amount_minor_units, currency)
  values (target_obligation_id, next_attempt_number, 'manual', 'requires_operator_action', obligation.amount_minor_units, obligation.currency)
  returning * into attempt;

  update public.payment_obligations set status = 'processing', updated_at = now() where id = target_obligation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, obligation.organization_id, 'payment.initiated', 'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'attempt_id', attempt.id, 'attempt_number', next_attempt_number, 'provider', 'manual',
                       'amount_minor_units', obligation.amount_minor_units, 'platform_fee_minor_units', obligation.platform_fee_minor_units));

  return attempt;
end;
$$;
