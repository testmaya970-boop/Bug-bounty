-- Billing and earnings documents (Oct 22): credit/debit notes against GST invoices, the
-- organization wallet ledger behind monthly and wallet statements, the bounty history report,
-- and tax withheld at payout behind researcher receipts, earning statements, TDS / 1099
-- certificates and annual reports.
--
-- Withholding is decided when the first payout attempt for an obligation is created and frozen
-- there (a trigger on payment_attempts, no RPC body copied forward): the attempt's requested
-- amount becomes the net the researcher receives, so the manual payout list and every payout
-- adapter send the net without changes. Rates are defaults a tax advisor must confirm before a
-- live payout run (docs: India 194J 10% with PAN, 206AA 20% without; US backup withholding 24%
-- without a W-9 TIN, none with one, reported on 1099-NEC). Any other country withholds nothing.

-- ---------------------------------------------------------------- tax residence
alter table public.researcher_payout_details
  add column tax_residence_country text check (tax_residence_country is null or tax_residence_country ~ '^[A-Z]{2}$');

create or replace function public.set_my_tax_residence(p_country text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  country text := upper(nullif(trim(coalesce(p_country, '')), ''));
begin
  if actor is null or not private.actor_is_active() then raise exception 'UNAUTHENTICATED: sign in again' using errcode = '42501'; end if;
  if country is not null and country !~ '^[A-Z]{2}$' then raise exception 'INVALID_COUNTRY: choose a country' using errcode = '22023'; end if;
  insert into public.researcher_payout_details (user_id, tax_residence_country) values (actor, country)
  on conflict (user_id) do update set tax_residence_country = excluded.tax_residence_country, updated_at = now();
end;
$$;
revoke all on function public.set_my_tax_residence(text) from public, anon;
grant execute on function public.set_my_tax_residence(text) to authenticated;

-- ---------------------------------------------------------------- withholding
create table public.payout_tax_withholdings (
  obligation_id uuid primary key references public.payment_obligations (id) on delete restrict,
  researcher_id uuid not null references public.users (id) on delete restrict,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  regime text not null check (regime in ('in_194j', 'in_206aa', 'us_1099', 'us_backup', 'none')),
  rate_bps integer not null check (rate_bps between 0 and 5000),
  legal_basis text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_minor_units bigint not null check (gross_minor_units > 0),
  withheld_minor_units bigint not null check (withheld_minor_units >= 0),
  net_minor_units bigint not null check (net_minor_units > 0),
  created_at timestamptz not null default now(),
  constraint payout_tax_withholdings_adds_up check (net_minor_units = gross_minor_units - withheld_minor_units)
);
create index payout_tax_withholdings_researcher_idx on public.payout_tax_withholdings (researcher_id, created_at desc);
alter table public.payout_tax_withholdings enable row level security;
create policy "withholding read by the researcher or platform admins" on public.payout_tax_withholdings for select to authenticated
  using (researcher_id = auth.uid() or private.is_platform_admin());
revoke all on public.payout_tax_withholdings from public, anon, authenticated;
grant select on public.payout_tax_withholdings to authenticated;
grant select, insert on public.payout_tax_withholdings to service_role;

create or replace function private.forbid_tax_record_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'TAX_RECORD_IMMUTABLE: a tax deduction or billing note cannot be changed or deleted' using errcode = '42501';
end;
$$;
revoke all on function private.forbid_tax_record_change() from public, anon, authenticated;
grant execute on function private.forbid_tax_record_change() to service_role;
create trigger payout_tax_withholdings_immutable before update or delete on public.payout_tax_withholdings for each row execute function private.forbid_tax_record_change();

-- Which rule applies to a researcher right now (country from their payout details; PAN from
-- KYC; W-9 TIN from the tax form). A rejected document counts as missing.
create or replace function private.payout_withholding_rule(p_user_id uuid)
returns table (country text, regime text, rate_bps integer, legal_basis text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.researcher_payout_details;
  has_pan boolean;
begin
  select * into d from public.researcher_payout_details where user_id = p_user_id;
  if d.tax_residence_country = 'IN' then
    select k.pan_number_encrypted is not null and k.pan_status <> 'rejected' into has_pan from public.researcher_kyc k where k.user_id = p_user_id;
    if coalesce(has_pan, false) then
      return query select 'IN'::text, 'in_194j'::text, 1000, 'Income-tax Act 1961, section 194J: fees for professional or technical services (10%)'::text;
    else
      return query select 'IN'::text, 'in_206aa'::text, 2000, 'Income-tax Act 1961, section 206AA: no PAN on file (20%)'::text;
    end if;
  elsif d.tax_residence_country = 'US' then
    if d.tax_form_type = 'w9' and d.tax_id_encrypted is not null and d.tax_form_status <> 'rejected' then
      return query select 'US'::text, 'us_1099'::text, 0, 'W-9 on file: no withholding, reported on Form 1099-NEC'::text;
    else
      return query select 'US'::text, 'us_backup'::text, 2400, 'Internal Revenue Code section 3406: backup withholding, no W-9 TIN on file (24%)'::text;
    end if;
  else
    return query select d.tax_residence_country, 'none'::text, 0, 'No withholding for this tax residence'::text;
  end if;
end;
$$;
revoke all on function private.payout_withholding_rule(uuid) from public, anon, authenticated;
grant execute on function private.payout_withholding_rule(uuid) to service_role;

-- First attempt: decide and freeze the deduction. Every attempt (retries too) asks for the net.
create or replace function private.apply_payout_withholding() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ob public.payment_obligations;
  w public.payout_tax_withholdings;
  rule record;
  withheld bigint;
begin
  select * into w from public.payout_tax_withholdings where obligation_id = new.payment_obligation_id;
  if w.obligation_id is null then
    select * into ob from public.payment_obligations where id = new.payment_obligation_id;
    select * into rule from private.payout_withholding_rule(ob.researcher_id);
    -- Half a minor unit rounds up, like the GST lines on invoices.
    withheld := (ob.amount_minor_units * coalesce(rule.rate_bps, 0) + 5000) / 10000;
    insert into public.payout_tax_withholdings (obligation_id, researcher_id, country, regime, rate_bps, legal_basis, currency, gross_minor_units, withheld_minor_units, net_minor_units)
    values (ob.id, ob.researcher_id, rule.country, coalesce(rule.regime, 'none'), coalesce(rule.rate_bps, 0), coalesce(rule.legal_basis, 'No withholding for this tax residence'),
      ob.currency, ob.amount_minor_units, withheld, ob.amount_minor_units - withheld)
    returning * into w;
  end if;
  new.requested_amount_minor_units := w.net_minor_units;
  return new;
end;
$$;
revoke all on function private.apply_payout_withholding() from public, anon, authenticated;
grant execute on function private.apply_payout_withholding() to service_role;
create trigger payment_attempts_apply_withholding before insert on public.payment_attempts for each row execute function private.apply_payout_withholding();

-- ---------------------------------------------------------------- credit / debit notes
create table public.invoice_note_sequences (
  kind text not null check (kind in ('credit', 'debit')),
  financial_year text not null check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  last_number integer not null default 0,
  primary key (kind, financial_year)
);
alter table public.invoice_note_sequences enable row level security;
revoke all on public.invoice_note_sequences from public, anon, authenticated;

create table public.invoice_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind text not null check (kind in ('credit', 'debit')),
  number text not null unique,
  financial_year text not null,
  currency text not null,
  reason text not null check (char_length(reason) between 5 and 500),
  subtotal_minor_units bigint not null check (subtotal_minor_units > 0),
  cgst_minor_units bigint not null default 0 check (cgst_minor_units >= 0),
  sgst_minor_units bigint not null default 0 check (sgst_minor_units >= 0),
  igst_minor_units bigint not null default 0 check (igst_minor_units >= 0),
  total_minor_units bigint not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.users (id),
  constraint invoice_notes_total_adds_up check (total_minor_units = subtotal_minor_units + cgst_minor_units + sgst_minor_units + igst_minor_units)
);
create index invoice_notes_org_idx on public.invoice_notes (organization_id, issued_at desc);
create index invoice_notes_invoice_idx on public.invoice_notes (invoice_id);
create trigger invoice_notes_immutable before update or delete on public.invoice_notes for each row execute function private.forbid_tax_record_change();
alter table public.invoice_notes enable row level security;
create policy "invoice notes read by finance roles" on public.invoice_notes for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_platform_admin());
revoke all on public.invoice_notes from public, anon, authenticated;
grant select on public.invoice_notes to authenticated;

