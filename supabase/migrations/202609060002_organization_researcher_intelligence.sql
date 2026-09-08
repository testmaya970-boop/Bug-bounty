-- Organization Researcher Intelligence: "which researchers have actually contributed
-- meaningful security value to this organization, and are they still active with us" --
-- a new organization-wide, cross-program read, distinct from both the per-program
-- researcher roster (components/programs/researcher-table.tsx, access/status management
-- for ONE program) and platform-wide reputation/leaderboard (services/reputation.ts,
-- never organization-specific). See docs/decisions for the full design trace.
--
-- Authorization reuses private.authorize_organization_analytics_read unchanged (defined
-- in 202609050004) -- the same "any active organization member, not narrowed to
-- owner/security_admin" gate the existing organization analytics RPCs already use. RLS on
-- program_researchers/reports is per-program for program_manager/triager roles (only
-- owner/security_admin get org-wide SELECT), so a plain RLS-trusting service function
-- would silently under-report for those roles -- the same authorization-gap class already
-- found and fixed once in 202609060001. A SECURITY DEFINER RPC with its own broader,
-- explicit membership check is required, matching the existing analytics precedent.
--
-- Deliberately excludes: payment/spend, platform-wide reputation/score/rank/leaderboard,
-- email/username, KYC/identity, terminal-outcome counts beyond "resolved" (duplicate/
-- informative/not_applicable/rejected are not meaningful positive contribution signals
-- for this view), and any blended "researcher score." Three signal groups only:
-- relationship (per-program status, never collapsed), security contribution (resolved
-- count + resolved severity breakdown), recency (last submission across all history).

create or replace function public.list_researchers_for_organization(target_organization_id uuid)
returns table (
  researcher_id uuid,
  display_name text,
  programs jsonb,
  resolved_count bigint,
  resolved_critical bigint,
  resolved_high bigint,
  resolved_medium bigint,
  resolved_low bigint,
  resolved_none bigint,
  last_submitted_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  with org_programs as (
    select p.id as program_id, p.name as program_name
    from public.programs p
    where p.organization_id = target_organization_id
  ),
  -- Joined through org_programs (program_id, indexed via program_researchers' own primary
  -- key) rather than filtered on program_researchers.organization_id directly -- that
  -- column has no supporting index today, while (program_id, user_id) is the table's
  -- primary key. program_id -> programs.organization_id is FK-enforced, so this join is
  -- exactly as correct as filtering on organization_id directly would be.
  relationships as (
    select pr.user_id, pr.program_id, op.program_name, pr.status
    from public.program_researchers pr
    join org_programs op on op.program_id = pr.program_id
  ),
  -- Every (program, researcher) relationship and its own current status is preserved as
  -- its own array element -- never collapsed into one status per researcher. A researcher
  -- active in one program and revoked in another keeps both facts, verbatim.
  researcher_programs as (
    select r.user_id,
      jsonb_agg(jsonb_build_object('programId', r.program_id, 'programName', r.program_name, 'status', r.status) order by r.program_name) as programs
    from relationships r
    group by r.user_id
  ),
  org_reports as (
    select rp.researcher_id, rp.status, rp.confirmed_severity, rp.submitted_at
    from public.reports rp
    where rp.organization_id = target_organization_id
  ),
  -- Only status = 'resolved' counts as security contribution -- 'accepted' is NOT
  -- terminal (private.report_status_transitions: accepted -> resolved | needs_information)
  -- and represents a still-in-motion report, not a finalized outcome; duplicate/
  -- informative/not_applicable/rejected are terminal but not a meaningful positive
  -- contribution signal for this view.
  --
  -- resolved_none intentionally counts BOTH confirmed_severity = 'none' (an explicit,
  -- real "resolved but not a security issue" outcome) AND confirmed_severity IS NULL --
  -- verified that resolve_report (202608270002, redefined 202608290003) never requires
  -- severity to be set first; set_report_severity only locks severity from further
  -- CHANGE once terminal, it never enforces it be set before resolution. A resolved
  -- report can genuinely reach this query with a null confirmed_severity.
  resolved_contribution as (
    select org_reports.researcher_id,
      count(*) as resolved_count,
      count(*) filter (where org_reports.confirmed_severity = 'critical') as resolved_critical,
      count(*) filter (where org_reports.confirmed_severity = 'high') as resolved_high,
      count(*) filter (where org_reports.confirmed_severity = 'medium') as resolved_medium,
      count(*) filter (where org_reports.confirmed_severity = 'low') as resolved_low,
      count(*) filter (where org_reports.confirmed_severity = 'none' or org_reports.confirmed_severity is null) as resolved_none
    from org_reports
    where org_reports.status = 'resolved'
    group by org_reports.researcher_id
  ),
  -- Recency across ALL historical reports regardless of current status or the
  -- researcher's current program_researchers status in any program -- reports.submitted_at
  -- has no FK/trigger/cascade dependency on program_researchers (confirmed: no DELETE path
  -- exists on program_researchers, and reports.researcher_id references public.users
  -- directly, never program_researchers), so a revoked researcher's past submissions
  -- remain intact with their real original timestamp.
  recency as (
    select org_reports.researcher_id, max(org_reports.submitted_at) as last_submitted_at
    from org_reports
    group by org_reports.researcher_id
  )
  select
    rp.user_id as researcher_id,
    u.display_name,
    rp.programs,
    coalesce(rc.resolved_count, 0) as resolved_count,
    coalesce(rc.resolved_critical, 0) as resolved_critical,
    coalesce(rc.resolved_high, 0) as resolved_high,
    coalesce(rc.resolved_medium, 0) as resolved_medium,
    coalesce(rc.resolved_low, 0) as resolved_low,
    coalesce(rc.resolved_none, 0) as resolved_none,
    rec.last_submitted_at
  from researcher_programs rp
  join public.users u on u.id = rp.user_id
  left join resolved_contribution rc on rc.researcher_id = rp.user_id
  left join recency rec on rec.researcher_id = rp.user_id
  order by u.display_name;
end;
$$;

revoke all on function public.list_researchers_for_organization(uuid) from public;
grant execute on function public.list_researchers_for_organization(uuid) to authenticated;
