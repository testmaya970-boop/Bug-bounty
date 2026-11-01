-- 1. The platform fee moves from the organization to the researcher (product decision,
--    2026-10-23), for every award created from now on. Awards created before keep the old
--    model: the organization paid bounty + fee and the researcher received the full bounty.
--
--    New obligations store the organization's fee as 0 and the fee in researcher_fee_minor_units.
--    Every organization-side calculation (balance, budgets, fee invoices, statements) already
--    reads amount + platform_fee, so it now commits and bills the bounty only, with no function
--    body copied forward. The fee is taken at payout (private.apply_payout_withholding): the
--    researcher receives bounty - TDS (on the full bounty) - fee - GST on the fee (18% for an
--    Indian tax resident; an export of services, zero-rated, otherwise), and gets a numbered
--    GST invoice for the fee.
--
-- 2. search_organization_audit_log: the organization's audit log with category, text and date
--    filters, actor names included (owner and security admin only, like audit_logs' policy).

-- ---------------------------------------------------------------- fee from the researcher
alter table public.payment_obligations add column researcher_fee_minor_units bigint not null default 0 check (researcher_fee_minor_units >= 0);
comment on column public.payment_obligations.platform_fee_minor_units is
  'Platform fee billed to the ORGANIZATION on top of the bounty. 0 for awards created from 2026-10-23, whose fee is researcher_fee_minor_units instead.';
comment on column public.payment_obligations.researcher_fee_minor_units is
  'Platform fee taken from the researcher''s payout (awards created from 2026-10-23), frozen at creation. The organization pays the bounty only.';

-- Runs before the balance/budget guards (trigger names fire in alphabetical order), so they
-- see the organization's real charge: the bounty alone.
create or replace function private.fee_from_researcher() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.researcher_fee_minor_units := new.platform_fee_minor_units;
  new.platform_fee_minor_units := 0;
  return new;
end;
$$;
revoke all on function private.fee_from_researcher() from public, anon, authenticated;
grant execute on function private.fee_from_researcher() to service_role;
create trigger payment_obligations_a_fee_from_researcher before insert on public.payment_obligations
  for each row execute function private.fee_from_researcher();

alter table public.payout_tax_withholdings
  add column fee_minor_units bigint not null default 0 check (fee_minor_units >= 0),
  add column fee_gst_minor_units bigint not null default 0 check (fee_gst_minor_units >= 0),
  add column fee_invoice_number text unique;
alter table public.payout_tax_withholdings drop constraint payout_tax_withholdings_adds_up;
alter table public.payout_tax_withholdings add constraint payout_tax_withholdings_adds_up
  check (net_minor_units = gross_minor_units - withheld_minor_units - fee_minor_units - fee_gst_minor_units);

create table public.researcher_fee_invoice_sequences (
  financial_year text primary key check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  last_number integer not null default 0
);
alter table public.researcher_fee_invoice_sequences enable row level security;
revoke all on public.researcher_fee_invoice_sequences from public, anon, authenticated;

-- First attempt: decide and freeze tax, fee and GST. Every attempt (retries too) asks for the net.
create or replace function private.apply_payout_withholding() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ob public.payment_obligations;
  w public.payout_tax_withholdings;
  rule record;
  withheld bigint;
  fee bigint;
  fee_gst bigint := 0;
  fy text := private.financial_year_of(current_date);
  seq integer;
  invoice_number text;
begin
  select * into w from public.payout_tax_withholdings where obligation_id = new.payment_obligation_id;
  if w.obligation_id is null then
    select * into ob from public.payment_obligations where id = new.payment_obligation_id;
    select * into rule from private.payout_withholding_rule(ob.researcher_id);
    -- TDS on the full bounty; half a minor unit rounds up, like the GST lines on invoices.
    withheld := (ob.amount_minor_units * coalesce(rule.rate_bps, 0) + 5000) / 10000;
    fee := ob.researcher_fee_minor_units;
    if fee > 0 then
      if rule.country = 'IN' then fee_gst := (fee * 18 + 50) / 100; end if;
      insert into public.researcher_fee_invoice_sequences (financial_year, last_number) values (fy, 1)
      on conflict (financial_year) do update set last_number = public.researcher_fee_invoice_sequences.last_number + 1
      returning last_number into seq;
      invoice_number := 'UNP-RF/' || fy || '/' || lpad(seq::text, 5, '0');
    end if;
    if ob.amount_minor_units - withheld - fee - fee_gst <= 0 then
      raise exception 'PAYOUT_NOT_POSITIVE: tax and fee would take the whole bounty' using errcode = '23514';
    end if;
    insert into public.payout_tax_withholdings (obligation_id, researcher_id, country, regime, rate_bps, legal_basis, currency, gross_minor_units, withheld_minor_units,
      fee_minor_units, fee_gst_minor_units, fee_invoice_number, net_minor_units)
    values (ob.id, ob.researcher_id, rule.country, coalesce(rule.regime, 'none'), coalesce(rule.rate_bps, 0), coalesce(rule.legal_basis, 'No withholding for this tax residence'),
      ob.currency, ob.amount_minor_units, withheld, fee, fee_gst, invoice_number, ob.amount_minor_units - withheld - fee - fee_gst)
    returning * into w;
  end if;
  new.requested_amount_minor_units := w.net_minor_units;
  return new;
end;
$$;

drop function public.list_my_payouts(date, date);
create function public.list_my_payouts(p_from date default null, p_to date default null)
returns table (obligation_id uuid, paid_at timestamptz, provider text, provider_reference text, organization_name text, program_name text, report_title text,
  currency text, gross_minor_units bigint, withheld_minor_units bigint, fee_minor_units bigint, fee_gst_minor_units bigint, fee_invoice_number text,
  net_minor_units bigint, regime text, rate_bps integer, legal_basis text, country text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'UNAUTHENTICATED: sign in again' using errcode = '42501'; end if;
  return query
  select o.id, pa.completed_at, pa.provider, pa.provider_reference_id, org.name, p.name, r.title, o.currency, o.amount_minor_units,
    coalesce(w.withheld_minor_units, 0), coalesce(w.fee_minor_units, 0), coalesce(w.fee_gst_minor_units, 0), w.fee_invoice_number,
    coalesce(w.net_minor_units, o.amount_minor_units), coalesce(w.regime, 'none'), coalesce(w.rate_bps, 0),
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

-- ---------------------------------------------------------------- audit log search
-- Category is a fixed vocabulary over action prefixes; q matches the action, the actor's name
-- or any recorded detail (target, previous/new values). Keyset-paginated, newest first.
create or replace function public.search_organization_audit_log(p_organization_id uuid, p_category text, p_query text, p_from date, p_to date,
  p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 50)
returns table (id uuid, created_at timestamptz, actor_id uuid, actor_name text, action text, entity_type text, entity_id uuid, metadata jsonb)
language plpgsql stable security definer set search_path = ''
as $$
declare
  term text := nullif(trim(coalesce(p_query, '')), '');
  prefixes text[] := case p_category
    when 'scope' then array['scope.', 'asset.', 'report.asset_']
    when 'programs' then array['program.', 'platform.program_']
    when 'members' then array['member.']
    when 'researchers' then array['researcher.']
    when 'reports' then array['report.', 'report_disclosure.', 'bounty.']
    when 'billing' then array['billing.', 'payment.']
    when 'organization' then array['organization.', 'platform.organization_']
    else null end;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can read the audit log' using errcode = '42501';
  end if;
  return query
  select l.id, l.created_at, l.actor_id, u.display_name, l.action, l.entity_type, l.entity_id, coalesce(l.metadata, '{}'::jsonb)
  from public.audit_logs l
  left join public.users u on u.id = l.actor_id
  where l.organization_id = p_organization_id
    and (prefixes is null or exists (select 1 from unnest(prefixes) pre where l.action like pre || '%'))
    and (term is null or l.action ilike '%' || term || '%' or u.display_name ilike '%' || term || '%' or l.metadata::text ilike '%' || term || '%')
    and (p_from is null or l.created_at >= p_from::timestamp at time zone 'UTC')
    and (p_to is null or l.created_at < (p_to + 1)::timestamp at time zone 'UTC')
    and (p_before is null or (l.created_at, l.id) < (p_before, p_before_id))
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.search_organization_audit_log(uuid, text, text, date, date, timestamptz, uuid, integer) from public, anon;
grant execute on function public.search_organization_audit_log(uuid, text, text, date, date, timestamptz, uuid, integer) to authenticated;
