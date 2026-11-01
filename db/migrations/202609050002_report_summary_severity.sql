-- Adds confirmed_severity to list_my_reports' return shape, closing a real UX gap: the
-- researcher's own report list previously had no way to visually triage at a glance
-- (title + status only) despite severity already being real, org-confirmed data on every
-- report. Redefined (not duplicated), same signature -- every existing caller gets the
-- new field automatically with zero other behavior change.

drop function if exists public.list_my_reports(integer, timestamptz, uuid);

create or replace function public.list_my_reports(
  p_limit integer default 20,
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  program_id uuid,
  organization_id uuid,
  program_name text,
  organization_name text,
  title text,
  display_target text,
  status public.report_status,
  confirmed_severity public.report_severity,
  submitted_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  effective_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select r.id, r.program_id, r.organization_id, p.name, o.name, r.title, r.display_target, r.status, r.confirmed_severity, r.submitted_at
    from public.reports r
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where r.researcher_id = actor
      and (
        p_before_submitted_at is null
        or (r.submitted_at, r.id) < (p_before_submitted_at, p_before_id)
      )
    order by r.submitted_at desc, r.id desc
    limit effective_limit;
end;
$$;

revoke all on function public.list_my_reports(integer, timestamptz, uuid) from public;
grant execute on function public.list_my_reports(integer, timestamptz, uuid) to authenticated;
