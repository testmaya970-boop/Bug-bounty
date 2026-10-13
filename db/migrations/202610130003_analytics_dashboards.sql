-- Analytics dashboards (2026-10-13): one read per dashboard, each returning a jsonb document
-- the page renders as KPI tiles + charts. All three take a window in days (clamped to
-- 7..730) and also return the previous window's KPIs so the tiles can show a change.
--
--   get_my_researcher_dashboard(p_days)            -- the signed-in researcher's own work
--   get_organization_dashboard(org, p_days)        -- owner / security_admin (same as the
--                                                     other org analytics, 202610060004)
--   get_platform_dashboard(p_days)                 -- platform admins (MFA session)
--
-- Timing follows get_organization_resolution_performance: first response = first triage
-- start or information request in the audit log; resolution = the latest terminal event.
-- Weekly series are zero-filled so a quiet week reads as zero, not as a gap.

create or replace function private.dashboard_since(p_days integer)
returns timestamptz
language sql stable set search_path = ''
as $$
  select now() - make_interval(days => greatest(7, least(coalesce(p_days, 90), 730)));
$$;

-- ---------------------------------------------------------------------------
-- Researcher
-- ---------------------------------------------------------------------------
create or replace function public.get_my_researcher_dashboard(p_days integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  since timestamptz := private.dashboard_since(p_days);
  span interval := now() - private.dashboard_since(p_days);
  result jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  with mine as (
    select r.* from public.reports r where r.researcher_id = actor
  ),
  first_response as (
    select a.entity_id as report_id, min(a.created_at) as at
    from public.audit_logs a join mine m on m.id = a.entity_id
    where a.entity_type = 'report' and a.action in ('report.triage_started', 'report.information_requested')
    group by a.entity_id
  ),
  kpi as (
    select w.label,
      count(*) filter (where m.submitted_at >= w.lo and m.submitted_at < w.hi) as submitted,
      count(*) filter (where m.submitted_at >= w.lo and m.submitted_at < w.hi and m.status in ('accepted', 'resolved')) as valid,
      count(*) filter (where m.submitted_at >= w.lo and m.submitted_at < w.hi and m.status in ('accepted', 'resolved', 'duplicate', 'informative', 'not_applicable', 'rejected')) as decided,
      percentile_cont(0.5) within group (order by extract(epoch from fr.at - m.submitted_at) / 3600.0)
        filter (where m.submitted_at >= w.lo and m.submitted_at < w.hi and fr.at is not null) as median_hours_to_first_response
    from (values ('current', since, now() + interval '1 second'), ('previous', since - span, since)) as w(label, lo, hi)
    cross join mine m
    left join first_response fr on fr.report_id = m.id
    group by w.label
  ),
  awards as (
    select o.currency,
      sum(o.amount_minor_units) filter (where o.created_at >= since and o.status <> 'cancelled') as awarded,
      sum(o.amount_minor_units) filter (where o.created_at >= since - span and o.created_at < since and o.status <> 'cancelled') as awarded_previous,
      sum(o.amount_minor_units) filter (where o.status = 'succeeded' and o.updated_at >= since) as paid
    from public.payment_obligations o
    where o.researcher_id = actor
    group by o.currency
  ),
  weeks as (
    select generate_series(date_trunc('week', since), date_trunc('week', now()), interval '1 week') as week
  ),
  weekly as (
    select wk.week,
      count(m.id) as submitted,
      count(m.id) filter (where m.status in ('accepted', 'resolved')) as valid,
      count(m.id) filter (where m.status in ('not_applicable', 'rejected')) as invalid
    from weeks wk
    left join mine m on date_trunc('week', m.submitted_at) = wk.week
    group by wk.week
  ),
  facts as (
    select f.occurred_at, private.reputation_fact_points(f.fact_type, f.confirmed_severity, f.report_id) as points
    from private.effective_reputation_facts() f
    where f.researcher_id = actor
  ),
  reputation_weekly as (
    select wk.week,
      (select coalesce(sum(f.points), 0) from facts f where f.occurred_at < wk.week + interval '1 week') as score
    from weeks wk
  ),
  earnings_weekly as (
    select wk.week, o.currency, coalesce(sum(o.amount_minor_units), 0) as amount
    from weeks wk
    join public.payment_obligations o on o.researcher_id = actor and o.status <> 'cancelled' and date_trunc('week', o.created_at) = wk.week
    group by wk.week, o.currency
  ),
  programs as (
    select p.id, p.name,
      count(m.id) as submitted,
      count(m.id) filter (where m.status in ('accepted', 'resolved')) as valid
    from mine m join public.programs p on p.id = m.program_id
    where m.submitted_at >= since
    group by p.id, p.name
    order by valid desc, submitted desc
    limit 6
  )
  select jsonb_build_object(
    'since', since,
    'kpis', (select jsonb_object_agg(k.label, jsonb_build_object(
        'submitted', k.submitted, 'valid', k.valid, 'decided', k.decided,
        'median_hours_to_first_response', round(k.median_hours_to_first_response::numeric, 1))) from kpi k),
    'reputation', (select coalesce(sum(f.points), 0) from facts f),
    'reputation_previous', (select coalesce(sum(f.points), 0) from facts f where f.occurred_at < since),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('currency', a.currency, 'awarded', coalesce(a.awarded, 0), 'awarded_previous', coalesce(a.awarded_previous, 0), 'paid', coalesce(a.paid, 0)) order by a.awarded desc nulls last) from awards a), '[]'::jsonb),
    'status', coalesce((select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n)) from (select m.status, count(*) as n from mine m group by m.status) s), '[]'::jsonb),
    'severity', coalesce((select jsonb_agg(jsonb_build_object('severity', s.sev, 'count', s.n)) from (
        select coalesce(m.confirmed_severity::text, 'unrated') as sev, count(*) as n from mine m
        where m.submitted_at >= since and m.status in ('accepted', 'resolved') group by 1) s), '[]'::jsonb),
    'weekly', (select jsonb_agg(jsonb_build_object('week', w.week, 'submitted', w.submitted, 'valid', w.valid, 'invalid', w.invalid) order by w.week) from weekly w),
    'reputation_weekly', (select jsonb_agg(jsonb_build_object('week', r.week, 'score', r.score) order by r.week) from reputation_weekly r),
    'earnings_weekly', coalesce((select jsonb_agg(jsonb_build_object('week', e.week, 'currency', e.currency, 'amount', e.amount) order by e.week) from earnings_weekly e), '[]'::jsonb),
    'programs', coalesce((select jsonb_agg(jsonb_build_object('program_id', p.id, 'name', p.name, 'submitted', p.submitted, 'valid', p.valid)) from programs p), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_my_researcher_dashboard(integer) from public;
grant execute on function public.get_my_researcher_dashboard(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Organization
-- ---------------------------------------------------------------------------
create or replace function public.get_organization_dashboard(target_organization_id uuid, p_days integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  since timestamptz := private.dashboard_since(p_days);
  span interval := now() - private.dashboard_since(p_days);
  result jsonb;
begin
  perform private.authorize_organization_read(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[]);

  with org_reports as (
    select r.* from public.reports r where r.organization_id = target_organization_id
  ),
  first_triage as (
    select a.entity_id as report_id, min(a.created_at) as at
    from public.audit_logs a
    where a.organization_id = target_organization_id and a.entity_type = 'report' and a.action in ('report.triage_started', 'report.information_requested')
    group by a.entity_id
  ),
  terminal as (
    select distinct on (a.entity_id) a.entity_id as report_id, a.created_at as at
    from public.audit_logs a
    where a.organization_id = target_organization_id and a.entity_type = 'report'
      and a.action in ('report.resolved', 'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')
    order by a.entity_id, a.created_at desc
  ),
  kpi as (
    select w.label,
      count(*) filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi) as received,
      count(*) filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi and r.status in ('accepted', 'resolved')) as valid,
      count(*) filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi and r.status in ('accepted', 'resolved', 'duplicate', 'informative', 'not_applicable', 'rejected')) as decided,
      count(distinct r.researcher_id) filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi) as researchers,
      percentile_cont(0.5) within group (order by extract(epoch from ft.at - r.submitted_at) / 3600.0)
        filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi and ft.at is not null) as median_hours_to_triage,
      percentile_cont(0.5) within group (order by extract(epoch from t.at - r.submitted_at) / 86400.0)
        filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi and t.at is not null) as median_days_to_resolution
    from (values ('current', since, now() + interval '1 second'), ('previous', since - span, since)) as w(label, lo, hi)
    cross join org_reports r
    left join first_triage ft on ft.report_id = r.id
    left join terminal t on t.report_id = r.id
    group by w.label
  ),
  awards as (
    select d.currency,
      sum(d.final_amount_minor_units) filter (where d.finalized_at >= since) as awarded,
      sum(d.final_amount_minor_units) filter (where d.finalized_at >= since - span and d.finalized_at < since) as awarded_previous
    from public.report_bounty_decisions d
    where d.organization_id = target_organization_id and d.state = 'finalized'
    group by d.currency
  ),
  weeks as (
    select generate_series(date_trunc('week', since), date_trunc('week', now()), interval '1 week') as week
  ),
  weekly as (
    select wk.week,
      count(r.id) filter (where r.confirmed_severity = 'critical') as critical,
      count(r.id) filter (where r.confirmed_severity = 'high') as high,
      count(r.id) filter (where r.confirmed_severity = 'medium') as medium,
      count(r.id) filter (where r.confirmed_severity = 'low') as low,
      count(r.id) filter (where r.confirmed_severity = 'none') as none,
      count(r.id) filter (where r.confirmed_severity is null) as unrated,
      percentile_cont(0.5) within group (order by extract(epoch from ft.at - r.submitted_at) / 3600.0) filter (where ft.at is not null) as median_hours_to_triage
    from weeks wk
    left join org_reports r on date_trunc('week', r.submitted_at) = wk.week
    left join first_triage ft on ft.report_id = r.id
    group by wk.week
  ),
  weaknesses as (
    select r.weakness_type::text as weakness, count(*) as n
    from org_reports r
    where r.submitted_at >= since and r.status in ('accepted', 'resolved') and r.weakness_type is not null
    group by 1 order by n desc limit 8
  ),
  assets as (
    select coalesce(r.matched_target, r.display_target) as target, count(*) as n,
      count(*) filter (where r.status in ('accepted', 'resolved')) as valid
    from org_reports r
    where r.submitted_at >= since
    group by 1 order by n desc limit 8
  ),
  program_rows as (
    select p.id, p.name, p.status::text as status,
      count(r.id) filter (where r.submitted_at >= since) as received,
      count(r.id) filter (where r.submitted_at >= since and r.status in ('accepted', 'resolved')) as valid,
      count(r.id) filter (where r.status in ('new', 'triaging', 'needs_information', 'accepted')) as open
    from public.programs p
    left join org_reports r on r.program_id = p.id
    where p.organization_id = target_organization_id and p.status <> 'draft'
    group by p.id, p.name, p.status
    order by received desc, p.name
    limit 10
  ),
  top_researchers as (
    select r.researcher_id,
      case when u.deactivated_at is null then u.display_name else 'Deactivated account' end as name,
      count(*) filter (where r.status in ('accepted', 'resolved')) as valid,
      count(*) as submitted
    from org_reports r join public.users u on u.id = r.researcher_id
    where r.submitted_at >= since
    group by r.researcher_id, u.display_name, u.deactivated_at
    order by valid desc, submitted desc
    limit 6
  )
  select jsonb_build_object(
    'since', since,
    'kpis', (select jsonb_object_agg(k.label, jsonb_build_object(
        'received', k.received, 'valid', k.valid, 'decided', k.decided, 'researchers', k.researchers,
        'median_hours_to_triage', round(k.median_hours_to_triage::numeric, 1),
        'median_days_to_resolution', round(k.median_days_to_resolution::numeric, 1))) from kpi k),
    'open_backlog', (select count(*) from org_reports r where r.status in ('new', 'triaging', 'needs_information', 'accepted')),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('currency', a.currency, 'awarded', coalesce(a.awarded, 0), 'awarded_previous', coalesce(a.awarded_previous, 0)) order by a.awarded desc nulls last) from awards a), '[]'::jsonb),
    'weekly', (select jsonb_agg(jsonb_build_object('week', w.week, 'critical', w.critical, 'high', w.high, 'medium', w.medium, 'low', w.low, 'none', w.none, 'unrated', w.unrated,
        'median_hours_to_triage', round(w.median_hours_to_triage::numeric, 1)) order by w.week) from weekly w),
    'weaknesses', coalesce((select jsonb_agg(jsonb_build_object('weakness', x.weakness, 'count', x.n)) from weaknesses x), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('target', x.target, 'count', x.n, 'valid', x.valid)) from assets x), '[]'::jsonb),
    'programs', coalesce((select jsonb_agg(jsonb_build_object('program_id', x.id, 'name', x.name, 'status', x.status, 'received', x.received, 'valid', x.valid, 'open', x.open)) from program_rows x), '[]'::jsonb),
    'researchers', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'valid', x.valid, 'submitted', x.submitted)) from top_researchers x), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_organization_dashboard(uuid, integer) from public;
