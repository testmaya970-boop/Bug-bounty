-- Response-time (SLA) metrics, platform benchmarks and the report-level export dataset.
--
--   get_organization_response_metrics(org, p_days)  -- jsonb: org + per-program median/p90 of
--       time to first response, triage, bounty and resolution, % meeting the policy's own
--       targets, and the platform-wide benchmark for each metric.
--   list_organization_report_timings(org, p_days)   -- one row per report, for the CSV export.
--
-- Timing comes from the same sources as private.report_sla (202610060009):
--   first response = first researcher-visible organization message or first staff status
--                    change (triage start, information request, any decision)
--   triaged        = first report.triage_started
--   bounty         = report.accepted -> report_bounty_decisions.finalized_at
--   resolution     = first terminal decision (resolved, duplicate, informative, n/a, rejected)
-- SLA: a report counts toward a target only when the policy version it was submitted under
-- defines that target. Met = responded within it; missed = responded late or still waiting
-- past due; still waiting and not yet due = not counted either way.
--
-- Access: owner and security_admin see the whole organization; a program_manager sees only
-- the programs they manage. billing_admin and triager are refused (report-derived data).
-- Benchmarks are the median of per-organization medians and are only returned when at least
-- 5 organizations contribute to that metric -- never another organization's own numbers.

create or replace function private.report_response_timings(p_organization_id uuid, p_since timestamptz)
returns table (
  organization_id uuid,
  program_id uuid,
  report_id uuid,
  submitted_at timestamptz,
  severity text,
  status text,
  first_response_at timestamptz,
  triaged_at timestamptz,
  accepted_at timestamptz,
  bounty_finalized_at timestamptz,
  bounty_amount_minor_units bigint,
  bounty_currency text,
  resolved_at timestamptz,
  first_response_target_hours integer,
  triage_target_hours integer,
  resolution_target_days integer
)
language sql stable set search_path = ''
as $$
  with r as (
    select rp.id, rp.organization_id, rp.program_id, rp.submitted_at, rp.confirmed_severity, rp.status, rp.policy_version_id
    from public.reports rp
    where rp.submitted_at >= p_since and (p_organization_id is null or rp.organization_id = p_organization_id)
  ),
  ev as (
    select a.entity_id as report_id,
      min(a.created_at) as first_status_at,
      min(a.created_at) filter (where a.action = 'report.triage_started') as triaged_at,
      min(a.created_at) filter (where a.action = 'report.accepted') as accepted_at,
      min(a.created_at) filter (where a.action in ('report.resolved', 'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')) as closed_at
    from public.audit_logs a
    join r on r.id = a.entity_id
    where a.entity_type = 'report'
      and a.action in ('report.triage_started', 'report.information_requested', 'report.accepted', 'report.resolved',
                       'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')
    group by a.entity_id
  ),
  msg as (
    select m.report_id, min(m.created_at) as at
    from public.report_messages m
    join r on r.id = m.report_id
    where m.author_context = 'organization' and m.visibility = 'researcher_visible'
    group by m.report_id
  )
  select r.organization_id, r.program_id, r.id, r.submitted_at, r.confirmed_severity::text, r.status::text,
    least(ev.first_status_at, msg.at),  -- least() skips nulls
    ev.triaged_at, ev.accepted_at,
    d.finalized_at, d.final_amount_minor_units::bigint, d.currency,
    ev.closed_at,
    v.first_response_target_hours, v.triage_target_hours, v.resolution_target_days
  from r
  left join ev on ev.report_id = r.id
  left join msg on msg.report_id = r.id
  left join public.report_bounty_decisions d on d.report_id = r.id and d.state = 'finalized'
  left join public.program_policy_versions v on v.id = r.policy_version_id;
$$;

-- Authorizes the caller and returns the program scope: null = the whole organization,
-- otherwise the programs this program manager manages (possibly empty).
create or replace function private.authorize_response_metrics_read(target_organization_id uuid)
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  perform private.authorize_organization_read(target_organization_id, array['owner', 'security_admin', 'program_manager']::public.organization_member_role[]);
  if exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = actor and status = 'active' and role in ('owner', 'security_admin')
  ) then
    return null;
  end if;
  return coalesce((
    select array_agg(pm.program_id) from public.program_members pm
    where pm.organization_id = target_organization_id and pm.user_id = actor and pm.role = 'manager'
  ), '{}'::uuid[]);
end;
$$;