-- Platform admins issue a credit note (reduces what an invoice billed: a refund, a cancelled
-- award, a fee waiver) or a debit note (bills more). GST follows the original invoice: the same
-- CGST+SGST or IGST split at 18%, or none for an export invoice. Credits can never exceed what
-- the invoice billed plus any debits already raised against it.
create or replace function public.issue_invoice_note(p_invoice_id uuid, p_kind text, p_subtotal_minor_units bigint, p_reason text)
returns public.invoice_notes
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  inv public.invoices;
  credited bigint;
  debited bigint;
  fy text := private.financial_year_of(current_date);
  seq integer;
  cgst bigint := 0;
  sgst bigint := 0;
  igst bigint := 0;
  note public.invoice_notes;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  if p_kind not in ('credit', 'debit') then raise exception 'INVALID_NOTE: choose a credit or debit note' using errcode = '22023'; end if;
  if coalesce(p_subtotal_minor_units, 0) <= 0 then raise exception 'INVALID_AMOUNT: enter an amount above zero' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED: say why the note is issued (5 characters or more)' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null then raise exception 'NOT_FOUND: no such invoice' using errcode = 'P0002'; end if;
  select coalesce(sum(subtotal_minor_units) filter (where kind = 'credit'), 0), coalesce(sum(subtotal_minor_units) filter (where kind = 'debit'), 0)
    into credited, debited from public.invoice_notes where invoice_id = inv.id;
  if p_kind = 'credit' and credited + p_subtotal_minor_units > inv.subtotal_minor_units + debited then
    raise exception 'CREDIT_EXCEEDS_INVOICE: at most % % can still be credited on this invoice', inv.currency, (inv.subtotal_minor_units + debited - credited) / 100.0 using errcode = '22023';
  end if;
  if inv.cgst_minor_units > 0 then
    cgst := (p_subtotal_minor_units * 9 + 50) / 100;
    sgst := cgst;
  elsif inv.igst_minor_units > 0 then
    igst := (p_subtotal_minor_units * 18 + 50) / 100;
  end if;

  insert into public.invoice_note_sequences (kind, financial_year, last_number) values (p_kind, fy, 1)
  on conflict (kind, financial_year) do update set last_number = public.invoice_note_sequences.last_number + 1
  returning last_number into seq;

  insert into public.invoice_notes (invoice_id, organization_id, kind, number, financial_year, currency, reason, subtotal_minor_units,
    cgst_minor_units, sgst_minor_units, igst_minor_units, total_minor_units, issued_by)
  values (inv.id, inv.organization_id, p_kind, case p_kind when 'credit' then 'UNP-CN/' else 'UNP-DN/' end || fy || '/' || lpad(seq::text, 5, '0'),
    fy, inv.currency, trim(p_reason), p_subtotal_minor_units, cgst, sgst, igst, p_subtotal_minor_units + cgst + sgst + igst, actor)
  returning * into note;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, inv.organization_id, 'billing.invoice_note_issued', 'organization', inv.organization_id,
    jsonb_build_object('note_id', note.id, 'number', note.number, 'kind', note.kind, 'invoice_number', inv.number, 'total_minor_units', note.total_minor_units,
      'summary', initcap(note.kind) || ' note ' || note.number || ' against invoice ' || inv.number || ' for ' || note.currency || ' ' || to_char(note.total_minor_units / 100.0, 'FM999999999990.00') || ' is ready in Billing documents.'));
  return note;
