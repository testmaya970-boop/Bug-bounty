-- Real organization-facing report analytics. Closes a genuine gap, not a mock-to-real
-- swap: no analytics surface of any kind previously existed under app/organizations/ --
-- the org home page and program control center show real lists but zero aggregates,
-- charts, or time-based metrics. This adds three focused, real-from-day-one RPCs (one per
-- real question, matching this codebase's own established pattern rather than one
-- mega-query flattening unrelated dimensions into a single denormalized row set) --
-- deliberately never routed through lib/mock/* the way the researcher-facing Reports page
-- analytics is (that page's own mock is a separate, already-disclosed exception -- see
-- lib/mock/report-analytics.ts's own comment -- this is not an extension of it).
--
-- Time-based metrics (time-to-first-triage, time-to-resolution) are computed from
-- audit_logs, which already logs every real triage transition (report.triage_started,
-- report.resolved, report.marked_duplicate, report.marked_informative,
-- report.marked_not_applicable, report.rejected) with a real created_at -- no new
-- state-log table needed. A report-specific index is added below since audit_logs was
-- previously only indexed on (organization_id, created_at).

create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at);

-- ---------------------------------------------------------------------------
-- private.authorize_organization_analytics_read: shared authorization for all three RPCs
-- below -- identical gate to the org home page's own (any active organization member, not
-- narrowed to owner/security_admin). Read-only descriptive data, never a mutation, so it
-- carries the same broad-read posture 0013 already established for bounty decisions.
-- ---------------------------------------------------------------------------

create or replace function private.authorize_organization_analytics_read(target_organization_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = actor and status = 'active'
  ) then
    raise exception 'FORBIDDEN: actor is not an active member of this organization' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.authorize_organization_analytics_read(uuid) from public;

-- ---------------------------------------------------------------------------
-- get_organization_severity_status_breakdown: real severity x status counts, computed on
-- every call rather than cached/materialized -- report volume in this domain
-- (per-organization, not platform-wide) never approaches a scale where that matters, and a
-- cached aggregate that can silently drift from the real reports rows is a worse failure
-- mode than a few extra milliseconds. Zero-count combinations are simply absent, never a
-- fabricated placeholder row -- the same convention the researcher-facing mock analytics
-- already uses (lib/mock/report-analytics.ts's computeSeverityStatusCells), now for real.
-- ---------------------------------------------------------------------------

create or replace function public.get_organization_severity_status_breakdown(target_organization_id uuid)
returns table (severity public.report_severity, status public.report_status, count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  select r.confirmed_severity, r.status, count(*)
  from public.reports r
  where r.organization_id = target_organization_id
  group by r.confirmed_severity, r.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_organization_weekly_report_volume: one row per week over the last 12 weeks
-- (including weeks with zero activity, so a chart never has to fabricate a gap) --
-- submitted counts by submission week, resolved/other-closed counts by the week of their
-- most recent terminal audit_logs event (never by current status, which could double-
-- count a report that transitioned through duplicate then got manually corrected --
-- there is no such correction path in this schema, but keying off the LATEST terminal
-- event rather than the first is the same defensive choice regardless).
-- ---------------------------------------------------------------------------

create or replace function public.get_organization_weekly_report_volume(target_organization_id uuid)
returns table (week_start date, submitted_count bigint, resolved_count bigint, other_closed_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  with weeks as (
    select (date_trunc('week', now()) - (n * interval '7 days'))::date as week_start
    from generate_series(0, 11) as n
  ),
  submitted as (
    select date_trunc('week', r.submitted_at)::date as week_start, count(*) as cnt
    from public.reports r
    where r.organization_id = target_organization_id and r.submitted_at >= now() - interval '12 weeks'
    group by 1
  ),
  latest_terminal_event as (
    select distinct on (a.entity_id) a.entity_id as report_id, a.action, a.created_at
    from public.audit_logs a
    where a.organization_id = target_organization_id
      and a.entity_type = 'report'
      and a.action in ('report.resolved', 'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')
    order by a.entity_id, a.created_at desc
  ),
  closed as (
    select date_trunc('week', e.created_at)::date as week_start,
      count(*) filter (where e.action = 'report.resolved') as resolved_cnt,
      count(*) filter (where e.action <> 'report.resolved') as other_closed_cnt
    from latest_terminal_event e
    where e.created_at >= now() - interval '12 weeks'
    group by 1
  )
  select w.week_start, coalesce(s.cnt, 0), coalesce(c.resolved_cnt, 0), coalesce(c.other_closed_cnt, 0)
  from weeks w
  left join submitted s on s.week_start = w.week_start
  left join closed c on c.week_start = w.week_start
  order by w.week_start;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_organization_resolution_performance: four real numbers, one per question a triage
-- lead actually asks -- never a single blended score. median_hours_to_first_triage and
-- median_days_to_resolution are null (not 0) when there is no qualifying data yet, the
-- same "absence is null, never a fabricated zero" convention used throughout this schema
-- (see e.g. median() in lib/mock/report-analytics.ts, now enforced for real by
-- percentile_cont simply returning null over an empty set). Aging buckets use the same
-- 31-60/60+ day thresholds the researcher-facing mock analytics already established, and
-- "last activity" is the most recent report.* audit_logs event for that report, falling
-- back to submitted_at for a report that has never been touched at all.
-- ---------------------------------------------------------------------------

-- Return shape changed during development (added the 0-7/8-30 aging buckets) -- drop
-- first since PostgREST can't disambiguate overloaded RPC signatures otherwise (the same
-- documented gotcha every returns-TABLE-shape change in this codebase follows).
drop function if exists public.get_organization_resolution_performance(uuid);

create or replace function public.get_organization_resolution_performance(target_organization_id uuid)
returns table (
  median_hours_to_first_triage numeric,
  median_days_to_resolution numeric,
  open_count bigint,
  aging_0_to_7_days_count bigint,
  aging_8_to_30_days_count bigint,
  aging_31_to_60_days_count bigint,
  aging_over_60_days_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  with first_triage as (
    select a.entity_id as report_id, min(a.created_at) as triaged_at
    from public.audit_logs a
    where a.organization_id = target_organization_id and a.entity_type = 'report' and a.action = 'report.triage_started'
    group by a.entity_id
  ),
  triage_durations as (
    select extract(epoch from (ft.triaged_at - r.submitted_at)) / 3600.0 as hours
    from public.reports r
    join first_triage ft on ft.report_id = r.id
    where r.organization_id = target_organization_id
  ),
  latest_terminal_event as (
    select distinct on (a.entity_id) a.entity_id as report_id, a.created_at
    from public.audit_logs a
    where a.organization_id = target_organization_id
      and a.entity_type = 'report'
      and a.action in ('report.resolved', 'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')
    order by a.entity_id, a.created_at desc
  ),
  resolution_durations as (
    select extract(epoch from (e.created_at - r.submitted_at)) / 86400.0 as days
    from public.reports r
    join latest_terminal_event e on e.report_id = r.id
    where r.organization_id = target_organization_id
  ),
  open_reports as (
    select r.id, r.submitted_at,
      extract(epoch from (now() - coalesce(
        (select max(a.created_at) from public.audit_logs a where a.entity_type = 'report' and a.entity_id = r.id and a.organization_id = target_organization_id),
        r.submitted_at
      ))) / 86400.0 as age_days
    from public.reports r
    where r.organization_id = target_organization_id
      and r.status not in ('resolved', 'duplicate', 'informative', 'not_applicable', 'rejected')
  )
  select
    (select percentile_cont(0.5) within group (order by hours) from triage_durations)::numeric,
    (select percentile_cont(0.5) within group (order by days) from resolution_durations)::numeric,
    (select count(*) from open_reports),
    (select count(*) from open_reports where age_days <= 7),
    (select count(*) from open_reports where age_days > 7 and age_days <= 30),
    (select count(*) from open_reports where age_days > 30 and age_days <= 60),
    (select count(*) from open_reports where age_days > 60);
end;
$$;

revoke all on function public.get_organization_severity_status_breakdown(uuid) from public;
revoke all on function public.get_organization_weekly_report_volume(uuid) from public;
revoke all on function public.get_organization_resolution_performance(uuid) from public;

grant execute on function public.get_organization_severity_status_breakdown(uuid) to authenticated;
grant execute on function public.get_organization_weekly_report_volume(uuid) to authenticated;
grant execute on function public.get_organization_resolution_performance(uuid) to authenticated;
