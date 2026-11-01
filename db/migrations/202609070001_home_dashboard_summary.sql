-- ---------------------------------------------------------------------------
-- get_my_home_dashboard_summary: one combined read replacing four separate round trips
-- HomePage's own render was paying for on every navigation (get_my_reputation_summary,
-- a direct reputation_ledger severity-count scan, a direct reports status-count scan,
-- and a fourth direct reports needs_information head-count) -- a real, measured latency
-- audit found each of those four costing its own ~300ms round trip on local Docker, on
-- top of an already-redundant auth.getUser() call inside each one (fixed separately by
-- threading userId through as a parameter instead). This RPC computes the identical four
-- aggregations the existing get_my_reputation_summary / getMyReputationSeverityCounts /
-- getMyReportStatusCounts / countMyReportsNeedingResponse functions already compute --
-- same tables, same researcher_id filter, same grouping -- in ONE database round trip.
-- Returned as a single jsonb object (four keyed arrays/counts) rather than a
-- returns-table shape, since the four source aggregations have unrelated columns and a
-- null-padded union table would be awkward for the JS layer to unpack cleanly.
--
-- The four original functions are left completely unchanged and still exist for any
-- other caller (docs/decisions/0009-style: additive, not a replacement) -- this is a
-- single new call site for HomePage only.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_home_dashboard_summary()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select jsonb_build_object(
    'reputationSummary', coalesce((
      select jsonb_agg(jsonb_build_object('factType', r.fact_type, 'count', r.fact_count))
      from (
        select fact_type, count(*) as fact_count
        from public.reputation_ledger
        where researcher_id = actor
        group by fact_type
      ) r
    ), '[]'::jsonb),
    'reputationSeverityCounts', coalesce((
      select jsonb_agg(jsonb_build_object('severity', r.confirmed_severity, 'count', r.severity_count))
      from (
        select confirmed_severity, count(*) as severity_count
        from public.reputation_ledger
        where researcher_id = actor and confirmed_severity is not null
        group by confirmed_severity
      ) r
    ), '[]'::jsonb),
    'reportStatusCounts', coalesce((
      select jsonb_agg(jsonb_build_object('status', r.status, 'count', r.status_count))
      from (
        select status, count(*) as status_count
        from public.reports
        where researcher_id = actor
        group by status
      ) r
    ), '[]'::jsonb),
    'reportsNeedingResponse', coalesce((
      select count(*) from public.reports
      where researcher_id = actor and status = 'needs_information'
    ), 0)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_my_home_dashboard_summary() from public;
grant execute on function public.get_my_home_dashboard_summary() to authenticated;
