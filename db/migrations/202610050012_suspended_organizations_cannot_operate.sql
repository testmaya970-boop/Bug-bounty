-- Audit TEN-6 (P1). Organization suspension was mostly cosmetic: private.organization_is_operable
-- was checked by only four functions, create_program lost its check when
-- 202609070002_engagement_type re-created it, and every public discovery function ignored
-- organizations.status -- so a suspended org could create programs, and its programs stayed
-- publicly listed, joinable and reportable.
--
-- (1) The three program-activity triggers from 202610050001 now also refuse when the
--     program's organization is suspended, plus a new trigger on program creation. That
--     covers create_program, invitations, joins/accepts and report submission on every path.
-- (2) The four public discovery functions hide programs of suspended organizations.
--     list_public_programs' asset-type summary also stops counting removed scope entries
--     (audit ORG-10: removed entries' asset types leaked to anonymous visitors).

create or replace function private.require_operable_organization(target_org_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.organization_is_operable(target_org_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is suspended' using errcode = '55000';
  end if;
end;
$$;

revoke all on function private.require_operable_organization(uuid) from public;

create or replace function private.block_programs_on_suspended_organization()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_operable_organization(new.organization_id);
  return new;
end;
$$;

revoke all on function private.block_programs_on_suspended_organization() from public;

drop trigger if exists programs_block_suspended_organization on public.programs;
create trigger programs_block_suspended_organization
  before insert on public.programs
  for each row execute function private.block_programs_on_suspended_organization();

create or replace function private.block_reports_on_unlaunched_program()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.programs p where p.id = new.program_id and p.status = 'active') then
    raise exception 'SUBMISSIONS_CLOSED: this program is not currently accepting reports' using errcode = '55000';
  end if;
  perform private.require_operable_organization(new.organization_id);
  return new;
end;
$$;

create or replace function private.block_participation_on_unlaunched_program()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not exists (select 1 from public.programs p where p.id = new.program_id and p.status in ('active', 'paused')) then
      raise exception 'PROGRAM_NOT_LAUNCHED: researchers can only join a launched program' using errcode = '55000';
    end if;
    perform private.require_operable_organization(new.organization_id);
  end if;
  return new;
end;
$$;

create or replace function private.block_invitations_on_unlaunched_program()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.programs p where p.id = new.program_id and p.status in ('active', 'paused')) then
    raise exception 'PROGRAM_NOT_LAUNCHED: researchers can only be invited to a launched program' using errcode = '55000';
  end if;
  perform private.require_operable_organization(new.organization_id);
  return new;
end;
$$;

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
    where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused')
      and o.status <> 'suspended';
end;
$$;

create or replace function public.list_public_program_scope(target_program_id uuid)
returns table (id uuid, asset_type public.program_asset_type, display_target text, scope_state public.program_scope_state, description text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused')
      and o.status <> 'suspended'
  ) then
    return;
  end if;

  return query
    select e.id, e.asset_type, e.display_target, e.scope_state, e.description
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.status = 'active'
    order by e.created_at asc;
end;
$$;

create or replace function public.list_top_bounty_programs(p_limit integer default 6)
returns table (id uuid, organization_id uuid, name text, organization_name text, status public.program_status, bounty_min_minor_units bigint, bounty_max_minor_units bigint, bounty_currency text)
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
      and o.status <> 'suspended'
    order by bounty.max_minor_units desc nulls last, p.updated_at desc
    limit effective_limit;
end;
$$;

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
      where se.program_id = p.id and se.scope_state = 'in_scope' and se.status = 'active'
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
      and o.status <> 'suspended'
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
