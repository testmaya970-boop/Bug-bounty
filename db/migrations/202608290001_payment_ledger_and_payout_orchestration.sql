-- Payment Ledger & Payout Orchestration Foundation. Design decisions recorded here and
-- expanded in docs/decisions/0014-payment-ledger-and-payout-orchestration.md.
--
-- 1. A finalized bounty decision is not itself a payment. Three new concepts, not one:
--    payment_obligations (a financial snapshot, one per finalized bounty decision),
--    payment_attempts (one or more per obligation, the actual payout attempt history).
--    report_bounty_decisions is never altered by this migration -- not one column added,
--    not one row ever updated by any function below.
-- 2. Obligation creation copies amount/currency from the finalized decision exactly once,
--    under a row lock, and never recalculates or re-reads the current bounty policy.
-- 3. The one-to-one invariant (max one obligation per finalized decision) is a real
--    unique constraint (payment_obligations.bounty_decision_id), not application logic --
--    proven under genuine concurrency in this slice's verification.
-- 4. No generic "initiate(provider)" or "updateStatus(status)" RPC exists -- the same
--    anti-pattern 0009 already rejected for report status. Only one provider exists in
--    this slice (manual), so only one initiate RPC exists (initiate_manual_payment_attempt,
--    hardcoding provider = 'manual' -- never a client-supplied parameter). A future
--    provider adds a new RPC (and a new adapter), never a parameter to this one.
-- 5. A payment attempt can only ever be created in a non-terminal state
--    (requires_operator_action for the manual provider). Recording succeeded/failed is a
--    separate, explicit RPC (record_manual_payment_result) -- the database can never be
--    told "this succeeded" as a side effect of initiating it.
-- 6. Only the three states this slice can actually produce are permitted by the
--    payment_attempts.state check constraint (requires_operator_action/succeeded/failed).
--    provider_pending (an async-provider future state) is deliberately NOT included yet --
--    adding a state nothing in this migration can produce would be exactly the
--    "state that sounds useful" anti-pattern the task warns against. A future
--    async-provider slice adds it in its own migration, the same precedent
--    202608270004 already set for report_evidence_type's 'file' value.
-- 7. Every mutation reuses the existing narrow finance authorization -- owner/security_
--    admin only. Payment creation/initiation/cancellation is at least as sensitive as
--    finalizing a bounty, never less. billing_admin gains no new capability here.

-- Composite FK targets, added ahead of the table below that references them.
alter table public.reports add constraint reports_id_researcher_id_key unique (id, researcher_id);
alter table public.report_bounty_decisions add constraint report_bounty_decisions_id_report_id_key unique (id, report_id);

create table public.payment_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null,
  report_id uuid not null,
  researcher_id uuid not null references public.users(id) on delete restrict,
  bounty_decision_id uuid not null unique,
  amount_minor_units bigint not null check (amount_minor_units > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade,
  foreign key (report_id, researcher_id) references public.reports(id, researcher_id),
  foreign key (bounty_decision_id, report_id) references public.report_bounty_decisions(id, report_id)
);

