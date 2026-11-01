-- A 20% platform fee on every legitimate (finalized, non-zero) bounty payout.
--
-- This is pure ledger math over data the platform already has -- payment_obligations
-- already records the full amount an organization agreed to pay (decision.
-- final_amount_minor_units, unchanged by this migration). It is deliberately NOT the
-- escrow feature discussed alongside it: escrow means the platform actually holds real
-- money in trust until both parties confirm, which requires a real payment provider
-- (see docs/decisions/0063-real-payment-processing-scope.md -- Stripe Connect, not yet
-- wired in, and explicitly scoped-not-built for exactly the reason that faking it would
-- be dishonest state). This migration adds no claim about custody of funds; it only
-- computes what the platform retains and what the researcher nets, on a ledger the
-- platform already owns and already tracks as 'pending'/'processing'/'succeeded'.
--
-- Design: amount_minor_units (the org's full payment) is UNCHANGED -- it is what the org
-- sees, confirms, and pays, and docs/decisions/0077's organization bounty-spend analytics
-- already reads this column directly as "what the org has paid." Changing it to a
-- net-of-fee number would silently make an org's already-confirmed bounty wrong and
-- require touching 0077's RPCs for no real reason. Instead, platform_fee_minor_units is a
-- new column, computed and FROZEN at obligation-creation time (the same "snapshot, don't
-- recompute later" discipline this schema already applies to scope-match state on
-- report submission) -- a future change to the fee rate never retroactively alters an
-- obligation that already exists. The researcher's net payout is a computed value
-- (amount_minor_units - platform_fee_minor_units), never a third stored column that could
-- drift out of sync with the other two.
--
-- Fee rate is a flat 20%, not a per-program configurable value: nothing was asked for
-- beyond "20% fee," and a configurable-per-program rate is speculative flexibility this
-- migration does not build ahead of a real need for it (YAGNI) -- PLATFORM_FEE_BPS below
-- is the one place the rate lives, changeable in a future migration if it should vary.

alter table public.payment_obligations
  add column if not exists platform_fee_minor_units bigint not null default 0 check (platform_fee_minor_units >= 0);

-- Existing rows (created before this migration) keep their fee at 0 -- this migration
-- does not retroactively impose a fee on an obligation that was already created under the
-- old, fee-free rule. Only obligations created from this point forward carry a real fee,
-- computed by the updated create_payment_obligation below.

create or replace function public.create_payment_obligation(target_report_id uuid)
returns public.payment_obligations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  existing public.payment_obligations;
  obligation public.payment_obligations;
  -- 2000 basis points = 20.00%. Integer math throughout (bigint minor units * bps / 10000,
  -- truncating/floor via integer division) -- never floating point, matching every other
  -- money computation in this schema (lib/money.ts's own header comment states the same
  -- rule for the client side). Floor, not round: the platform takes AT MOST 20%, never a
  -- fraction of a cent more than 20% of the amount due to rounding -- the researcher's net
  -- share is never shorted by a rounding direction that favors the platform.
  platform_fee_bps constant integer := 2000;
  fee_amount bigint;
begin
  report := private.lock_and_authorize_report_for_finance(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id for update;
  if decision.id is null or decision.state <> 'finalized' then
    raise exception 'BOUNTY_NOT_FINALIZED: only a finalized bounty decision can create a payment obligation' using errcode = '23514';
  end if;

  if decision.final_amount_minor_units <= 0 then
    raise exception 'NOTHING_TO_PAY: this bounty was finalized at zero, no payment obligation is needed' using errcode = '23514';
  end if;

  select * into existing from public.payment_obligations where bounty_decision_id = decision.id;
  if existing.id is not null then
    raise exception 'OBLIGATION_ALREADY_EXISTS: a payment obligation already exists for this bounty decision' using errcode = '23514';
  end if;

  fee_amount := (decision.final_amount_minor_units * platform_fee_bps) / 10000;

  insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, amount_minor_units, platform_fee_minor_units, currency, status)
  values (report.organization_id, report.program_id, target_report_id, report.researcher_id, decision.id, decision.final_amount_minor_units, fee_amount, decision.currency, 'pending')
  returning * into obligation;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'payment.obligation_created', 'report', target_report_id,
    jsonb_build_object('obligation_id', obligation.id, 'amount_minor_units', obligation.amount_minor_units, 'platform_fee_minor_units', obligation.platform_fee_minor_units, 'currency', obligation.currency));

  return obligation;
end;
$$;

-- initiate_manual_payment_attempt: requested_amount_minor_units now records what the
-- operator actually transfers to the researcher (amount minus the platform fee), not the
-- full obligation amount -- the operator physically wires/pays only the net amount, so a
-- payout-reconciliation record showing the gross figure would be a number nobody ever
-- actually moved. This table is manager/operator-facing only (never visible to a
-- researcher, per its own existing RLS policy), so this changes nothing a researcher sees.
create or replace function public.initiate_manual_payment_attempt(target_obligation_id uuid)
returns public.payment_attempts
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  obligation public.payment_obligations;
  next_attempt_number integer;
  attempt public.payment_attempts;
  net_amount bigint;
begin
  obligation := private.lock_and_authorize_obligation_for_finance(target_obligation_id);

  if obligation.status = 'processing' then
    raise exception 'PAYMENT_ALREADY_PROCESSING: an attempt is already in progress for this obligation' using errcode = '23514';
  end if;
  if obligation.status in ('succeeded', 'cancelled') then
    raise exception 'PAYMENT_NOT_ELIGIBLE_FOR_ATTEMPT: this obligation is % and cannot receive a new attempt', obligation.status using errcode = '23514';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into next_attempt_number from public.payment_attempts where payment_obligation_id = target_obligation_id;

  net_amount := obligation.amount_minor_units - obligation.platform_fee_minor_units;

  insert into public.payment_attempts (payment_obligation_id, attempt_number, provider, state, requested_amount_minor_units, currency)
  values (target_obligation_id, next_attempt_number, 'manual', 'requires_operator_action', net_amount, obligation.currency)
  returning * into attempt;

  update public.payment_obligations set status = 'processing', updated_at = now() where id = target_obligation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, obligation.organization_id, 'payment.initiated', 'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'attempt_id', attempt.id, 'attempt_number', next_attempt_number, 'provider', 'manual', 'net_amount_minor_units', net_amount));

  return attempt;
end;
$$;