end;
$$;
revoke all on function public.issue_invoice_note(uuid, text, bigint, text) from public, anon;
grant execute on function public.issue_invoice_note(uuid, text, bigint, text) to authenticated;

-- ---------------------------------------------------------------- organization statements
-- Every movement on one currency's prepaid balance between two dates, plus the balance
-- before the first day (the 'opening' row). Same arithmetic as private.organization_balance:
-- confirmed deposits add, a balance-funded award takes its bounty and fee, a cancelled award
-- gives both back. Paying the researcher moves nothing (the money was already committed).
create or replace function public.get_organization_wallet_ledger(p_organization_id uuid, p_currency text, p_from date, p_to date)
returns table (occurred_at timestamptz, kind text, description text, reference text, amount_minor_units bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_platform_admin()) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can view statements' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'INVALID_PERIOD: choose a period of up to 400 days' using errcode = '22023'; end if;
  return query
  with moves as (
    select d.reviewed_at as at, 'deposit'::text as k, 'Funds added by ' || upper(d.method) as dsc, d.payer_reference as ref, d.amount_minor_units as amt
    from public.organization_deposits d
    where d.organization_id = p_organization_id and d.currency = p_currency and d.status = 'confirmed'
    union all
    select o.created_at, 'award', 'Bounty: ' || coalesce(p.name, 'Program') || ' / ' || coalesce(r.title, 'Report'), 'RPT-' || left(o.report_id::text, 8), -o.amount_minor_units
    from public.payment_obligations o left join public.programs p on p.id = o.program_id left join public.reports r on r.id = o.report_id
    where o.organization_id = p_organization_id and o.currency = p_currency and o.funded_from_balance
    union all
    select o.created_at, 'fee', 'Platform fee: ' || coalesce(r.title, 'Report'), 'RPT-' || left(o.report_id::text, 8), -o.platform_fee_minor_units
    from public.payment_obligations o left join public.reports r on r.id = o.report_id
    where o.organization_id = p_organization_id and o.currency = p_currency and o.funded_from_balance and o.platform_fee_minor_units > 0
    union all
    select o.updated_at, 'release', 'Award cancelled: ' || coalesce(r.title, 'Report'), 'RPT-' || left(o.report_id::text, 8), o.amount_minor_units + o.platform_fee_minor_units
    from public.payment_obligations o left join public.reports r on r.id = o.report_id
    where o.organization_id = p_organization_id and o.currency = p_currency and o.funded_from_balance and o.status = 'cancelled'
  )
  select (p_from::timestamp at time zone 'UTC'), 'opening', 'Opening balance', null::text, coalesce(sum(m.amt) filter (where m.at < p_from::timestamp at time zone 'UTC'), 0)::bigint from moves m
  union all
  select * from (
    select m.at, m.k, m.dsc, m.ref, m.amt from moves m
    where m.at >= p_from::timestamp at time zone 'UTC' and m.at < (p_to + 1)::timestamp at time zone 'UTC'
    order by m.at, m.k
  ) inner_rows;
