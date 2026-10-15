-- Payment features (Oct 15): card funding, GST invoices, low-balance alerts, program budgets,
-- and platform admins alerted when a deposit is reported.
--
-- Card funding: an organization pays by card through a hosted checkout (Razorpay Payment
--   Links for INR, Stripe Checkout for USD, or the in-app sandbox). The provider's signed
--   webhook confirms it, so a card deposit never waits for an admin. The card surcharge the
--   organization paid is stored beside the credited amount.
-- Program budgets: an optional cap per program; an award that would take a program past its
--   cap is refused, under the same lock as the organization balance check.
-- Low-balance alerts: a threshold per currency; crossing below it notifies the finance roles
--   once, re-armed when the balance recovers.
-- Invoices: a monthly invoice per organization and currency for the platform fee on payouts
--   completed in that month. INR carries 18% GST (CGST + SGST within the seller's state,
--   IGST otherwise); USD is zero-rated export of services. Numbered per Indian financial
--   year, immutable once issued, and a fee can be invoiced only once.
--   NOTE: the GST treatment (fee-only supply, bounty as pass-through, export under LUT) must
--   be confirmed by a chartered accountant before real invoices are issued.
-- Notifications: billing.* audit rows become outbox events and billing_activity
--   notifications (deposit reported -> platform admins; the rest -> the org's finance roles).

-- ---------------------------------------------------------------------------
-- Notifications: a billing_activity category
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable',
  'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted', 'report_message_posted', 'program_suspended',
  'program_reinstated', 'organization_suspended', 'organization_reinstated', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded',
  'payment_failed', 'payment_cancelled', 'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided',
  'report_mediation_resolved', 'report_reopened', 'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined',
  'report_disclosure_unpublished',
  'deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued'
]));

alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category = any (array['report_activity', 'bounty_activity', 'platform_activity', 'billing_activity']));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array['report_created', 'report_needs_information', 'report_resolved', 'report_duplicate',
    'report_informative', 'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted',
    'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened',
    'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined', 'report_disclosure_unpublished']))
  or (category = 'bounty_activity' and notification_type = any (array['bounty_finalized', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled']))
  or (category = 'platform_activity' and notification_type = any (array['program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated']))
  or (category = 'billing_activity' and notification_type = any (array['deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued']))
);

alter table public.notifications drop constraint notifications_subject_shape_check;
alter table public.notifications add constraint notifications_subject_shape_check check (
  (category not in ('platform_activity', 'billing_activity') and report_id is not null and program_id is not null)
  or (category = 'platform_activity' and report_id is null and (notification_type in ('program_suspended', 'program_reinstated')) = (program_id is not null))
  or (category = 'billing_activity' and report_id is null and program_id is null)
);

create or replace function private.enqueue_billing_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload, occurred_at)
  values (new.action, 1, new.entity_type, new.entity_id, new.organization_id,
    jsonb_build_object('audit_log_id', new.id, 'organization_id', new.organization_id, 'reason', new.metadata ->> 'summary', 'actor_id', new.actor_id),
    new.created_at);
  return new;
end;
$$;
create trigger audit_logs_enqueue_billing_event
  after insert on public.audit_logs
  for each row
  when (new.action in ('billing.deposit_reported', 'billing.deposit_confirmed', 'billing.deposit_rejected', 'billing.balance_low', 'billing.invoice_issued'))
  execute function private.enqueue_billing_event();

create or replace function public.route_billing_notifications(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
begin
  if p_notification_type not in ('deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued') then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a billing notification type', p_notification_type using errcode = '22023';
  end if;
  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.audit_logs al where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = 'billing.' || p_notification_type) then
    raise exception 'PROVENANCE_MISMATCH: no matching billing record in audit_logs' using errcode = '23514';
  end if;

  if p_notification_type = 'deposit_reported' then
    -- Unpatched's own staff confirm deposits, so they hear about new ones.
    insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
    select pa.user_id, ev.organization_id, null, null, 'billing_activity', p_notification_type, ev.id, ev.occurred_at
    from public.platform_admins pa join public.users u on u.id = pa.user_id
    where u.deactivated_at is null
    on conflict (source_event_id, recipient_id) do nothing;
  else
    insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
    select m.user_id, ev.organization_id, null, null, 'billing_activity', p_notification_type, ev.id, ev.occurred_at
    from public.organization_members m
    where m.organization_id = ev.organization_id and m.status = 'active' and m.role in ('owner', 'security_admin', 'billing_admin')
    on conflict (source_event_id, recipient_id) do nothing;
  end if;
  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;
revoke all on function public.route_billing_notifications(uuid, text) from public, authenticated, anon;
grant execute on function public.route_billing_notifications(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Card deposits
-- ---------------------------------------------------------------------------
alter table public.organization_deposits drop constraint organization_deposits_method_check;
alter table public.organization_deposits add constraint organization_deposits_method_check check (method in ('upi', 'imps', 'neft', 'rtgs', 'wire', 'ach', 'card'));
alter table public.organization_deposits drop constraint organization_deposits_status_check;
alter table public.organization_deposits add constraint organization_deposits_status_check check (status in ('pending', 'confirmed', 'rejected', 'failed'));
alter table public.organization_deposits add column provider text;
alter table public.organization_deposits add column charged_minor_units bigint check (charged_minor_units is null or charged_minor_units >= amount_minor_units);
alter table public.organization_deposits add constraint organization_deposits_card_shape check ((method = 'card') = (provider is not null and charged_minor_units is not null));
drop index public.organization_deposits_one_claim_per_reference;
create unique index organization_deposits_one_claim_per_reference on public.organization_deposits (upper(payer_reference)) where status not in ('rejected', 'failed');

create or replace function public.start_card_deposit(p_organization_id uuid, p_currency text, p_amount_minor_units bigint, p_charged_minor_units bigint, p_provider text, p_reference text)
returns public.organization_deposits
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  deposit public.organization_deposits;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can add funds' using errcode = '42501';
  end if;
  if p_provider not in ('sandbox', 'razorpay', 'stripe') then raise exception 'INVALID_DEPOSIT: unknown card provider' using errcode = '22023'; end if;
  if not private.check_and_consume_rate_limit('org_card_deposit:' || p_organization_id, 30, 86400) then
    raise exception 'RATE_LIMITED: too many card payments started today -- try again tomorrow' using errcode = '53400';
  end if;
  insert into public.organization_deposits (organization_id, currency, amount_minor_units, charged_minor_units, method, provider, payer_reference, requested_by)
  values (p_organization_id, p_currency, p_amount_minor_units, p_charged_minor_units, 'card', p_provider, p_reference, actor)
  returning * into deposit;
  return deposit;
end;
$$;
revoke all on function public.start_card_deposit(uuid, text, bigint, bigint, text, text) from public, anon;
grant execute on function public.start_card_deposit(uuid, text, bigint, bigint, text, text) to authenticated;

-- The card provider's verdict (signed webhook, or the sandbox page). First final word wins.
create or replace function public.complete_card_deposit(p_reference text, p_outcome text, p_detail text)
returns public.organization_deposits
language plpgsql security definer set search_path = ''
as $$
declare
  deposit public.organization_deposits;
begin
  if p_outcome not in ('confirmed', 'failed') then raise exception 'INVALID_OUTCOME: confirmed or failed' using errcode = '22023'; end if;
  select * into deposit from public.organization_deposits where method = 'card' and payer_reference = p_reference for update;
  if deposit.id is null then raise exception 'DEPOSIT_NOT_FOUND: no card payment with that reference' using errcode = 'P0002'; end if;
  if deposit.status <> 'pending' then return deposit; end if;

  update public.organization_deposits set status = p_outcome, reviewed_at = now(),
    review_note = left(coalesce(nullif(trim(p_detail), ''), case when p_outcome = 'confirmed' then 'Paid by card' else 'Card payment did not complete' end), 500)
  where id = deposit.id returning * into deposit;

  if p_outcome = 'confirmed' then
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (null, deposit.organization_id, 'billing.deposit_confirmed', 'organization', deposit.organization_id,
      jsonb_build_object('deposit_id', deposit.id, 'currency', deposit.currency, 'amount_minor_units', deposit.amount_minor_units, 'method', 'card',
        'summary', deposit.currency || ' ' || to_char(deposit.amount_minor_units / 100.0, 'FM999999999990.00') || ' paid by card is now available to award.'));
  end if;
  return deposit;
end;
$$;
revoke all on function public.complete_card_deposit(text, text, text) from public, authenticated, anon;
grant execute on function public.complete_card_deposit(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Program budgets
-- ---------------------------------------------------------------------------
create table public.program_budgets (
  program_id uuid primary key,
  organization_id uuid not null,
  currency text not null check (currency in ('INR', 'USD')),
  cap_minor_units bigint not null check (cap_minor_units > 0 and cap_minor_units <= 100000000000),
  updated_by uuid not null references public.users (id),
  updated_at timestamptz not null default now(),
  foreign key (program_id, organization_id) references public.programs (id, organization_id) on delete cascade
);
alter table public.program_budgets enable row level security;
create policy "program budgets read by finance roles and program staff" on public.program_budgets for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_program_triager(program_id));
revoke all on public.program_budgets from public, anon, authenticated;
grant select on public.program_budgets to authenticated;
grant select on public.program_budgets to service_role;

-- What a program has already spent or set aside in its budget currency.
create or replace function private.program_budget_used(p_program_id uuid, p_currency text) returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(o.amount_minor_units + o.platform_fee_minor_units), 0)::bigint
  from public.payment_obligations o
  where o.program_id = p_program_id and o.currency = p_currency and o.funded_from_balance and o.status in ('pending', 'processing', 'failed', 'succeeded');
$$;
revoke all on function private.program_budget_used(uuid, text) from public, anon, authenticated;

create or replace function public.set_program_budget(p_program_id uuid, p_currency text, p_cap_minor_units bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into program from public.programs where id = p_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(program.organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can set program budgets' using errcode = '42501';
  end if;
  if p_cap_minor_units is null then
    delete from public.program_budgets where program_id = p_program_id;
  else
    if p_currency not in ('INR', 'USD') then raise exception 'INVALID_BUDGET: choose USD or INR' using errcode = '22023'; end if;
    insert into public.program_budgets (program_id, organization_id, currency, cap_minor_units, updated_by)
    values (p_program_id, program.organization_id, p_currency, p_cap_minor_units, actor)
    on conflict (program_id) do update set currency = excluded.currency, cap_minor_units = excluded.cap_minor_units, updated_by = actor, updated_at = now();
  end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'billing.program_budget_set', 'program', p_program_id,
    jsonb_build_object('currency', p_currency, 'cap_minor_units', p_cap_minor_units));
end;
$$;
revoke all on function public.set_program_budget(uuid, text, bigint) from public, anon;
grant execute on function public.set_program_budget(uuid, text, bigint) to authenticated;

create or replace function public.list_program_budgets(p_organization_id uuid)
returns table (program_id uuid, program_name text, program_status text, currency text, cap_minor_units bigint, used_minor_units bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can view program budgets' using errcode = '42501';
  end if;
  return query
  select p.id, p.name, p.status::text, b.currency, b.cap_minor_units,
    case when b.program_id is null then null else private.program_budget_used(p.id, b.currency) end
  from public.programs p left join public.program_budgets b on b.program_id = p.id
  where p.organization_id = p_organization_id and p.status::text <> 'closed'
  order by p.name;
end;
$$;
revoke all on function public.list_program_budgets(uuid) from public, anon;
grant execute on function public.list_program_budgets(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Low-balance alerts
-- ---------------------------------------------------------------------------
create table public.organization_balance_alerts (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  currency text not null check (currency in ('INR', 'USD')),
  threshold_minor_units bigint not null check (threshold_minor_units > 0 and threshold_minor_units <= 100000000000),
  alerted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, currency)
);
alter table public.organization_balance_alerts enable row level security;
create policy "balance alerts read by finance roles" on public.organization_balance_alerts for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]));
revoke all on public.organization_balance_alerts from public, anon, authenticated;
grant select on public.organization_balance_alerts to authenticated;

