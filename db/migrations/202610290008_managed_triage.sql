-- Managed Triage (docs/decisions/0091). Unpatched's own triage analysts work an organization's
-- incoming reports, after the organization buys the service:
--
-- 1. Plans and subscriptions. An owner or security admin requests a plan; a platform admin
--    activates it, which charges the first month to the organization's prepaid balance. The
--    worker renews monthly; a renewal the balance can't cover makes the subscription past_due
--    (analyst access stops) until an admin resumes it after adding funds.
-- 2. Service charges are a real ledger entry: the balance and the wallet statement count them.
-- 3. Triage analysts (platform staff, MFA required) pass private.is_program_triager for every
--    program of an organization with an active subscription. Every existing triage action
--    (status changes, duplicate marking, severity/CVSS, messages, internal notes) therefore
--    works for them with the same checks, audit rows and notifications. Money never does: bounty
--    decisions use lock_and_authorize_report_for_finance, which analysts don't pass.
-- 4. Queue: claim/release, a validation assessment (reproduced, suggested severity, duplicate
--    candidate), and customer escalation with an answer -- each audited and notified.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.managed_triage_plans (
  code text primary key check (code in ('standard', 'priority')),
  name text not null,
  description text not null,
  first_response_target_hours integer not null check (first_response_target_hours > 0),
  triage_target_hours integer not null check (triage_target_hours > 0),
  monthly_price_usd_minor_units bigint not null check (monthly_price_usd_minor_units > 0),
  monthly_price_inr_minor_units bigint not null check (monthly_price_inr_minor_units > 0)
);
insert into public.managed_triage_plans values
  ('standard', 'Standard', 'Every report validated, deduplicated and rated by an Unpatched analyst. First response within a business day.', 24, 72, 150000, 12500000),
  ('priority', 'Priority', 'Round-the-clock analysts for programs with critical assets. First response within 4 hours, triaged within a day.', 4, 24, 400000, 33000000);
alter table public.managed_triage_plans enable row level security;
create policy "plans readable by signed-in users" on public.managed_triage_plans for select to authenticated using (true);
revoke all on public.managed_triage_plans from public, anon, authenticated;
grant select on public.managed_triage_plans to authenticated;

create table public.managed_triage_subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_code text not null references public.managed_triage_plans (code),
  currency text not null check (currency in ('INR', 'USD')),
  monthly_price_minor_units bigint not null check (monthly_price_minor_units > 0),
  status text not null check (status in ('requested', 'active', 'past_due', 'cancelled', 'declined')),
  requested_by uuid not null references public.users (id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.users (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  activated_at timestamptz,
  paid_through date,
  updated_at timestamptz not null default now()
);
alter table public.managed_triage_subscriptions enable row level security;
create policy "subscription readable by org admins, finance and platform admins" on public.managed_triage_subscriptions for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_platform_admin());
revoke all on public.managed_triage_subscriptions from public, anon, authenticated;
grant select on public.managed_triage_subscriptions to authenticated;

create table public.organization_service_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  service text not null check (service = 'managed_triage'),
  currency text not null check (currency in ('INR', 'USD')),
  amount_minor_units bigint not null check (amount_minor_units > 0),
  description text not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  charged_by uuid references public.users (id), -- null: an automatic monthly renewal
  created_at timestamptz not null default now(),
  unique (organization_id, service, period_start)
);
alter table public.organization_service_charges enable row level security;
create policy "service charges readable by finance roles and platform admins" on public.organization_service_charges for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_platform_admin());
revoke all on public.organization_service_charges from public, anon, authenticated;
grant select on public.organization_service_charges to authenticated;

create table public.triage_analysts (
  user_id uuid primary key references public.users (id) on delete cascade,
  active boolean not null default true,
  added_by uuid not null references public.users (id),
  added_at timestamptz not null default now()
);
alter table public.triage_analysts enable row level security;
-- Read through list_triage_analysts / get_my_platform_staff only.
revoke all on public.triage_analysts from public, anon, authenticated;

create table public.managed_triage_claims (
  report_id uuid primary key references public.reports (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  analyst_id uuid not null references public.users (id),
  claimed_at timestamptz not null default now()
);
create index managed_triage_claims_analyst_idx on public.managed_triage_claims (analyst_id);

create table public.report_triage_assessments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  assessed_by uuid not null references public.users (id),
  validation text not null check (validation in ('reproduced', 'not_reproduced', 'needs_information', 'out_of_scope')),
  suggested_severity public.report_severity,
  duplicate_of_report_id uuid references public.reports (id) on delete set null,
  notes text not null check (char_length(notes) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index report_triage_assessments_report_idx on public.report_triage_assessments (report_id, created_at desc);

create table public.report_triage_escalations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  raised_by uuid not null references public.users (id),
  reason text not null check (reason in ('severity_decision', 'scope_question', 'business_impact', 'sensitive_data', 'bounty_recommendation', 'other')),
  question text not null check (char_length(question) between 5 and 4000),
  status text not null default 'open' check (status in ('open', 'answered')),
  answer text check (answer is null or char_length(answer) between 1 and 4000),
  answered_by uuid references public.users (id),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index report_triage_escalations_one_open on public.report_triage_escalations (report_id) where status = 'open';
create index report_triage_escalations_org_idx on public.report_triage_escalations (organization_id, status, created_at desc);

-- Triage records are internal: the report's triage team only, never the researcher.
alter table public.managed_triage_claims enable row level security;
alter table public.report_triage_assessments enable row level security;
alter table public.report_triage_escalations enable row level security;
create policy "claims readable by the report's triage team" on public.managed_triage_claims for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id
    and (private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(r.program_id))));