grant execute on function public.get_organization_dashboard(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------
create or replace function public.get_platform_dashboard(p_days integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  since timestamptz := private.dashboard_since(p_days);
  span interval := now() - private.dashboard_since(p_days);
  result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  with weeks as (
    select generate_series(date_trunc('week', since), date_trunc('week', now()), interval '1 week') as week
  ),
  report_kpi as (
    select w.label,
      count(*) filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi) as reports,
      count(*) filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi and r.status in ('accepted', 'resolved')) as valid,
      count(*) filter (where r.submitted_at >= w.lo and r.submitted_at < w.hi and r.status in ('accepted', 'resolved', 'duplicate', 'informative', 'not_applicable', 'rejected')) as decided
    from (values ('current', since, now() + interval '1 second'), ('previous', since - span, since)) as w(label, lo, hi)
    cross join public.reports r
    group by w.label
  ),
  signup_kpi as (
    select w.label,
      count(*) filter (where u.created_at >= w.lo and u.created_at < w.hi and u.account_type = 'researcher') as researchers,
      count(*) filter (where u.created_at >= w.lo and u.created_at < w.hi and u.account_type = 'organization') as organization_accounts
    from (values ('current', since, now() + interval '1 second'), ('previous', since - span, since)) as w(label, lo, hi)
    cross join public.users u
    where u.email_verified_at is not null
    group by w.label
  ),
  payouts as (
    select o.currency,
      sum(o.amount_minor_units) filter (where o.updated_at >= since) as paid,
      sum(o.amount_minor_units) filter (where o.updated_at >= since - span and o.updated_at < since) as paid_previous
    from public.payment_obligations o
    where o.status = 'succeeded'
    group by o.currency
  ),
  weekly as (
    select wk.week,
      (select count(*) from public.reports r where date_trunc('week', r.submitted_at) = wk.week) as reports,
      (select count(*) from public.reports r where date_trunc('week', r.submitted_at) = wk.week and r.status in ('accepted', 'resolved')) as valid,
      (select count(*) from public.users u where date_trunc('week', u.created_at) = wk.week and u.email_verified_at is not null and u.account_type = 'researcher') as researchers,
      (select count(*) from public.users u where date_trunc('week', u.created_at) = wk.week and u.email_verified_at is not null and u.account_type = 'organization') as organization_accounts
    from weeks wk
  ),
  top_orgs as (
    select o.id, o.name, count(r.id) as reports, count(r.id) filter (where r.status in ('accepted', 'resolved')) as valid
    from public.organizations o
    join public.reports r on r.organization_id = o.id and r.submitted_at >= since
    group by o.id, o.name
    order by reports desc
    limit 8
  )
  select jsonb_build_object(
    'since', since,
    'reports', (select jsonb_object_agg(k.label, jsonb_build_object('reports', k.reports, 'valid', k.valid, 'decided', k.decided)) from report_kpi k),
    'signups', (select jsonb_object_agg(k.label, jsonb_build_object('researchers', k.researchers, 'organization_accounts', k.organization_accounts)) from signup_kpi k),
    'totals', jsonb_build_object(
      'active_organizations', (select count(*) from public.organizations o where o.status = 'active'),
      'researchers', (select count(*) from public.users u where u.account_type = 'researcher' and u.deactivated_at is null and u.email_verified_at is not null),
      'active_programs', (select count(*) from public.programs p where p.status = 'active'),
      'pending_launches', (select count(*) from public.programs p where p.status = 'review'),
      'kyc_pending', (select count(*) from public.researcher_kyc k where k.submitted_at is not null and (k.reviewed_at is null or k.reviewed_at < k.submitted_at)),
      'open_mediations', (select count(*) from public.report_mediations m where m.status::text in ('open', 'escalated')),
      'errors_24h', (select count(*) from public.app_errors e where e.occurred_at >= now() - interval '24 hours')
    ),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('currency', p.currency, 'paid', coalesce(p.paid, 0), 'paid_previous', coalesce(p.paid_previous, 0)) order by p.paid desc nulls last) from payouts p), '[]'::jsonb),
    'weekly', (select jsonb_agg(jsonb_build_object('week', w.week, 'reports', w.reports, 'valid', w.valid, 'researchers', w.researchers, 'organization_accounts', w.organization_accounts) order by w.week) from weekly w),
    'programs_by_status', coalesce((select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n)) from (select p.status::text as status, count(*) as n from public.programs p group by 1) s), '[]'::jsonb),
    'top_organizations', coalesce((select jsonb_agg(jsonb_build_object('organization_id', t.id, 'name', t.name, 'reports', t.reports, 'valid', t.valid)) from top_orgs t), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_platform_dashboard(integer) from public;
grant execute on function public.get_platform_dashboard(integer) to authenticated;