-- Fires the alert once when the balance falls below the threshold; re-arms when it recovers.
create or replace function private.evaluate_balance_alert(p_organization_id uuid, p_currency text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  alert public.organization_balance_alerts;
  available bigint;
begin
  select * into alert from public.organization_balance_alerts where organization_id = p_organization_id and currency = p_currency for update;
  if alert.organization_id is null then return; end if;
  select b.available into available from private.organization_balance(p_organization_id) b where b.currency = p_currency;
  available := coalesce(available, 0);
  if available < alert.threshold_minor_units and not alert.alerted then
    update public.organization_balance_alerts set alerted = true, updated_at = now() where organization_id = p_organization_id and currency = p_currency;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (null, p_organization_id, 'billing.balance_low', 'organization', p_organization_id,
      jsonb_build_object('currency', p_currency, 'available_minor_units', available, 'threshold_minor_units', alert.threshold_minor_units,
        'summary', 'Your ' || p_currency || ' balance is down to ' || p_currency || ' ' || to_char(available / 100.0, 'FM999999999990.00')
          || ', below your alert level of ' || p_currency || ' ' || to_char(alert.threshold_minor_units / 100.0, 'FM999999999990.00') || '. Add funds so awards are not held up.'));
  elsif available >= alert.threshold_minor_units and alert.alerted then
    update public.organization_balance_alerts set alerted = false, updated_at = now() where organization_id = p_organization_id and currency = p_currency;
  end if;
end;
$$;
revoke all on function private.evaluate_balance_alert(uuid, text) from public, anon, authenticated;

create or replace function private.balance_alert_after_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.evaluate_balance_alert(new.organization_id, new.currency);
  return new;
end;
$$;
create trigger payment_obligations_balance_alert after insert or update of status on public.payment_obligations
  for each row when (new.funded_from_balance) execute function private.balance_alert_after_change();
create trigger organization_deposits_balance_alert after insert or update of status on public.organization_deposits
  for each row execute function private.balance_alert_after_change();

create or replace function public.set_balance_alert(p_organization_id uuid, p_currency text, p_threshold_minor_units bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can set balance alerts' using errcode = '42501';
  end if;
  if p_currency not in ('INR', 'USD') then raise exception 'INVALID_ALERT: choose USD or INR' using errcode = '22023'; end if;
  if p_threshold_minor_units is null then
    delete from public.organization_balance_alerts where organization_id = p_organization_id and currency = p_currency;
  else
    insert into public.organization_balance_alerts (organization_id, currency, threshold_minor_units)
    values (p_organization_id, p_currency, p_threshold_minor_units)
    on conflict (organization_id, currency) do update set threshold_minor_units = excluded.threshold_minor_units, alerted = false, updated_at = now();
    perform private.evaluate_balance_alert(p_organization_id, p_currency);
  end if;
end;
$$;
revoke all on function public.set_balance_alert(uuid, text, bigint) from public, anon;
grant execute on function public.set_balance_alert(uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Billing profile and invoices
-- ---------------------------------------------------------------------------
create table public.organization_billing_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  legal_name text not null check (char_length(trim(legal_name)) between 2 and 200),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  address_line text not null check (char_length(trim(address_line)) between 3 and 300),
  city text not null check (char_length(trim(city)) between 2 and 100),
  postal_code text not null check (char_length(trim(postal_code)) between 3 and 12),
  country text not null check (country ~ '^[A-Z]{2}$'),
  -- GST state code (01-38) for an Indian address; decides CGST+SGST vs IGST.
  state_code text check (state_code is null or state_code ~ '^[0-3][0-9]$'),
  updated_by uuid not null references public.users (id),
  updated_at timestamptz not null default now(),
  constraint billing_profile_india_state check (country <> 'IN' or state_code is not null),
  constraint billing_profile_gstin_matches_state check (gstin is null or (country = 'IN' and left(gstin, 2) = state_code))
);
alter table public.organization_billing_profiles enable row level security;
create policy "billing profiles read by finance roles" on public.organization_billing_profiles for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]));
revoke all on public.organization_billing_profiles from public, anon, authenticated;
grant select on public.organization_billing_profiles to authenticated;

