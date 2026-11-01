-- Public program discovery: real signals on every card, a focus-area filter, and a
-- curated "highest-paying" section. See docs/decisions/0054.
--
-- Every added column is a real, already-existing fact -- never an invented metric:
-- bounty range (public.program_bounty_policy_severity_ranges' own min/max, aggregated,
-- never the per-severity breakdown that stays gated to authorized researchers), asset
-- types actually in scope, and researcher/resolved-report counts computed live from
-- program_researchers/reports. No cached, estimated, or fabricated number anywhere.
--
-- The bounty range is deliberately the ONLY new value exposed to `anon` here. The
-- existing "bounty policy versions read by..." RLS policy (0013) stays completely
-- untouched -- it still gates the full, per-severity breakdown to org admins/program
-- members/authorized researchers only. This migration adds a second, narrower, explicitly
-- public-safe projection (aggregate min/max only, no per-severity numbers, no policy id)
-- through a SECURITY DEFINER function, the same "public-safe view alongside the real RLS
-- boundary" pattern list_public_programs/get_public_program/list_public_program_scope
-- already established in 0041 -- not a relaxation of that boundary.

drop function if exists public.list_public_programs(text, public.program_status, timestamptz, uuid, int);

create or replace function public.list_public_programs(
  p_search text default null,
  p_status public.program_status default null,
  p_focus_area public.researcher_focus_area default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  organization_name text,
  status public.program_status,
  description text,
  focus_areas public.researcher_focus_area[],
  asset_types public.program_asset_type[],
  bounty_min_minor_units bigint,
  bounty_max_minor_units bigint,
  bounty_currency text,
  active_researcher_count integer,
  resolved_report_count integer,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  effective_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  trimmed_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  return query
    select
      p.id, p.organization_id, p.name, o.name, p.status, p.description, p.focus_areas,
      coalesce(scope.asset_types, '{}'), bounty.min_minor_units, bounty.max_minor_units, bounty.currency,
      coalesce(researchers.active_count, 0)::int, coalesce(resolved.resolved_count, 0)::int,
      p.updated_at
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    left join lateral (
      select array_agg(distinct se.asset_type) as asset_types
      from public.program_scope_entries se
      where se.program_id = p.id and se.scope_state = 'in_scope'
    ) scope on true
    left join lateral (
      select min(r.min_amount_minor_units) as min_minor_units, max(r.max_amount_minor_units) as max_minor_units, v.currency
      from public.program_bounty_policy_versions v
      join public.program_bounty_policy_severity_ranges r on r.policy_version_id = v.id
      where v.program_id = p.id and v.superseded_at is null
      group by v.currency
    ) bounty on true
    left join lateral (
      select count(*) as active_count from public.program_researchers pr where pr.program_id = p.id and pr.status = 'active'
    ) researchers on true
    left join lateral (
      select count(*) as resolved_count from public.reports rp where rp.program_id = p.id and rp.status = 'resolved'
    ) resolved on true
    where p.visibility = 'public'
      and p.status in ('active', 'paused')
      and (p_status is null or p.status = p_status)
      and (p_focus_area is null or p_focus_area = any(p.focus_areas))
      and (trimmed_search is null or p.name ilike '%' || trimmed_search || '%' or o.name ilike '%' || trimmed_search || '%')
      and (
        p_cursor_updated_at is null
        or p.updated_at < p_cursor_updated_at
        or (p.updated_at = p_cursor_updated_at and p.id < p_cursor_id)
      )
    order by p.updated_at desc, p.id desc
    limit effective_limit;
end;
$$;

revoke all on function public.list_public_programs(text, public.program_status, public.researcher_focus_area, timestamptz, uuid, int) from public;
grant execute on function public.list_public_programs(text, public.program_status, public.researcher_focus_area, timestamptz, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_top_bounty_programs: the curated "highest-paying" section. Only ever includes a
-- program with a real, currently-active bounty policy -- a program with none configured
-- simply never appears here, rather than being padded in with a fabricated range.
-- ---------------------------------------------------------------------------

create or replace function public.list_top_bounty_programs(p_limit int default 6)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  organization_name text,
  status public.program_status,
  bounty_min_minor_units bigint,
  bounty_max_minor_units bigint,
  bounty_currency text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  effective_limit int := least(greatest(coalesce(p_limit, 6), 1), 20);
begin
  return query
    select p.id, p.organization_id, p.name, o.name, p.status, bounty.min_minor_units, bounty.max_minor_units, bounty.currency
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    join lateral (
      select min(r.min_amount_minor_units) as min_minor_units, max(r.max_amount_minor_units) as max_minor_units, v.currency
      from public.program_bounty_policy_versions v
      join public.program_bounty_policy_severity_ranges r on r.policy_version_id = v.id
      where v.program_id = p.id and v.superseded_at is null
      group by v.currency
    ) bounty on true
    where p.visibility = 'public'
      and p.status in ('active', 'paused')
    order by bounty.max_minor_units desc nulls last, p.updated_at desc
    limit effective_limit;
end;
$$;

revoke all on function public.list_top_bounty_programs(int) from public;
grant execute on function public.list_top_bounty_programs(int) to anon, authenticated;