create policy "assessments readable by the report's triage team" on public.report_triage_assessments for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(program_id));
create policy "escalations readable by the report's triage team" on public.report_triage_escalations for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(program_id));
revoke all on public.managed_triage_claims, public.report_triage_assessments, public.report_triage_escalations from public, anon, authenticated;
grant select on public.managed_triage_claims, public.report_triage_assessments, public.report_triage_escalations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who is an analyst, and for which organizations
-- ---------------------------------------------------------------------------

-- Same bar as private.is_platform_admin: an active account on an MFA-verified session.
create or replace function private.is_triage_analyst()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.triage_analysts a where a.user_id = auth.uid() and a.active)
    and private.actor_is_active()
    and exists (
      select 1 from public.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.user_id = auth.uid()
        and s.created_at > now() - interval '30 days'
        and (s.aal = 'aal2' or exists (select 1 from public.mfa_verified_sessions v where v.session_id = s.id and v.user_id = s.user_id))
    );
$$;

create or replace function private.managed_triage_active(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.managed_triage_subscriptions s where s.organization_id = target_organization_id and s.status = 'active');
$$;

-- The analyst row is checked first: for everyone else this adds one indexed lookup that misses.
create or replace function private.is_program_triager(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.program_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
    where pm.program_id = target_program_id and pm.user_id = auth.uid() and pm.role in ('manager', 'triager')
  ) and private.actor_is_active() then
    return true;
  end if;
  return exists (select 1 from public.triage_analysts a where a.user_id = auth.uid() and a.active)
    and private.managed_triage_active((select p.organization_id from public.programs p where p.id = target_program_id))
    and private.is_triage_analyst();
end;
$$;

-- Notification emails re-check that the recipient can still read the report; analysts can,
-- while their organization's subscription is active.
create or replace function private.can_currently_read_report(target_report_id uuid, candidate_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = target_report_id;
  if r.id is null then
    return false;
  end if;

  return r.researcher_id = candidate_user_id
    or exists (select 1 from public.report_collaborators c where c.report_id = r.id and c.researcher_id = candidate_user_id)
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = r.organization_id and om.user_id = candidate_user_id and om.status = 'active' and om.role in ('owner', 'security_admin')
    )
    or exists (
      select 1 from public.program_members pm where pm.program_id = r.program_id and pm.user_id = candidate_user_id
    )
    or (exists (select 1 from public.triage_analysts a where a.user_id = candidate_user_id and a.active) and private.managed_triage_active(r.organization_id));
end;
$$;

revoke all on function private.is_triage_analyst(), private.managed_triage_active(uuid) from public, anon;
grant execute on function private.is_triage_analyst(), private.managed_triage_active(uuid) to authenticated, service_role;

-- One round trip for the app shell: platform admin, analyst, and analyst-without-MFA (shown a
-- prompt to set it up instead of an empty queue).
create or replace function public.get_my_platform_staff()
returns table (platform_admin boolean, triage_analyst boolean, analyst_needs_mfa boolean)
language sql stable security definer set search_path = ''
as $$
  select private.is_platform_admin(), private.is_triage_analyst(),
    exists (select 1 from public.triage_analysts a where a.user_id = auth.uid() and a.active) and not private.is_triage_analyst();
$$;
revoke all on function public.get_my_platform_staff() from public, anon;
grant execute on function public.get_my_platform_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Money: service charges in the balance and the statement
-- ---------------------------------------------------------------------------

-- Same columns as before; a service charge counts as money spent ("paid").
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
    select x.currency, sum(x.committed)::bigint as committed, sum(x.paid)::bigint as paid
    from (
      select o.currency,
        coalesce(sum(o.amount_minor_units + o.platform_fee_minor_units) filter (where o.status in ('pending', 'processing', 'failed')), 0) as committed,
        coalesce(sum(o.amount_minor_units + o.platform_fee_minor_units) filter (where o.status = 'succeeded'), 0) as paid
      from public.payment_obligations o where o.organization_id = p_organization_id and o.funded_from_balance group by o.currency
      union all
      select c.currency, 0, sum(c.amount_minor_units)
      from public.organization_service_charges c where c.organization_id = p_organization_id group by c.currency
    ) x group by x.currency
  )
  select coalesce(d.currency, o.currency), coalesce(d.deposited, 0), coalesce(d.pending_deposits, 0), coalesce(o.committed, 0), coalesce(o.paid, 0),
    coalesce(d.deposited, 0) - coalesce(o.committed, 0) - coalesce(o.paid, 0)
  from d full join o on o.currency = d.currency
  order by 1;