create or replace function public.upsert_billing_profile(p_organization_id uuid, p_legal_name text, p_gstin text, p_address_line text, p_city text,
  p_postal_code text, p_country text, p_state_code text)
returns public.organization_billing_profiles
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  profile public.organization_billing_profiles;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can edit billing details' using errcode = '42501';
  end if;
  insert into public.organization_billing_profiles (organization_id, legal_name, gstin, address_line, city, postal_code, country, state_code, updated_by)
  values (p_organization_id, trim(p_legal_name), nullif(upper(trim(coalesce(p_gstin, ''))), ''), trim(p_address_line), trim(p_city), trim(p_postal_code),
    upper(trim(p_country)), nullif(trim(coalesce(p_state_code, '')), ''), actor)
  on conflict (organization_id) do update set legal_name = excluded.legal_name, gstin = excluded.gstin, address_line = excluded.address_line,
    city = excluded.city, postal_code = excluded.postal_code, country = excluded.country, state_code = excluded.state_code, updated_by = actor, updated_at = now()
  returning * into profile;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'billing.profile_updated', 'organization', p_organization_id, jsonb_build_object('gstin', profile.gstin is not null));
  return profile;
exception
  when check_violation then
    raise exception 'INVALID_BILLING_PROFILE: check the GSTIN (15 characters, starting with your state code) and the address fields' using errcode = '22023';