end;
$$;
revoke all on function public.get_organization_wallet_ledger(uuid, text, date, date) from public, anon;
grant execute on function public.get_organization_wallet_ledger(uuid, text, date, date) to authenticated;

-- Every bounty this organization awarded in a period, with where it stands and the invoice
-- that billed its fee.
create or replace function public.list_organization_bounty_history(p_organization_id uuid, p_from date, p_to date)
returns table (obligation_id uuid, awarded_at timestamptz, paid_at timestamptz, status text, program_name text, report_id uuid, report_title text,
  researcher_name text, severity text, currency text, bounty_minor_units bigint, fee_minor_units bigint, invoice_number text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_platform_admin()) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can view bounty history' using errcode = '42501';
  end if;
  if p_to < p_from then raise exception 'INVALID_PERIOD: the end date is before the start date' using errcode = '22023'; end if;
  return query
  select o.id, o.created_at,
    (select max(a.completed_at) from public.payment_attempts a where a.payment_obligation_id = o.id and a.state = 'succeeded'),
    o.status, p.name, o.report_id, r.title, u.display_name, r.severity::text, o.currency, o.amount_minor_units, o.platform_fee_minor_units,
    (select i.number from public.invoice_lines l join public.invoices i on i.id = l.invoice_id where l.obligation_id = o.id)
  from public.payment_obligations o
  left join public.programs p on p.id = o.program_id
  left join public.reports r on r.id = o.report_id
  left join public.users u on u.id = o.researcher_id
  where o.organization_id = p_organization_id
    and o.created_at >= p_from::timestamp at time zone 'UTC' and o.created_at < (p_to + 1)::timestamp at time zone 'UTC'
  order by o.created_at desc;