$$;
revoke all on function private.organization_balance(uuid) from public, anon, authenticated;

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
    union all
    select c.created_at, 'service', c.description, 'SVC-' || left(c.id::text, 8), -c.amount_minor_units
    from public.organization_service_charges c
    where c.organization_id = p_organization_id and c.currency = p_currency
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

-- Charges one month starting p_period_start, under the same per-org+currency lock awards use,
-- so a charge and an award can't both spend the same money. False when the balance is short.
create or replace function private.charge_managed_triage(p_organization_id uuid, p_period_start date, p_actor uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  sub public.managed_triage_subscriptions;
  plan public.managed_triage_plans;
  remaining bigint;
  period_end date := (p_period_start + interval '1 month')::date - 1;
begin
  select * into sub from public.managed_triage_subscriptions where organization_id = p_organization_id for update;
  select * into plan from public.managed_triage_plans where code = sub.plan_code;
  perform pg_advisory_xact_lock(hashtextextended('org_balance:' || p_organization_id || ':' || sub.currency, 0));
  select b.available into remaining from private.organization_balance(p_organization_id) b where b.currency = sub.currency;
  if coalesce(remaining, 0) < sub.monthly_price_minor_units then
    return false;
  end if;
  insert into public.organization_service_charges (organization_id, service, currency, amount_minor_units, description, period_start, period_end, charged_by)
  values (p_organization_id, 'managed_triage', sub.currency, sub.monthly_price_minor_units,
    'Managed Triage (' || plan.name || '), ' || to_char(p_period_start, 'DD Mon YYYY') || ' to ' || to_char(period_end, 'DD Mon YYYY'), p_period_start, period_end, p_actor);
  update public.managed_triage_subscriptions set paid_through = period_end, updated_at = now() where organization_id = p_organization_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (p_actor, p_organization_id, 'managed_triage.charged', 'organization', p_organization_id,
    jsonb_build_object('currency', sub.currency, 'amount_minor_units', sub.monthly_price_minor_units, 'period_start', p_period_start, 'period_end', period_end));
  return true;
end;
$$;
revoke all on function private.charge_managed_triage(uuid, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Buying the service (organization) and activating it (platform admin)
-- ---------------------------------------------------------------------------

create or replace function public.request_managed_triage(p_organization_id uuid, p_plan_code text, p_currency text)
returns public.managed_triage_subscriptions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  plan public.managed_triage_plans;
  existing public.managed_triage_subscriptions;
  result public.managed_triage_subscriptions;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can buy Managed Triage' using errcode = '42501';
  end if;
  select * into plan from public.managed_triage_plans where code = p_plan_code;
  if plan.code is null then raise exception 'INVALID_PLAN: choose Standard or Priority' using errcode = '22023'; end if;
  if p_currency not in ('INR', 'USD') then raise exception 'INVALID_CURRENCY: pay in INR or USD' using errcode = '22023'; end if;
  select * into existing from public.managed_triage_subscriptions where organization_id = p_organization_id for update;
  if existing.status in ('requested', 'active', 'past_due') then
    raise exception 'ALREADY_SUBSCRIBED: Managed Triage is already % for this organization', replace(existing.status, '_', ' ') using errcode = '23505';
  end if;
  insert into public.managed_triage_subscriptions (organization_id, plan_code, currency, monthly_price_minor_units, status, requested_by)
  values (p_organization_id, plan.code, p_currency,
    case p_currency when 'USD' then plan.monthly_price_usd_minor_units else plan.monthly_price_inr_minor_units end, 'requested', actor)
  on conflict (organization_id) do update set plan_code = excluded.plan_code, currency = excluded.currency,
    monthly_price_minor_units = excluded.monthly_price_minor_units, status = 'requested', requested_by = actor, requested_at = now(),
    decided_by = null, decided_at = null, decision_note = null, activated_at = null, paid_through = null, updated_at = now()
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'managed_triage.requested', 'organization', p_organization_id, jsonb_build_object('plan', plan.code, 'currency', p_currency));
  return result;
end;
$$;

create or replace function public.decide_managed_triage(p_organization_id uuid, p_approve boolean, p_note text)
returns public.managed_triage_subscriptions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  sub public.managed_triage_subscriptions;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  select * into sub from public.managed_triage_subscriptions where organization_id = p_organization_id for update;
  if sub.organization_id is null or sub.status <> 'requested' then
    raise exception 'NOT_REQUESTED: there is no pending Managed Triage request for this organization' using errcode = '23514';
  end if;
  if not p_approve then
    if v_note is null then raise exception 'NOTE_REQUIRED: tell the organization why the request is declined' using errcode = '22023'; end if;
    update public.managed_triage_subscriptions set status = 'declined', decided_by = actor, decided_at = now(), decision_note = v_note, updated_at = now()
    where organization_id = p_organization_id returning * into sub;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, p_organization_id, 'managed_triage.declined', 'organization', p_organization_id, jsonb_build_object('note', v_note));
    return sub;
  end if;
  if not private.organization_is_operable(p_organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is suspended' using errcode = '42501';
  end if;
  if not private.charge_managed_triage(p_organization_id, current_date, actor) then
    raise exception 'INSUFFICIENT_BALANCE: the first month (% %) is more than the organization''s available balance -- ask them to add funds first',
      sub.currency, round(sub.monthly_price_minor_units / 100.0, 2) using errcode = '23514';
  end if;
  update public.managed_triage_subscriptions set status = 'active', decided_by = actor, decided_at = now(), decision_note = v_note, activated_at = now(), updated_at = now()
  where organization_id = p_organization_id returning * into sub;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'managed_triage.activated', 'organization', p_organization_id, jsonb_build_object('plan', sub.plan_code, 'paid_through', sub.paid_through));
  return sub;