end;
$$;
revoke all on function public.upsert_billing_profile(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.upsert_billing_profile(uuid, text, text, text, text, text, text, text) to authenticated;

create table public.invoice_sequences (
  financial_year text primary key check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  last_number integer not null default 0
);
alter table public.invoice_sequences enable row level security;
revoke all on public.invoice_sequences from public, anon, authenticated;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  number text not null unique,
  financial_year text not null,
  currency text not null check (currency in ('INR', 'USD')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.users (id),
  seller jsonb not null,
  buyer jsonb not null,
  subtotal_minor_units bigint not null check (subtotal_minor_units > 0),
  cgst_minor_units bigint not null default 0 check (cgst_minor_units >= 0),
  sgst_minor_units bigint not null default 0 check (sgst_minor_units >= 0),
  igst_minor_units bigint not null default 0 check (igst_minor_units >= 0),
  total_minor_units bigint not null,
  tax_note text not null,
  constraint invoices_total_adds_up check (total_minor_units = subtotal_minor_units + cgst_minor_units + sgst_minor_units + igst_minor_units),
  unique (organization_id, currency, period_start)
);
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  obligation_id uuid not null unique references public.payment_obligations (id) on delete restrict,
  description text not null,
  bounty_minor_units bigint not null,
  fee_minor_units bigint not null check (fee_minor_units >= 0),
  paid_at timestamptz not null
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
create index invoices_org_idx on public.invoices (organization_id, issued_at desc);

-- An issued invoice is a legal record: never edited or deleted.
create or replace function private.forbid_invoice_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'INVOICE_IMMUTABLE: an issued invoice cannot be changed or deleted' using errcode = '42501';
end;
$$;
create trigger invoices_immutable before update or delete on public.invoices for each row execute function private.forbid_invoice_change();
create trigger invoice_lines_immutable before update or delete on public.invoice_lines for each row execute function private.forbid_invoice_change();

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
create policy "invoices read by finance roles" on public.invoices for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_platform_admin());
create policy "invoice lines read with their invoice" on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id));
revoke all on public.invoices, public.invoice_lines from public, anon, authenticated;
grant select on public.invoices, public.invoice_lines to authenticated;

/** "2026-27" for any date from 1 April 2026 to 31 March 2027 (the Indian financial year). */
create or replace function private.financial_year_of(p_date date) returns text
language sql immutable set search_path = ''
as $$
  select case when extract(month from p_date) >= 4
    then to_char(p_date, 'YYYY') || '-' || to_char((p_date + interval '1 year'), 'YY')
    else to_char((p_date - interval '1 year'), 'YYYY') || '-' || to_char(p_date, 'YY') end;
$$;

