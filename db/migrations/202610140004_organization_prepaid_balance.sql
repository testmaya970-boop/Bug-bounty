-- Prepaid organization balance: the organization pays Unpatched, Unpatched pays the researcher.
--
-- Until now an organization was told to transfer each bounty to the researcher itself, yet it
-- can never see a researcher's bank or PayPal details (and must not). So the organization now
-- adds funds to a balance per currency; awarding a bounty commits bounty + platform fee against
-- that balance at once and is refused when the balance can't cover it; Unpatched (a payout
-- provider, or a platform admin for manual transfers) pays the researcher.
--
--   available = confirmed deposits - (bounty + fee) of every live balance-funded obligation
--
-- Deposits are reported by the organization (method + the bank's own reference, e.g. a UTR)
-- and confirmed by a platform admin once the money is seen in Unpatched's account. Obligations
-- created before this migration were paid by the organization directly and never touch the
-- balance (funded_from_balance = false).

alter table public.payment_obligations add column funded_from_balance boolean not null default false;
alter table public.payment_obligations alter column funded_from_balance set default true;
comment on column public.payment_obligations.funded_from_balance is
  'True when bounty + fee were committed against the organization''s prepaid balance (every obligation since 202610140004). False for older ones the organization paid directly.';

create table public.organization_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor_units bigint not null check (amount_minor_units > 0 and amount_minor_units <= 100000000000),
  method text not null check (method in ('upi', 'imps', 'neft', 'rtgs', 'wire', 'ach')),
  payer_reference text not null check (char_length(payer_reference) between 4 and 64),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  review_note text check (char_length(review_note) <= 500),
  requested_by uuid not null references public.users (id),
  reviewed_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- India's rails move rupees only.
  constraint organization_deposits_inr_rails check (method not in ('upi', 'imps', 'neft', 'rtgs') or currency = 'INR')
);
-- One bank reference can be credited once, whichever organization claims it.
create unique index organization_deposits_one_claim_per_reference on public.organization_deposits (method, upper(payer_reference)) where status <> 'rejected';
create index organization_deposits_org_idx on public.organization_deposits (organization_id, created_at desc);
create index organization_deposits_pending_idx on public.organization_deposits (created_at) where status = 'pending';

alter table public.organization_deposits enable row level security;
create policy "organization deposits read by finance roles" on public.organization_deposits for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]));
revoke all on public.organization_deposits from public, anon, authenticated;
grant select on public.organization_deposits to authenticated;

-- Per-currency figures for one organization. Callers authorize.
create or replace function private.organization_balance(p_organization_id uuid)
returns table (currency text, deposited bigint, pending_deposits bigint, committed bigint, paid bigint, available bigint)
language sql stable security definer set search_path = ''
as $$
  with d as (
    select d.currency,
      coalesce(sum(d.amount_minor_units) filter (where d.status = 'confirmed'), 0)::bigint as deposited,
      coalesce(sum(d.amount_minor_units) filter (where d.status = 'pending'), 0)::bigint as pending_deposits
    from public.organization_deposits d where d.organization_id = p_organization_id group by d.currency
  ), o as (
    select o.currency,
      coalesce(sum(o.amount_minor_units + o.platform_fee_minor_units) filter (where o.status in ('pending', 'processing', 'failed')), 0)::bigint as committed,
      coalesce(sum(o.amount_minor_units + o.platform_fee_minor_units) filter (where o.status = 'succeeded'), 0)::bigint as paid
    from public.payment_obligations o where o.organization_id = p_organization_id and o.funded_from_balance group by o.currency
  )
  select coalesce(d.currency, o.currency), coalesce(d.deposited, 0), coalesce(d.pending_deposits, 0), coalesce(o.committed, 0), coalesce(o.paid, 0),
    coalesce(d.deposited, 0) - coalesce(o.committed, 0) - coalesce(o.paid, 0)
  from d full join o on o.currency = d.currency
  order by 1;
$$;
revoke all on function private.organization_balance(uuid) from public, anon, authenticated;

-- Every new obligation must fit the balance. The advisory lock serializes awards per
-- organization + currency, so two bounties finalized at the same moment can't both spend the
-- same money; rows inserted earlier in the same transaction (collaborator splits) count.
create or replace function private.guard_obligation_balance()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  remaining bigint;
begin
  if not new.funded_from_balance then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('org_balance:' || new.organization_id || ':' || new.currency, 0));
  select b.available into remaining from private.organization_balance(new.organization_id) b where b.currency = new.currency;
  if coalesce(remaining, 0) < new.amount_minor_units + new.platform_fee_minor_units then
    raise exception 'INSUFFICIENT_BALANCE: this award needs % % (bounty + fee) but the % balance has % available -- add funds first',
      new.currency, (new.amount_minor_units + new.platform_fee_minor_units) / 100.0, new.currency, coalesce(remaining, 0) / 100.0
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger payment_obligations_balance_check before insert on public.payment_obligations
  for each row execute function private.guard_obligation_balance();