end;
$$;

-- Stops analyst access now. The current month is not refunded (the UI says so before confirming).
create or replace function public.cancel_managed_triage(p_organization_id uuid)
returns public.managed_triage_subscriptions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sub public.managed_triage_subscriptions;
begin
  if not (private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_platform_admin()) then
    raise exception 'FORBIDDEN: only an owner or security admin can cancel Managed Triage' using errcode = '42501';
  end if;
  update public.managed_triage_subscriptions set status = 'cancelled', updated_at = now()
  where organization_id = p_organization_id and status in ('requested', 'active', 'past_due') returning * into sub;
  if sub.organization_id is null then raise exception 'NOT_SUBSCRIBED: Managed Triage is not active for this organization' using errcode = '23514'; end if;
  delete from public.managed_triage_claims where organization_id = p_organization_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'managed_triage.cancelled', 'organization', p_organization_id, '{}'::jsonb);
  return sub;
end;
$$;

-- After a renewal failed: charge a month from today and switch analysts back on.
create or replace function public.resume_managed_triage(p_organization_id uuid)
returns public.managed_triage_subscriptions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sub public.managed_triage_subscriptions;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can resume Managed Triage' using errcode = '42501';
  end if;
  select * into sub from public.managed_triage_subscriptions where organization_id = p_organization_id for update;
  if sub.status is distinct from 'past_due' then raise exception 'NOT_PAST_DUE: only a subscription waiting for payment can be resumed' using errcode = '23514'; end if;
  if not private.charge_managed_triage(p_organization_id, current_date, actor) then
    raise exception 'INSUFFICIENT_BALANCE: a month of Managed Triage is % %; add funds first', sub.currency, round(sub.monthly_price_minor_units / 100.0, 2) using errcode = '23514';
  end if;
  update public.managed_triage_subscriptions set status = 'active', updated_at = now() where organization_id = p_organization_id returning * into sub;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'managed_triage.resumed', 'organization', p_organization_id, jsonb_build_object('paid_through', sub.paid_through));
  return sub;
end;
$$;

-- Worker, daily: charge the next month for every subscription whose paid month has ended.
create or replace function public.renew_managed_triage_subscriptions()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  sub public.managed_triage_subscriptions;
  n integer := 0;
begin
  for sub in select * from public.managed_triage_subscriptions where status = 'active' and paid_through < current_date for update skip locked loop
    if private.charge_managed_triage(sub.organization_id, sub.paid_through + 1, null) then
      n := n + 1;
    else
      update public.managed_triage_subscriptions set status = 'past_due', updated_at = now() where organization_id = sub.organization_id;
      delete from public.managed_triage_claims where organization_id = sub.organization_id;
      insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
      values (null, sub.organization_id, 'managed_triage.past_due', 'organization', sub.organization_id,
        jsonb_build_object('currency', sub.currency, 'amount_minor_units', sub.monthly_price_minor_units));
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.renew_managed_triage_subscriptions() from public, anon, authenticated;
grant execute on function public.renew_managed_triage_subscriptions() to service_role;