-- Issues one invoice per organization and currency for the platform fee on payouts that
-- completed in [p_period_start, p_period_end] and are not invoiced yet. p_seller is the
-- issuing entity (name, GSTIN, address, state code) from server configuration. Idempotent:
-- a fee already on an invoice is skipped, and an organization gets one invoice per
-- currency per period start.
create or replace function public.issue_invoices_for_period(p_period_start date, p_period_end date, p_seller jsonb)
returns setof public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  grp record;
  profile public.organization_billing_profiles;
  org public.organizations;
  fy text := private.financial_year_of(current_date);
  seq integer;
  subtotal bigint;
  cgst bigint;
  sgst bigint;
  igst bigint;
  note text;
  inv public.invoices;
  buyer jsonb;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  if p_period_end < p_period_start or p_period_end >= current_date then
    raise exception 'INVALID_PERIOD: invoice a period that has already ended' using errcode = '22023';
  end if;
  if coalesce(p_seller ->> 'name', '') = '' or coalesce(p_seller ->> 'state_code', '') !~ '^[0-3][0-9]$' then
    raise exception 'SELLER_NOT_CONFIGURED: set the invoice seller name, GSTIN and state code in server configuration' using errcode = '22023';
  end if;

  for grp in
    select o.organization_id, o.currency, array_agg(o.id) as obligation_ids, sum(o.platform_fee_minor_units)::bigint as fees
    from public.payment_obligations o
    join lateral (select max(a.completed_at) as paid_at from public.payment_attempts a where a.payment_obligation_id = o.id and a.state = 'succeeded') pa on true
    where o.status = 'succeeded' and o.funded_from_balance and o.platform_fee_minor_units > 0
      and pa.paid_at >= p_period_start and pa.paid_at < p_period_end + 1
      and not exists (select 1 from public.invoice_lines l where l.obligation_id = o.id)
    group by o.organization_id, o.currency
  loop
    continue when exists (select 1 from public.invoices i where i.organization_id = grp.organization_id and i.currency = grp.currency and i.period_start = p_period_start);
    select * into org from public.organizations where id = grp.organization_id;
    select * into profile from public.organization_billing_profiles where organization_id = grp.organization_id;
    buyer := case when profile.organization_id is null
      then jsonb_build_object('name', org.name)
      else jsonb_build_object('name', profile.legal_name, 'gstin', profile.gstin, 'address_line', profile.address_line, 'city', profile.city,
        'postal_code', profile.postal_code, 'country', profile.country, 'state_code', profile.state_code) end;

    subtotal := grp.fees;
    cgst := 0; sgst := 0; igst := 0;
    if grp.currency = 'INR' then
      -- 18% GST on the fee. Within the seller's state: 9% CGST + 9% SGST; otherwise
      -- (including an unknown place of supply) 18% IGST. Half-paise round up.
      if profile.state_code is not null and profile.state_code = p_seller ->> 'state_code' then
        cgst := (subtotal * 9 + 50) / 100;
        sgst := cgst;
        note := 'Intra-state supply: CGST 9% and SGST 9% on the platform fee.';
      else
        igst := (subtotal * 18 + 50) / 100;
        note := 'Inter-state supply: IGST 18% on the platform fee.';
      end if;
    else
      note := 'Export of services: zero-rated, supplied under LUT without payment of IGST.';
    end if;

    insert into public.invoice_sequences (financial_year, last_number) values (fy, 1)
    on conflict (financial_year) do update set last_number = public.invoice_sequences.last_number + 1
    returning last_number into seq;

    insert into public.invoices (organization_id, number, financial_year, currency, period_start, period_end, issued_by, seller, buyer,
      subtotal_minor_units, cgst_minor_units, sgst_minor_units, igst_minor_units, total_minor_units, tax_note)
    values (grp.organization_id, 'UNP/' || fy || '/' || lpad(seq::text, 5, '0'), fy, grp.currency, p_period_start, p_period_end, actor, p_seller, buyer,
      subtotal, cgst, sgst, igst, subtotal + cgst + sgst + igst, note)
    returning * into inv;

    insert into public.invoice_lines (invoice_id, obligation_id, description, bounty_minor_units, fee_minor_units, paid_at)
    select inv.id, o.id, 'Platform fee: ' || coalesce(p.name, 'Program') || ' / ' || coalesce(r.title, 'Report'), o.amount_minor_units, o.platform_fee_minor_units,
      (select max(a.completed_at) from public.payment_attempts a where a.payment_obligation_id = o.id and a.state = 'succeeded')
    from public.payment_obligations o
    left join public.programs p on p.id = o.program_id
    left join public.reports r on r.id = o.report_id
    where o.id = any (grp.obligation_ids);

    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, grp.organization_id, 'billing.invoice_issued', 'organization', grp.organization_id,
      jsonb_build_object('invoice_id', inv.id, 'number', inv.number, 'currency', inv.currency, 'total_minor_units', inv.total_minor_units,
        'summary', 'Invoice ' || inv.number || ' for ' || inv.currency || ' ' || to_char(inv.total_minor_units / 100.0, 'FM999999999990.00') || ' is ready in Payments.'));
    return next inv;
  end loop;
