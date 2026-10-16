-- Asset inventory default view: assets that are in some engagement's scope now, or that have
-- findings. Assets that left scope with no findings ("retired") are kept (history) but hidden
-- unless asked for, so a long-lived organization's inventory isn't drowned by old targets.
drop function public.list_organization_assets(uuid, public.program_asset_type, uuid, text, uuid, integer);

create function public.list_organization_assets(
  p_organization_id uuid,
  p_asset_type public.program_asset_type default null,
  p_program_id uuid default null,
  p_after_identifier text default null,
  p_after_id uuid default null,
  p_limit integer default 50,
  p_include_retired boolean default false
)
returns table (asset_id uuid, asset_type public.program_asset_type, display_identifier text, programs jsonb, open_reports bigint, total_reports bigint, last_report_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  org_wide boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.is_org_member(p_organization_id) then
    raise exception 'FORBIDDEN: you are not an active member of this organization' using errcode = '42501';
  end if;
  org_wide := private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]);

  return query
  with visible_programs as (
    select p.id, p.name from public.programs p
    where p.organization_id = p_organization_id and (org_wide or private.is_program_triager(p.id))
  ),
  entries as (
    select e.asset_id, e.program_id, vp.name as program_name, e.scope_state
    from public.program_scope_entries e join visible_programs vp on vp.id = e.program_id
    where e.status = 'active'
  ),
  report_stats as (
    select r.asset_id,
      count(*) filter (where r.status in ('new', 'triaging', 'needs_information', 'accepted')) as open_reports,
      count(*) as total_reports,
      max(r.submitted_at) as last_report_at
    from public.reports r join visible_programs vp on vp.id = r.program_id
    where r.asset_id is not null
    group by r.asset_id
  )
  select a.id, a.asset_type, a.display_identifier,
    coalesce((select jsonb_agg(jsonb_build_object('program_id', en.program_id, 'program_name', en.program_name, 'scope_state', en.scope_state) order by en.program_name)
              from entries en where en.asset_id = a.id), '[]'::jsonb),
    coalesce(rs.open_reports, 0), coalesce(rs.total_reports, 0), rs.last_report_at
  from public.assets a
  left join report_stats rs on rs.asset_id = a.id
  where a.organization_id = p_organization_id
    and (org_wide or exists (select 1 from entries en where en.asset_id = a.id) or rs.asset_id is not null)
    and (p_include_retired or exists (select 1 from entries en where en.asset_id = a.id) or rs.asset_id is not null)
    and (p_asset_type is null or a.asset_type = p_asset_type)
    and (p_program_id is null or exists (select 1 from entries en where en.asset_id = a.id and en.program_id = p_program_id))
    and (p_after_identifier is null or (a.display_identifier, a.id) > (p_after_identifier, p_after_id))
  order by a.display_identifier, a.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.list_organization_assets(uuid, public.program_asset_type, uuid, text, uuid, integer, boolean) from public, anon;
grant execute on function public.list_organization_assets(uuid, public.program_asset_type, uuid, text, uuid, integer, boolean) to authenticated;