end;
$$;
revoke all on function public.list_organization_bounty_history(uuid, date, date) from public, anon;
grant execute on function public.list_organization_bounty_history(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------- researcher documents
-- The signed-in researcher's completed payouts, with what was withheld. Payouts from before
-- withholding existed have no deduction row and read as gross = net.
create or replace function public.list_my_payouts(p_from date default null, p_to date default null)
returns table (obligation_id uuid, paid_at timestamptz, provider text, provider_reference text, organization_name text, program_name text, report_title text,
  currency text, gross_minor_units bigint, withheld_minor_units bigint, net_minor_units bigint, regime text, rate_bps integer, legal_basis text, country text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'UNAUTHENTICATED: sign in again' using errcode = '42501'; end if;
  return query
  select o.id, pa.completed_at, pa.provider, pa.provider_reference_id, org.name, p.name, r.title, o.currency, o.amount_minor_units,
    coalesce(w.withheld_minor_units, 0), coalesce(w.net_minor_units, o.amount_minor_units), coalesce(w.regime, 'none'), coalesce(w.rate_bps, 0),
    coalesce(w.legal_basis, 'Paid before tax withholding was recorded'), w.country
  from public.payment_obligations o
  join lateral (
    select a.completed_at, a.provider, a.provider_reference_id from public.payment_attempts a
    where a.payment_obligation_id = o.id and a.state = 'succeeded' order by a.completed_at desc limit 1
  ) pa on true
  left join public.payout_tax_withholdings w on w.obligation_id = o.id
  left join public.organizations org on org.id = o.organization_id
  left join public.programs p on p.id = o.program_id
  left join public.reports r on r.id = o.report_id
  where o.researcher_id = actor and o.status = 'succeeded'
    and (p_from is null or pa.completed_at >= p_from::timestamp at time zone 'UTC')
    and (p_to is null or pa.completed_at < (p_to + 1)::timestamp at time zone 'UTC')
  order by pa.completed_at desc;
end;
$$;
revoke all on function public.list_my_payouts(date, date) from public, anon;
grant execute on function public.list_my_payouts(date, date) to authenticated;

-- What a certificate prints about the researcher: tax residence, masked PAN (first five and
-- last character hidden), W-9 TIN last four, and which rule applies to the next payout.
create or replace function public.get_my_tax_identity()
returns table (display_name text, email text, tax_residence_country text, pan_masked text, pan_status text, tax_form_type text, tin_last4 text,
  tax_form_status text, next_regime text, next_rate_bps integer, next_legal_basis text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  pan text;
  rule record;
begin
  if actor is null then raise exception 'UNAUTHENTICATED: sign in again' using errcode = '42501'; end if;
  select private.decrypt_sensitive_field(k.pan_number_encrypted) into pan from public.researcher_kyc k where k.user_id = actor;
  select * into rule from private.payout_withholding_rule(actor);
  return query
  select u.display_name, u.email, d.tax_residence_country,
    case when pan is null then null else 'XXXXX' || substr(pan, 6, 4) || 'X' end,
    (select k.pan_status::text from public.researcher_kyc k where k.user_id = actor),
    d.tax_form_type::text, d.tax_id_last4, d.tax_form_status::text, rule.regime, rule.rate_bps, rule.legal_basis
  from public.users u left join public.researcher_payout_details d on d.user_id = u.id
  where u.id = actor;
end;
$$;
revoke all on function public.get_my_tax_identity() from public, anon;
grant execute on function public.get_my_tax_identity() to authenticated;