create or replace function public.list_managed_triage_subscriptions()
returns table (organization_id uuid, organization_name text, plan_code text, plan_name text, currency text, monthly_price_minor_units bigint,
  status text, requested_by_name text, requested_at timestamptz, activated_at timestamptz, paid_through date, decision_note text,
  available_minor_units bigint, open_reports bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select s.organization_id, o.name, s.plan_code, p.name, s.currency, s.monthly_price_minor_units, s.status, u.display_name, s.requested_at,
    s.activated_at, s.paid_through, s.decision_note,
    (select b.available from private.organization_balance(s.organization_id) b where b.currency = s.currency),
    (select count(*) from public.reports r where r.organization_id = s.organization_id and r.status in ('new', 'triaging', 'needs_information'))
  from public.managed_triage_subscriptions s
  join public.organizations o on o.id = s.organization_id
  join public.managed_triage_plans p on p.code = s.plan_code
  left join public.users u on u.id = s.requested_by
  order by (s.status = 'requested') desc, s.requested_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Analysts (platform admin)
-- ---------------------------------------------------------------------------

create or replace function public.add_triage_analyst(p_email text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.users;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  select * into target from public.users where lower(email) = lower(trim(p_email));
  if target.id is null then raise exception 'USER_NOT_FOUND: no Unpatched account uses that email' using errcode = 'P0002'; end if;
  -- Platform staff stay separate from customers: an analyst may not belong to any organization.
  if exists (select 1 from public.organization_members m where m.user_id = target.id and m.status = 'active') then
    raise exception 'ANALYST_CONFLICT: this account belongs to an organization, so it can''t triage for other organizations' using errcode = '23514';
  end if;
  insert into public.triage_analysts (user_id, added_by) values (target.id, actor)
  on conflict (user_id) do update set active = true, added_by = actor, added_at = now();
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.triage_analyst_added', 'user', target.id, jsonb_build_object('email', target.email));
  return target.id;
end;
$$;

create or replace function public.remove_triage_analyst(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  update public.triage_analysts set active = false where user_id = p_user_id;
  if not found then raise exception 'NOT_FOUND: not a triage analyst' using errcode = 'P0002'; end if;
  delete from public.managed_triage_claims where analyst_id = p_user_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), null, 'platform.triage_analyst_removed', 'user', p_user_id, '{}'::jsonb);
end;
$$;

create or replace function public.list_triage_analysts()
returns table (user_id uuid, display_name text, email text, added_at timestamptz, has_mfa boolean, open_claims bigint, actions_30d bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select a.user_id, u.display_name, u.email, a.added_at,
    exists (select 1 from public.mfa_factors f where f.user_id = a.user_id),
    (select count(*) from public.managed_triage_claims c where c.analyst_id = a.user_id),
    (select count(*) from public.audit_logs l where l.actor_id = a.user_id and l.entity_type = 'report' and l.created_at > now() - interval '30 days')
  from public.triage_analysts a join public.users u on u.id = a.user_id
  where a.active order by u.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The analyst queue
-- ---------------------------------------------------------------------------

-- p_view: 'unclaimed' | 'mine' | 'escalated' | 'all' (open work). SLA targets are the plan's,
-- counted from submission or activation, whichever is later.
create or replace function public.list_managed_triage_queue(p_view text default 'all', p_organization_id uuid default null)
returns table (report_id uuid, title text, organization_id uuid, organization_name text, program_id uuid, program_name text, status text,
  researcher_severity text, confirmed_severity text, submitted_at timestamptz, plan_code text,
  first_response_due_at timestamptz, first_responded_at timestamptz, triage_due_at timestamptz, triaged_at timestamptz,
  claimed_by uuid, claimed_by_name text, open_escalation boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not private.is_triage_analyst() then raise exception 'FORBIDDEN: triage analyst authority required' using errcode = '42501'; end if;
  if p_view not in ('unclaimed', 'mine', 'escalated', 'all') then raise exception 'INVALID_VIEW: unknown queue view' using errcode = '22023'; end if;
  return query
  select r.id, r.title, r.organization_id, o.name, r.program_id, p.name, r.status::text, r.researcher_severity::text, r.confirmed_severity::text,
    r.submitted_at, s.plan_code,
    greatest(r.submitted_at, s.activated_at) + make_interval(hours => pl.first_response_target_hours), sla.first_responded_at,
    greatest(r.submitted_at, s.activated_at) + make_interval(hours => pl.triage_target_hours), sla.triaged_at,
    c.analyst_id, cu.display_name,
    exists (select 1 from public.report_triage_escalations e where e.report_id = r.id and e.status = 'open')
  from public.reports r
  join public.managed_triage_subscriptions s on s.organization_id = r.organization_id and s.status = 'active'
  join public.managed_triage_plans pl on pl.code = s.plan_code
  join public.organizations o on o.id = r.organization_id
  join public.programs p on p.id = r.program_id
  left join public.managed_triage_claims c on c.report_id = r.id
  left join public.users cu on cu.id = c.analyst_id
  cross join lateral private.report_sla(r.id) sla
  where r.status in ('new', 'triaging', 'needs_information', 'accepted')
    and (r.status <> 'accepted' or exists (select 1 from public.report_triage_escalations e where e.report_id = r.id and e.status = 'open'))
    and (p_organization_id is null or r.organization_id = p_organization_id)
    and r.researcher_id <> actor
    and (p_view = 'all'
      or (p_view = 'unclaimed' and c.report_id is null)
      or (p_view = 'mine' and c.analyst_id = actor)
      or (p_view = 'escalated' and exists (select 1 from public.report_triage_escalations e where e.report_id = r.id and e.status = 'open')))
  order by least(
      case when sla.first_responded_at is null then greatest(r.submitted_at, s.activated_at) + make_interval(hours => pl.first_response_target_hours) end,
      case when sla.triaged_at is null then greatest(r.submitted_at, s.activated_at) + make_interval(hours => pl.triage_target_hours) end
    ) nulls last, r.submitted_at;
end;
$$;

create or replace function private.authorize_managed_report(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  report public.reports;
begin
  if not private.is_triage_analyst() then raise exception 'FORBIDDEN: triage analyst authority required' using errcode = '42501'; end if;
  select * into report from public.reports where id = target_report_id for update;
  if report.id is null or not private.managed_triage_active(report.organization_id) then
    raise exception 'REPORT_NOT_FOUND: report not found in a managed program' using errcode = 'P0002';
  end if;
  perform private.forbid_self_dealing(report.id);
  return report;
end;
$$;
revoke all on function private.authorize_managed_report(uuid) from public, anon, authenticated;

create or replace function public.claim_managed_report(target_report_id uuid, p_take_over boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports := private.authorize_managed_report(target_report_id);
  holder uuid;
begin
  select analyst_id into holder from public.managed_triage_claims where report_id = report.id for update;
  if holder = actor then return; end if;
  if holder is not null and not p_take_over then
    raise exception 'ALREADY_CLAIMED: another analyst is working on this report' using errcode = '23505';
  end if;
  insert into public.managed_triage_claims (report_id, organization_id, analyst_id) values (report.id, report.organization_id, actor)
  on conflict (report_id) do update set analyst_id = actor, claimed_at = now();
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.triage_claimed', 'report', report.id, jsonb_build_object('previous_analyst_id', holder));
end;
$$;

create or replace function public.release_managed_report(target_report_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports := private.authorize_managed_report(target_report_id);
begin
  delete from public.managed_triage_claims where report_id = report.id and analyst_id = actor;
  if not found then raise exception 'NOT_CLAIMED: you are not working on this report' using errcode = '23514'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.triage_released', 'report', report.id, '{}'::jsonb);
end;
$$;

-- Validation assessment: internal, never shown to the researcher. Anyone who can triage the
-- report may record one (analysts and the organization's own triagers alike).
create or replace function public.record_triage_assessment(target_report_id uuid, p_validation text, p_suggested_severity text, p_duplicate_of uuid, p_notes text)
returns public.report_triage_assessments
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports := private.lock_and_authorize_report_for_triage(target_report_id);
  v_notes text := trim(coalesce(p_notes, ''));
  result public.report_triage_assessments;
begin
  if p_validation not in ('reproduced', 'not_reproduced', 'needs_information', 'out_of_scope') then
    raise exception 'INVALID_ASSESSMENT: choose a validation outcome' using errcode = '22023';
  end if;
  if char_length(v_notes) < 1 or char_length(v_notes) > 4000 then raise exception 'INVALID_ASSESSMENT: write what you checked (up to 4000 characters)' using errcode = '22023'; end if;
  if p_duplicate_of is not null and not exists (select 1 from public.reports d where d.id = p_duplicate_of and d.program_id = report.program_id and d.id <> report.id) then
    raise exception 'INVALID_DUPLICATE: the original must be another report in the same program' using errcode = '22023';
  end if;
  insert into public.report_triage_assessments (report_id, organization_id, program_id, assessed_by, validation, suggested_severity, duplicate_of_report_id, notes)
  values (report.id, report.organization_id, report.program_id, actor, p_validation, nullif(p_suggested_severity, '')::public.report_severity, p_duplicate_of, v_notes)
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.triage_validated', 'report', report.id,
    jsonb_build_object('validation', p_validation, 'suggested_severity', nullif(p_suggested_severity, ''), 'duplicate_of_report_id', p_duplicate_of));
  return result;
end;
$$;

create or replace function public.escalate_report_to_customer(target_report_id uuid, p_reason text, p_question text)
returns public.report_triage_escalations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports := private.authorize_managed_report(target_report_id);
  v_question text := trim(coalesce(p_question, ''));
  result public.report_triage_escalations;
begin
  if p_reason not in ('severity_decision', 'scope_question', 'business_impact', 'sensitive_data', 'bounty_recommendation', 'other') then
    raise exception 'INVALID_ESCALATION: choose why the customer needs to decide' using errcode = '22023';
  end if;
  if char_length(v_question) < 5 or char_length(v_question) > 4000 then
    raise exception 'INVALID_ESCALATION: ask the customer a question (5 to 4000 characters)' using errcode = '22023';
  end if;
  if exists (select 1 from public.report_triage_escalations e where e.report_id = report.id and e.status = 'open') then
    raise exception 'ALREADY_ESCALATED: this report already has an open question for the customer' using errcode = '23505';
  end if;
  insert into public.report_triage_escalations (report_id, organization_id, program_id, raised_by, reason, question)
  values (report.id, report.organization_id, report.program_id, actor, p_reason, v_question)
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.triage_escalated', 'report', report.id, jsonb_build_object('escalation_id', result.id, 'reason', p_reason));
  return result;
end;
$$;

-- The customer answers: owners, security admins and the program's own team -- not analysts.
create or replace function public.answer_triage_escalation(p_escalation_id uuid, p_answer text)
returns public.report_triage_escalations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_answer text := trim(coalesce(p_answer, ''));
  esc public.report_triage_escalations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into esc from public.report_triage_escalations where id = p_escalation_id for update;
  if esc.id is null or not (
    private.has_org_role(esc.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or exists (select 1 from public.program_members pm join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
               where pm.program_id = esc.program_id and pm.user_id = actor)
  ) then
    raise exception 'NOT_FOUND: escalation not found' using errcode = 'P0002';
  end if;
  if esc.status <> 'open' then raise exception 'ALREADY_ANSWERED: this question was already answered' using errcode = '23514'; end if;
  if char_length(v_answer) < 1 or char_length(v_answer) > 4000 then raise exception 'INVALID_ANSWER: write an answer (up to 4000 characters)' using errcode = '22023'; end if;
  update public.report_triage_escalations set status = 'answered', answer = v_answer, answered_by = actor, answered_at = now()
  where id = esc.id returning * into esc;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, esc.organization_id, 'report.escalation_answered', 'report', esc.report_id, jsonb_build_object('escalation_id', esc.id, 'analyst_id', esc.raised_by));
  return esc;
end;
$$;

-- Organization view: how the service is performing since activation.
create or replace function public.get_managed_triage_performance(p_organization_id uuid)
returns table (reports_handled bigint, first_response_met bigint, first_response_measured bigint, triage_met bigint, triage_measured bigint,
  open_escalations bigint, assessments bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  sub public.managed_triage_subscriptions;
  plan public.managed_triage_plans;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can view Managed Triage' using errcode = '42501';
  end if;
  select * into sub from public.managed_triage_subscriptions where organization_id = p_organization_id;
  select * into plan from public.managed_triage_plans where code = sub.plan_code;
  return query
  with r as (
    select rp.id, greatest(rp.submitted_at, sub.activated_at) as start_at, sla.first_responded_at, sla.triaged_at
    from public.reports rp cross join lateral private.report_sla(rp.id) sla
    where rp.organization_id = p_organization_id and sub.activated_at is not null and rp.submitted_at >= sub.activated_at - interval '30 days'
      and (sla.first_responded_at is null or sla.first_responded_at >= sub.activated_at)
  )
  select count(*),
    count(*) filter (where r.first_responded_at <= r.start_at + make_interval(hours => plan.first_response_target_hours)),
    count(*) filter (where r.first_responded_at is not null or now() > r.start_at + make_interval(hours => plan.first_response_target_hours)),
    count(*) filter (where r.triaged_at <= r.start_at + make_interval(hours => plan.triage_target_hours)),
    count(*) filter (where r.triaged_at is not null or now() > r.start_at + make_interval(hours => plan.triage_target_hours)),
    (select count(*) from public.report_triage_escalations e where e.organization_id = p_organization_id and e.status = 'open'),
    (select count(*) from public.report_triage_assessments a where a.organization_id = p_organization_id and a.created_at >= coalesce(sub.activated_at, now()))
  from r;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.request_managed_triage(uuid, text, text)', 'public.decide_managed_triage(uuid, boolean, text)', 'public.cancel_managed_triage(uuid)',
    'public.resume_managed_triage(uuid)', 'public.list_managed_triage_subscriptions()', 'public.add_triage_analyst(text)',
    'public.remove_triage_analyst(uuid)', 'public.list_triage_analysts()', 'public.list_managed_triage_queue(text, uuid)',
    'public.claim_managed_report(uuid, boolean)', 'public.release_managed_report(uuid)',
    'public.record_triage_assessment(uuid, text, text, uuid, text)', 'public.escalate_report_to_customer(uuid, text, text)',
    'public.answer_triage_escalation(uuid, text)', 'public.get_managed_triage_performance(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Notifications: an escalation to the organization, its answer to the analyst
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable',
  'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted', 'report_message_posted', 'program_suspended',
  'program_reinstated', 'organization_suspended', 'organization_reinstated', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded',
  'payment_failed', 'payment_cancelled', 'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided',
  'report_mediation_resolved', 'report_reopened', 'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined',
  'report_disclosure_unpublished', 'deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued',
  'program_launch_approved', 'program_launch_rejected', 'program_paused', 'program_resumed', 'program_closed', 'program_scope_changed',
  'program_recommended', 'report_triage_escalated', 'report_escalation_answered']));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array['report_created', 'report_needs_information', 'report_resolved', 'report_duplicate',
    'report_informative', 'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted',
    'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened',
    'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined', 'report_disclosure_unpublished',
    'report_triage_escalated', 'report_escalation_answered']))
  or (category = 'bounty_activity' and notification_type = any (array['bounty_finalized', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled']))
  or (category = 'platform_activity' and notification_type = any (array['program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated', 'program_launch_approved', 'program_launch_rejected']))
  or (category = 'billing_activity' and notification_type = any (array['deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued']))
  or (category = 'program_activity' and notification_type = any (array['program_paused', 'program_resumed', 'program_closed', 'program_scope_changed']))
  or (category = 'program_recommendations' and notification_type = 'program_recommended')
);

create or replace function private.enqueue_payment_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  recipient uuid;
begin
  if new.action like 'payment.%' then
    select o.researcher_id into recipient from public.payment_obligations o where o.id = (new.metadata ->> 'obligation_id')::uuid;
  elsif new.action in ('bounty.adjusted', 'report.retest_decided', 'report.mediation_resolved', 'report.reopened',
                       'report_disclosure.approved', 'report_disclosure.declined', 'report_disclosure.unpublished') then
    select r.researcher_id into recipient from public.reports r where r.id = new.entity_id;
  elsif new.action = 'report.assigned' then
    recipient := nullif((new.metadata ->> 'assignee_id')::uuid, new.actor_id);
  elsif new.action = 'report.escalation_answered' then
    recipient := (new.metadata ->> 'analyst_id')::uuid;
  end if;

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload, occurred_at)
  values (new.action, 1, 'report', new.entity_id, new.organization_id,
    jsonb_build_object('audit_log_id', new.id, 'report_id', new.entity_id, 'recipient_id', recipient), new.created_at);
  return new;
end;
$$;

drop trigger audit_logs_enqueue_payment_event on public.audit_logs;
create trigger audit_logs_enqueue_payment_event
  after insert on public.audit_logs
  for each row
  when (new.action in ('payment.obligation_created', 'payment.succeeded', 'payment.failed', 'payment.cancelled', 'bounty.adjusted',
                       'report.mediation_opened', 'report.mediation_resolved', 'report.assigned', 'report.retest_requested',
                       'report.retest_decided', 'report.reopened',
                       'report_disclosure.requested', 'report_disclosure.approved', 'report_disclosure.declined', 'report_disclosure.unpublished',
                       'report.triage_escalated', 'report.escalation_answered'))
  execute function private.enqueue_payment_event();

create or replace function public.route_payment_notifications(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  report public.reports;
  expected_action text;
  v_category text;
  recipient uuid;
begin
  expected_action := case p_notification_type
    when 'payment_scheduled' then 'payment.obligation_created'
    when 'payment_succeeded' then 'payment.succeeded'
    when 'payment_failed' then 'payment.failed'
    when 'payment_cancelled' then 'payment.cancelled'
    when 'bounty_adjusted' then 'bounty.adjusted'
    when 'report_mediation_opened' then 'report.mediation_opened'
    when 'report_mediation_resolved' then 'report.mediation_resolved'
    when 'report_assigned' then 'report.assigned'
    when 'report_retest_requested' then 'report.retest_requested'
    when 'report_retest_decided' then 'report.retest_decided'
    when 'report_reopened' then 'report.reopened'
    when 'report_disclosure_requested' then 'report_disclosure.requested'
    when 'report_disclosure_approved' then 'report_disclosure.approved'
    when 'report_disclosure_declined' then 'report_disclosure.declined'
    when 'report_disclosure_unpublished' then 'report_disclosure.unpublished'
    when 'report_triage_escalated' then 'report.triage_escalated'
    when 'report_escalation_answered' then 'report.escalation_answered'
  end;
  if expected_action is null then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a routed report notification type', p_notification_type using errcode = '22023';
  end if;

  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.audit_logs al
    where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = expected_action and al.entity_id = ev.aggregate_id
  ) then
    raise exception 'PROVENANCE_MISMATCH: no matching audit record for this notification' using errcode = '23514';
  end if;

  select * into report from public.reports where id = ev.aggregate_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002'; end if;

  v_category := case when p_notification_type in ('bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled')
                     then 'bounty_activity' else 'report_activity' end;

  if p_notification_type in ('report_mediation_opened', 'report_retest_requested', 'report_disclosure_requested', 'report_triage_escalated') then
    for recipient in select * from private.resolve_report_organization_recipients(report.id) loop
      if coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true) then
        insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
        values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, ev.id, ev.occurred_at)
        on conflict (source_event_id, recipient_id) do nothing;
      end if;
    end loop;
  else
    recipient := (ev.payload ->> 'recipient_id')::uuid;
    if recipient is not null and (v_category = 'bounty_activity'
        or coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true)) then
      insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
      values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, ev.id, ev.occurred_at)
      on conflict (source_event_id, recipient_id) do nothing;
    end if;
  end if;

  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;
