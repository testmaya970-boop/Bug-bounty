-- Per-program report analytics. Closes the "no per-program health signal" gap: the three
-- existing analytics RPCs (202609050004) are org-wide only, filtered on organization_id,
-- authorized via private.authorize_organization_analytics_read (org membership only). A
-- pure program-manager with no org role (private.is_program_member(program_id) but no
-- organization_members row) is locked out of that helper entirely, so these are NEW,
-- dedicated functions rather than an overload -- same three real questions, scoped to one
-- program, with the standard two-path authorization every other program-scoped RPC uses
-- (has_org_role(owner/security_admin) or is_program_member), not the org-wide helper.
--
-- Query logic is otherwise identical to 202609050004's: reports.program_id and the
-- audit_logs CTEs (joined back to reports r, which carries program_id) already existed --
-- parameterizing by program instead of organization required no schema change, only a
-- narrower WHERE and a different authorization gate.

create or replace function private.authorize_program_analytics_read(target_program_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(target_program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot view analytics for this program' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.authorize_program_analytics_read(uuid) from public;

create or replace function public.get_program_severity_status_breakdown(target_program_id uuid)
returns table (severity public.report_severity, status public.report_status, count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_program_analytics_read(target_program_id);

  return query
  select r.confirmed_severity, r.status, count(*)
  from public.reports r
  where r.program_id = target_program_id
  group by r.confirmed_severity, r.status;
end;
$$;

create or replace function public.get_program_weekly_report_volume(target_program_id uuid)
returns table (week_start date, submitted_count bigint, resolved_count bigint, other_closed_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_program_analytics_read(target_program_id);

  return query
  with weeks as (
    select (date_trunc('week', now()) - (n * interval '7 days'))::date as week_start
    from generate_series(0, 11) as n
  ),
  submitted as (
    select date_trunc('week', r.submitted_at)::date as week_start, count(*) as cnt
    from public.reports r
    where r.program_id = target_program_id and r.submitted_at >= now() - interval '12 weeks'
    group by 1
  ),
  latest_terminal_event as (
    select distinct on (a.entity_id) a.entity_id as report_id, a.action, a.created_at
    from public.audit_logs a
    join public.reports r on r.id = a.entity_id
    where a.entity_type = 'report'
      and r.program_id = target_program_id
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

create or replace function public.get_program_resolution_performance(target_program_id uuid)
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
  perform private.authorize_program_analytics_read(target_program_id);

  return query
  with first_triage as (
    select a.entity_id as report_id, min(a.created_at) as triaged_at
    from public.audit_logs a
    join public.reports r on r.id = a.entity_id
    where a.entity_type = 'report' and a.action = 'report.triage_started' and r.program_id = target_program_id
    group by a.entity_id
  ),
  triage_durations as (
    select extract(epoch from (ft.triaged_at - r.submitted_at)) / 3600.0 as hours
    from public.reports r
    join first_triage ft on ft.report_id = r.id
    where r.program_id = target_program_id
  ),
  latest_terminal_event as (
    select distinct on (a.entity_id) a.entity_id as report_id, a.created_at
    from public.audit_logs a
    join public.reports r on r.id = a.entity_id
    where a.entity_type = 'report'
      and r.program_id = target_program_id
      and a.action in ('report.resolved', 'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')
    order by a.entity_id, a.created_at desc
  ),
  resolution_durations as (
    select extract(epoch from (e.created_at - r.submitted_at)) / 86400.0 as days
    from public.reports r
    join latest_terminal_event e on e.report_id = r.id
    where r.program_id = target_program_id
  ),
  open_reports as (
    select r.id, r.submitted_at,
      extract(epoch from (now() - coalesce(
        (select max(a.created_at) from public.audit_logs a where a.entity_type = 'report' and a.entity_id = r.id),
        r.submitted_at
      ))) / 86400.0 as age_days
    from public.reports r
    where r.program_id = target_program_id
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

revoke all on function public.get_program_severity_status_breakdown(uuid) from public;
revoke all on function public.get_program_weekly_report_volume(uuid) from public;
revoke all on function public.get_program_resolution_performance(uuid) from public;

grant execute on function public.get_program_severity_status_breakdown(uuid) to authenticated;
grant execute on function public.get_program_weekly_report_volume(uuid) to authenticated;
grant execute on function public.get_program_resolution_performance(uuid) to authenticated;