create or replace function public.get_organization_balances(p_organization_id uuid)
returns table (currency text, deposited bigint, pending_deposits bigint, committed bigint, paid bigint, available bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can view the balance' using errcode = '42501';
  end if;
  return query select * from private.organization_balance(p_organization_id);
end;
$$;
revoke all on function public.get_organization_balances(uuid) from public, anon;
grant execute on function public.get_organization_balances(uuid) to authenticated;

create or replace function public.request_organization_deposit(p_organization_id uuid, p_currency text, p_amount_minor_units bigint, p_method text, p_payer_reference text)
returns public.organization_deposits
language plpgsql security definer set search_path = ''
as $$
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
  if exists (select 1 from public.organization_deposits d where d.method = p_method and upper(d.payer_reference) = reference and d.status <> 'rejected') then
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
$$;
revoke all on function public.request_organization_deposit(uuid, text, bigint, text, text) from public, anon;
grant execute on function public.request_organization_deposit(uuid, text, bigint, text, text) to authenticated;

create or replace function public.list_pending_deposits_for_admin()
returns table (id uuid, organization_id uuid, organization_name text, currency text, amount_minor_units bigint, method text, payer_reference text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select d.id, d.organization_id, o.name, d.currency, d.amount_minor_units, d.method, d.payer_reference, d.created_at
  from public.organization_deposits d join public.organizations o on o.id = d.organization_id
  where d.status = 'pending' order by d.created_at;
end;
$$;
revoke all on function public.list_pending_deposits_for_admin() from public, anon;
grant execute on function public.list_pending_deposits_for_admin() to authenticated;

create or replace function public.review_organization_deposit(p_deposit_id uuid, p_outcome text, p_note text)
returns public.organization_deposits
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  note text := nullif(trim(coalesce(p_note, '')), '');
  deposit public.organization_deposits;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  if p_outcome not in ('confirmed', 'rejected') then raise exception 'INVALID_OUTCOME: confirmed or rejected' using errcode = '22023'; end if;
  if p_outcome = 'rejected' and note is null then
    raise exception 'INVALID_OUTCOME: say why the deposit is rejected -- the organization sees this note' using errcode = '22023';
  end if;
  select * into deposit from public.organization_deposits where id = p_deposit_id for update;
  if deposit.id is null then raise exception 'DEPOSIT_NOT_FOUND: deposit not found' using errcode = 'P0002'; end if;
  if deposit.status <> 'pending' then raise exception 'DEPOSIT_ALREADY_REVIEWED: this deposit was already %', deposit.status using errcode = '23514'; end if;

  update public.organization_deposits set status = p_outcome, review_note = note, reviewed_by = actor, reviewed_at = now()
  where id = p_deposit_id returning * into deposit;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, deposit.organization_id, 'billing.deposit_' || p_outcome, 'organization', deposit.organization_id,
    jsonb_build_object('deposit_id', deposit.id, 'currency', deposit.currency, 'amount_minor_units', deposit.amount_minor_units));
  return deposit;
end;
$$;
revoke all on function public.review_organization_deposit(uuid, text, text) from public, anon;
grant execute on function public.review_organization_deposit(uuid, text, text) to authenticated;

-- Manual payouts are now sent by Unpatched, so a platform admin sees who to pay. The decrypted
-- details leave the database only for an MFA'd platform admin, and only for payouts waiting on
-- a person (provider payouts never need them shown).
create or replace function public.list_manual_payouts_for_admin()
returns table (attempt_id uuid, organization_id uuid, organization_name text, program_id uuid, report_id uuid, amount_minor_units bigint, currency text,
  started_at timestamptz, researcher_name text, method text, bank_holder text, bank_account_number text, bank_ifsc text, paypal_email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select a.id, ob.organization_id, o.name, ob.program_id, ob.report_id, a.requested_amount_minor_units, a.currency, a.started_at,
    u.display_name, d.method::text, d.bank_account_holder_name,
    case when d.bank_account_number_encrypted is null then null else private.decrypt_sensitive_field(d.bank_account_number_encrypted) end,
    d.bank_ifsc_or_routing, d.paypal_email
  from public.payment_attempts a
  join public.payment_obligations ob on ob.id = a.payment_obligation_id
  join public.organizations o on o.id = ob.organization_id
  join public.users u on u.id = ob.researcher_id
  left join public.researcher_payout_details d on d.user_id = ob.researcher_id
  where a.state = 'requires_operator_action' and ob.status = 'processing'
  order by a.started_at;
end;
$$;
revoke all on function public.list_manual_payouts_for_admin() from public, anon;
grant execute on function public.list_manual_payouts_for_admin() to authenticated;

-- The result of a manual transfer is recorded by whoever made it: Unpatched (a platform
-- admin), no longer the organization. Same checks as before otherwise.
create or replace function public.record_manual_payment_result(target_attempt_id uuid, p_outcome text, p_provider_reference_id text, p_failure_code text, p_failure_message text)
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
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: Unpatched records the result of a payout it sent' using errcode = '42501';
  end if;

  select * into attempt from public.payment_attempts where id = target_attempt_id for update;
  if attempt.id is null then raise exception 'ATTEMPT_NOT_FOUND: payment attempt not found' using errcode = 'P0002'; end if;
  select * into obligation from public.payment_obligations where id = attempt.payment_obligation_id for update;

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
$$;