create index payment_obligations_program_id_idx on public.payment_obligations(program_id);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_obligation_id uuid not null references public.payment_obligations(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null check (char_length(provider) between 1 and 40),
  state text not null check (state in ('requires_operator_action', 'succeeded', 'failed')),
  requested_amount_minor_units bigint not null check (requested_amount_minor_units > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider_reference_id text,
  failure_code text check (failure_code is null or char_length(failure_code) between 1 and 100),
  failure_message text check (failure_message is null or char_length(failure_message) <= 500),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_attempts_obligation_attempt_number_key unique (payment_obligation_id, attempt_number),
  constraint payment_attempts_shape_check check (
    (state = 'requires_operator_action' and completed_at is null and failure_code is null and failure_message is null)
    or (state = 'succeeded' and completed_at is not null and failure_code is null and failure_message is null)
    or (state = 'failed' and completed_at is not null and failure_code is not null)
  )
);

create index payment_attempts_obligation_id_idx on public.payment_attempts(payment_obligation_id);

alter table public.payment_obligations enable row level security;
alter table public.payment_attempts enable row level security;

-- Obligations: the submitting researcher reads their own (a safe aggregate status only --
-- no attempt-level detail exists on this table), org oversight or program managers read
-- every obligation for their program -- the same broader-read/narrower-write asymmetry
-- 0013 already established for bounty decisions.
create policy "payment obligations read by researcher, org admins, or program managers" on public.payment_obligations
  for select to authenticated
  using (
    researcher_id = auth.uid()
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

-- Attempts are manager-only: failure_code/failure_message/provider_reference_id are
-- internal operational detail a researcher must never see (SECURITY.md; task section 12).
-- A researcher's safe view is the obligation's own aggregate status, never this table.
create policy "payment attempts read by org admins or program managers only" on public.payment_attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.payment_obligations o
      where o.id = payment_obligation_id
        and (
          private.has_org_role(o.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_member(o.program_id)
        )
    )
  );

grant select on public.payment_obligations, public.payment_attempts to authenticated;
grant select, insert, update, delete on public.payment_obligations, public.payment_attempts to service_role;

-- ---------------------------------------------------------------------------
-- private.lock_and_authorize_obligation_for_finance: the obligation-keyed sibling of
-- 0013's private.lock_and_authorize_report_for_finance -- identical narrow authorization
-- (owner/security_admin only), but locks and derives from payment_obligations instead of
-- reports, since every mutation past creation is keyed by obligation/attempt id, not
-- report id.
-- ---------------------------------------------------------------------------

create or replace function private.lock_and_authorize_obligation_for_finance(target_obligation_id uuid)
returns public.payment_obligations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  obligation public.payment_obligations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into obligation from public.payment_obligations where id = target_obligation_id for update;
  if obligation.id is null then raise exception 'OBLIGATION_NOT_FOUND: payment obligation not found' using errcode = 'P0002'; end if;

  if not private.has_org_role(obligation.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot manage payment obligations for this program' using errcode = '42501';
  end if;

  return obligation;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_payment_obligation: narrow authorization (org owner/security_admin only, via
-- 0013's existing report-finance helper -- reused unchanged). Requires a finalized bounty
-- decision; copies its amount/currency exactly once. Locks both the report row (0013's
-- helper) and the decision row (explicitly, here) so a concurrent finalize_bounty/
-- adjust_bounty/create_payment_obligation race serializes deterministically, and so the
-- "does an obligation already exist" check below is race-free, not merely
-- optimistically checked.
-- ---------------------------------------------------------------------------

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

  insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, amount_minor_units, currency, status)
  values (report.organization_id, report.program_id, target_report_id, report.researcher_id, decision.id, decision.final_amount_minor_units, decision.currency, 'pending')
  returning * into obligation;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'payment.obligation_created', 'report', target_report_id,
    jsonb_build_object('obligation_id', obligation.id, 'amount_minor_units', obligation.amount_minor_units, 'currency', obligation.currency));

  return obligation;
end;
$$;

-- ---------------------------------------------------------------------------
-- initiate_manual_payment_attempt: narrow authorization. Only ever creates an attempt in
-- a non-terminal state -- provider is hardcoded 'manual' (never a parameter), so this
-- function can never be told the payment already succeeded. Legal only from 'pending' or
-- 'failed' (a retry); rejects distinctly from 'processing' (a genuine concurrent race) vs
-- 'succeeded'/'cancelled' (a permanently illegal call), so a client bug is diagnosable.
-- ---------------------------------------------------------------------------

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

  insert into public.payment_attempts (payment_obligation_id, attempt_number, provider, state, requested_amount_minor_units, currency)
  values (target_obligation_id, next_attempt_number, 'manual', 'requires_operator_action', obligation.amount_minor_units, obligation.currency)
  returning * into attempt;

  update public.payment_obligations set status = 'processing', updated_at = now() where id = target_obligation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, obligation.organization_id, 'payment.initiated', 'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'attempt_id', attempt.id, 'attempt_number', next_attempt_number, 'provider', 'manual'));

  return attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_manual_payment_result: narrow authorization. The ONLY path to 'succeeded' or
-- 'failed' -- an explicit, separate operator action, never a side effect of initiation.
-- Idempotency-as-rejection: recording a result on an already-resolved attempt is
-- rejected, not silently accepted or silently overwritten.
-- ---------------------------------------------------------------------------

create or replace function public.record_manual_payment_result(
  target_attempt_id uuid,
  p_outcome text,
  p_provider_reference_id text,
  p_failure_code text,
  p_failure_message text
)
returns public.payment_attempts
language plpgsql security definer set search_path = ''
as $$
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

  select * into attempt from public.payment_attempts where id = target_attempt_id for update;
  if attempt.id is null then raise exception 'ATTEMPT_NOT_FOUND: payment attempt not found' using errcode = 'P0002'; end if;

  obligation := private.lock_and_authorize_obligation_for_finance(attempt.payment_obligation_id);

  if attempt.state <> 'requires_operator_action' then
    raise exception 'ATTEMPT_ALREADY_RESOLVED: this attempt has already recorded a result' using errcode = '23514';
  end if;
  if obligation.status <> 'processing' then
    raise exception 'PAYMENT_NOT_PROCESSING: this obligation is not awaiting an attempt result' using errcode = '23514';
  end if;

  if p_outcome not in ('succeeded', 'failed') then
    raise exception 'INVALID_PAYMENT_OUTCOME: outcome must be succeeded or failed' using errcode = '22023';
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
  values (
    actor, obligation.organization_id,
    case when p_outcome = 'succeeded' then 'payment.succeeded' else 'payment.failed' end,
    'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'attempt_id', attempt.id, 'amount_minor_units', obligation.amount_minor_units, 'currency', obligation.currency, 'failure_code', trimmed_failure_code)
  );

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_payment_obligation: narrow authorization. Legal only from 'pending' or 'failed'
-- -- an in-flight attempt ('processing') must resolve first, and a terminal outcome
-- ('succeeded'/'cancelled') can never be cancelled. Requires a non-empty reason, the same
-- pattern 0013's adjust_bounty already established for a financial correction.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_payment_obligation(target_obligation_id uuid, p_reason text)
returns public.payment_obligations
language plpgsql security definer set search_path = ''
as $$
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
$$;

revoke all on function public.create_payment_obligation(uuid) from public;
revoke all on function public.initiate_manual_payment_attempt(uuid) from public;
revoke all on function public.record_manual_payment_result(uuid, text, text, text, text) from public;
revoke all on function public.cancel_payment_obligation(uuid, text) from public;

grant execute on function public.create_payment_obligation(uuid) to authenticated;
grant execute on function public.initiate_manual_payment_attempt(uuid) to authenticated;
grant execute on function public.record_manual_payment_result(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_payment_obligation(uuid, text) to authenticated;