create or replace function public.get_organization_response_metrics(target_organization_id uuid, p_days integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  scope uuid[] := private.authorize_response_metrics_read(target_organization_id);
  since timestamptz := private.dashboard_since(p_days);
  result jsonb;
begin
  with t as (
    select x.*,
      extract(epoch from x.first_response_at - x.submitted_at) / 3600.0 as fr_h,
      extract(epoch from x.triaged_at - x.submitted_at) / 3600.0 as tr_h,
      extract(epoch from x.bounty_finalized_at - x.accepted_at) / 3600.0 as b_h,
      extract(epoch from x.resolved_at - x.submitted_at) / 3600.0 as res_h
    from private.report_response_timings(target_organization_id, since) x
    where scope is null or x.program_id = any (scope)
  ),
  long as (
    select t.program_id, m.metric, m.hours,
      case
        when m.target_hours is null then null
        when m.done_at is not null then m.hours <= m.target_hours
        when now() > t.submitted_at + make_interval(hours => m.target_hours) then false
      end as met
    from t
    cross join lateral (values
      ('first_response', t.fr_h, t.first_response_target_hours, t.first_response_at),
      ('triage', t.tr_h, t.triage_target_hours, t.triaged_at),
      ('bounty', case when t.b_h >= 0 then t.b_h end, null::integer, t.bounty_finalized_at),
      ('resolution', t.res_h, t.resolution_target_days * 24, t.resolved_at)
    ) as m(metric, hours, target_hours, done_at)
  ),
  agg as (
    select l.program_id, l.metric, grouping(l.program_id) = 1 as org_level,
      percentile_cont(0.5) within group (order by l.hours) as median,
      percentile_cont(0.9) within group (order by l.hours) as p90,
      count(l.hours) as n,
      count(*) filter (where l.met) as met,
      count(l.met) as tracked
    from long l
    group by grouping sets ((l.metric), (l.metric, l.program_id))
  ),
  -- Platform benchmark: one median per organization, then the median of those.
  per_org as (
    select x.organization_id, m.metric, percentile_cont(0.5) within group (order by m.hours) as median
    from private.report_response_timings(null, since) x
    cross join lateral (values
      ('first_response', extract(epoch from x.first_response_at - x.submitted_at) / 3600.0),
      ('triage', extract(epoch from x.triaged_at - x.submitted_at) / 3600.0),
      ('bounty', case when x.bounty_finalized_at >= x.accepted_at then extract(epoch from x.bounty_finalized_at - x.accepted_at) / 3600.0 end),
      ('resolution', extract(epoch from x.resolved_at - x.submitted_at) / 3600.0)
    ) as m(metric, hours)
    where m.hours is not null
    group by x.organization_id, m.metric
  ),
  bench as (
    select p.metric, count(*) as orgs, percentile_cont(0.5) within group (order by p.median) as median
    from per_org p
    group by p.metric
  ),
  metric_names as (
    select * from (values (1, 'first_response'), (2, 'triage'), (3, 'bounty'), (4, 'resolution')) v(ord, metric)
  ),
  program_counts as (
    select t.program_id, count(*) as reports from t group by t.program_id
  )
  select jsonb_build_object(
    'since', since,
    'reports', (select count(*) from t),
    'metrics', (
      select jsonb_agg(jsonb_build_object(
        'metric', mn.metric,
        'median_hours', round(a.median::numeric, 1),
        'p90_hours', round(a.p90::numeric, 1),
        'count', coalesce(a.n, 0),
        'sla_met', coalesce(a.met, 0),
        'sla_tracked', coalesce(a.tracked, 0),
        'benchmark_hours', case when b.orgs >= 5 then round(b.median::numeric, 1) end,
        'benchmark_orgs', coalesce(b.orgs, 0)
      ) order by mn.ord)
      from metric_names mn
      left join agg a on a.metric = mn.metric and a.org_level
      left join bench b on b.metric = mn.metric
    ),
    'programs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'program_id', pc.program_id,
        'name', p.name,
        'reports', pc.reports,
        'metrics', (
          select jsonb_object_agg(a.metric, jsonb_build_object(
            'median_hours', round(a.median::numeric, 1),
            'p90_hours', round(a.p90::numeric, 1),
            'count', a.n,
            'sla_met', a.met,
            'sla_tracked', a.tracked))
          from agg a where not a.org_level and a.program_id = pc.program_id
        )
      ) order by pc.reports desc, p.name)
      from program_counts pc
      join public.programs p on p.id = pc.program_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.list_organization_report_timings(target_organization_id uuid, p_days integer default 90)
returns table (
  report_id uuid,
  submitted_at timestamptz,
  program_name text,
  severity text,
  status text,
  first_response_at timestamptz,
  triaged_at timestamptz,
  bounty_amount_minor_units bigint,
  bounty_currency text,
  resolved_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  scope uuid[] := private.authorize_response_metrics_read(target_organization_id);
begin
  return query
  select x.report_id, x.submitted_at, p.name, x.severity, x.status, x.first_response_at, x.triaged_at,
    x.bounty_amount_minor_units, x.bounty_currency, x.resolved_at
  from private.report_response_timings(target_organization_id, private.dashboard_since(p_days)) x
  join public.programs p on p.id = x.program_id
  where scope is null or x.program_id = any (scope)
  order by x.submitted_at desc;
end;
$$;

revoke all on function private.report_response_timings(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.authorize_response_metrics_read(uuid) from public, anon, authenticated;
grant execute on function private.report_response_timings(uuid, timestamptz) to service_role;
grant execute on function private.authorize_response_metrics_read(uuid) to service_role;
revoke all on function public.get_organization_response_metrics(uuid, integer) from public, anon;
revoke all on function public.list_organization_report_timings(uuid, integer) from public, anon;
grant execute on function public.get_organization_response_metrics(uuid, integer) to authenticated, service_role;
grant execute on function public.list_organization_report_timings(uuid, integer) to authenticated, service_role;