end;
$$;
revoke all on function public.issue_invoices_for_period(date, date, jsonb) from public, anon;
grant execute on function public.issue_invoices_for_period(date, date, jsonb) to authenticated;
CREATE OR REPLACE FUNCTION private.guard_obligation_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  remaining bigint;
  budget public.program_budgets;
  budget_left bigint;
begin
  if not new.funded_from_balance then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('org_balance:' || new.organization_id || ':' || new.currency, 0));
  select b.available into remaining from private.organization_balance(new.organization_id) b where b.currency = new.currency;
  if coalesce(remaining, 0) < new.amount_minor_units + new.platform_fee_minor_units then
    raise exception 'INSUFFICIENT_BALANCE: this award needs % % (bounty + fee) but the % balance has % available -- add funds first',
      new.currency, round((new.amount_minor_units + new.platform_fee_minor_units) / 100.0, 2), new.currency, round(coalesce(remaining, 0) / 100.0, 2)
      using errcode = '23514';
  end if;

  -- Program budget (202610150002): an award may not take the program past its cap.
  select * into budget from public.program_budgets where program_id = new.program_id;
  if budget.program_id is not null then
    if budget.currency <> new.currency then
      raise exception 'PROGRAM_BUDGET_CURRENCY: this program''s budget is in %; change the budget or the bounty table to match', budget.currency using errcode = '23514';
    end if;
    budget_left := budget.cap_minor_units - private.program_budget_used(new.program_id, budget.currency);
    if budget_left < (new.amount_minor_units + new.platform_fee_minor_units) then
      raise exception 'PROGRAM_BUDGET_EXCEEDED: this award needs % % but the program has % % left in its budget -- raise the budget in Payments',
        budget.currency, round((new.amount_minor_units + new.platform_fee_minor_units) / 100.0, 2), budget.currency, round(greatest(budget_left, 0) / 100.0, 2) using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$
;


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
  budget public.program_budgets;
  budget_left bigint;
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

  if p_amount_minor_units > 0 then
    -- Program budget (202610150002): an award may not take the program past its cap.
    select * into budget from public.program_budgets where program_id = report.program_id;
    if budget.program_id is not null then
      if budget.currency <> decision.currency then
        raise exception 'PROGRAM_BUDGET_CURRENCY: this program''s budget is in %; change the budget or the bounty table to match', budget.currency using errcode = '23514';
      end if;
      budget_left := budget.cap_minor_units - private.program_budget_used(report.program_id, budget.currency);
      if budget_left < (p_amount_minor_units + (p_amount_minor_units * 2000) / 10000) then
        raise exception 'PROGRAM_BUDGET_EXCEEDED: this award needs % % but the program has % % left in its budget -- raise the budget in Payments',
          budget.currency, round((p_amount_minor_units + (p_amount_minor_units * 2000) / 10000) / 100.0, 2), budget.currency, round(greatest(budget_left, 0) / 100.0, 2) using errcode = '23514';
      end if;
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


