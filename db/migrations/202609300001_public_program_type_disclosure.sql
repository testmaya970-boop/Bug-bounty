-- Disclose program_type to researchers browsing public programs (2026-09-30).
--
-- program_type ('bounty' | 'vdp', 202609030002) was enforced correctly at creation and on
-- the org-management side (bounty policy hidden entirely for a vdp program), but the two
-- read paths a RESEARCHER actually uses -- get_public_program (a program's own detail
-- page) and list_public_programs (the /programs directory) -- never selected it. A
-- vulnerability-disclosure-only program was therefore indistinguishable, to a researcher,
-- from a paid-bounty program that simply hadn't configured a bounty policy yet: both
-- rendered the same "No bounty" text. That is a real honesty gap (AGENTS.md's product-
-- integrity section: mock or absent data must never be presented in a way that misleads
-- about what is actually happening) -- a researcher deciding whether to spend time on a
-- program deserves to know, before submitting, whether it can ever pay a bounty at all.
--
-- Both functions are redefined (return type changed: an added output column), not
-- duplicated. Since Postgres cannot alter a function's declared RETURNS TABLE shape
-- in-place, each old signature is dropped first -- the same rebuild-not-alter pattern
-- 202609030002's own header used for create_program's changed parameter list.

drop function if exists public.get_public_program(uuid);

create or replace function public.get_public_program(target_program_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  organization_name text,
  status public.program_status,
  program_type public.program_type,
  description text,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select p.id, p.organization_id, p.name, o.name, p.status, p.program_type, p.description, p.updated_at
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused');
end;
$$;

revoke all on function public.get_public_program(uuid) from public;
grant execute on function public.get_public_program(uuid) to authenticated, anon;

drop function if exists public.list_public_programs(text, public.program_status, public.researcher_focus_area, timestamptz, uuid, int);

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
  program_type public.program_type,
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
      p.id, p.organization_id, p.name, o.name, p.status, p.program_type, p.description, p.focus_areas,
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
grant execute on function public.list_public_programs(text, public.program_status, public.researcher_focus_area, timestamptz, uuid, int) to authenticated, anon;