CREATE OR REPLACE FUNCTION public.list_pending_deposits_for_admin()
 RETURNS TABLE(id uuid, organization_id uuid, organization_name text, currency text, amount_minor_units bigint, method text, payer_reference text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select d.id, d.organization_id, o.name, d.currency, d.amount_minor_units, d.method, d.payer_reference, d.created_at
  from public.organization_deposits d join public.organizations o on o.id = d.organization_id
  where d.status = 'pending' and d.method <> 'card' order by d.created_at;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.review_organization_deposit(p_deposit_id uuid, p_outcome text, p_note text)
 RETURNS organization_deposits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if deposit.method = 'card' then raise exception 'DEPOSIT_NOT_REVIEWABLE: card payments are confirmed by the card provider' using errcode = '23514'; end if;
  if deposit.status <> 'pending' then raise exception 'DEPOSIT_ALREADY_REVIEWED: this deposit was already %', deposit.status using errcode = '23514'; end if;

  update public.organization_deposits set status = p_outcome, review_note = note, reviewed_by = actor, reviewed_at = now()
  where id = p_deposit_id returning * into deposit;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, deposit.organization_id, 'billing.deposit_' || p_outcome, 'organization', deposit.organization_id,
    jsonb_build_object('deposit_id', deposit.id, 'currency', deposit.currency, 'amount_minor_units', deposit.amount_minor_units,
      'summary', deposit.currency || ' ' || to_char(deposit.amount_minor_units / 100.0, 'FM999999999990.00') || ' (' || deposit.payer_reference || ') was '
        || case when p_outcome = 'confirmed' then 'confirmed and is available to award.' else 'rejected: ' || coalesce(note, 'no reason given') end));
  return deposit;
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
    jsonb_build_object('deposit_id', deposit.id, 'currency', deposit.currency, 'amount_minor_units', deposit.amount_minor_units, 'method', deposit.method,
      'summary', deposit.currency || ' ' || to_char(deposit.amount_minor_units / 100.0, 'FM999999999990.00') || ' by ' || upper(deposit.method) || ', reference ' || deposit.payer_reference || ', waiting for confirmation.'));
  return deposit;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.prepare_notification_email(p_delivery_id uuid)
 RETURNS TABLE(deliverable boolean, reason text, recipient_email text, recipient_display_name text, report_title text, program_name text, organization_name text, notification_type text, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  delivery public.notification_deliveries;
  notif public.notifications;
  authorized boolean;
begin
  select * into delivery from public.notification_deliveries where id = p_delivery_id for update;
  if delivery.id is null then
    return query select false, 'DELIVERY_NOT_FOUND'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if delivery.state in ('delivered', 'permanent_failure') then
    return query select false, 'ALREADY_TERMINAL'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Another worker claimed it moments ago (lease reclaim, retry): let that one finish. A
  -- 'processing' row older than 5 minutes is a worker that died mid-send, so it is retried.
  if delivery.state = 'processing' and delivery.updated_at > now() - interval '5 minutes' then
    return query select false, 'IN_PROGRESS'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into notif from public.notifications where id = delivery.notification_id;

  if notif.category = 'billing_activity' then
    authorized := case when notif.notification_type = 'deposit_reported'
      then exists (select 1 from public.platform_admins pa where pa.user_id = notif.recipient_id)
      else exists (select 1 from public.organization_members m where m.organization_id = notif.organization_id and m.user_id = notif.recipient_id
        and m.status = 'active' and m.role in ('owner', 'security_admin', 'billing_admin')) end;
  elsif notif.category = 'platform_activity' then
    -- Still an active owner/security_admin of the organization the notice is about.
    authorized := exists (
      select 1 from public.organization_members m
      where m.organization_id = notif.organization_id and m.user_id = notif.recipient_id
        and m.status = 'active' and m.role in ('owner', 'security_admin')
    );
  else
    authorized := private.can_currently_read_report(notif.report_id, notif.recipient_id);
  end if;

  if not authorized then
    update public.notification_deliveries
      set state = 'permanent_failure', last_error = 'RECIPIENT_NO_LONGER_AUTHORIZED', updated_at = now()
      where id = p_delivery_id;
    return query select false, 'RECIPIENT_NO_LONGER_AUTHORIZED'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  update public.notification_deliveries set state = 'processing', updated_at = now() where id = p_delivery_id;

  return query
    select true, null::text, u.email, u.display_name, rp.title, prog.name, org.name, notif.notification_type, notif.occurred_at
    from public.notifications n
    join public.users u on u.id = n.recipient_id
    left join public.reports rp on rp.id = n.report_id
    left join public.programs prog on prog.id = n.program_id
    join public.organizations org on org.id = n.organization_id
    where n.id = notif.id;
end;
$function$
;

