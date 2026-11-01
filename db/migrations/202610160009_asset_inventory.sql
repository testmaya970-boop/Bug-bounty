-- Audit P1-2, option (a), the model HackerOne and Bugcrowd use: an organization-wide asset
-- inventory that program scopes point to (Bugcrowd "assign assets to programs", HackerOne
-- "Asset Inventory": each asset shows its programs and its open vulnerabilities). This replaces
-- the 0006 decision to have no global asset table (docs/decisions/0006-scope-asset-model.md).
--
--   * public.assets: one row per (organization, asset type, canonical target). Never deleted
--     while the organization exists, so an asset keeps its report history after it leaves scope.
--   * program_scope_entries.asset_id: every scope entry is an asset assigned to a program, linked
--     by trigger on insert and whenever the target changes -- existing scope RPCs need no change,
--     and editing a target in place moves the entry to the matching asset instead of rewriting
--     the old asset's history.
--   * reports.asset_id: pinned at submission from the matched scope entry and never cleared, so
--     a report keeps pointing at what it was filed against even if scope is edited or removed.
--   * list_organization_assets: the inventory with programs, open/total findings and last report,
--     scoped like the rest of the org: owners and security admins see every asset, program staff
--     see the assets (and report counts) of the programs they work on.
-- A report remains the vulnerability record (duplicates point at the original report), as on
-- HackerOne and Bugcrowd.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  asset_type public.program_asset_type not null,
  identifier text not null check (char_length(identifier) between 1 and 2048),
  display_identifier text not null check (char_length(display_identifier) between 1 and 2048),
  created_at timestamptz not null default now(),
  unique (organization_id, asset_type, identifier),
  unique (id, organization_id)
);
alter table public.assets enable row level security;
-- Read only through list_organization_assets (SECURITY DEFINER); writes only through triggers.
revoke all on public.assets from public, anon, authenticated;
grant select, insert, update, delete on public.assets to service_role;
create index assets_org_display_idx on public.assets (organization_id, display_identifier, id);

-- Backfill from existing scope entries (latest display form wins).
insert into public.assets (organization_id, asset_type, identifier, display_identifier)
select distinct on (organization_id, asset_type, target) organization_id, asset_type, target, display_target
from public.program_scope_entries
order by organization_id, asset_type, target, created_at desc;

alter table public.program_scope_entries add column asset_id uuid;
update public.program_scope_entries e set asset_id = a.id
from public.assets a where a.organization_id = e.organization_id and a.asset_type = e.asset_type and a.identifier = e.target;
alter table public.program_scope_entries alter column asset_id set not null;
alter table public.program_scope_entries add constraint program_scope_entries_asset_fk
  foreign key (asset_id, organization_id) references public.assets (id, organization_id);
create index program_scope_entries_asset_idx on public.program_scope_entries (asset_id);

create or replace function private.link_scope_entry_asset()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.assets (organization_id, asset_type, identifier, display_identifier)
  values (new.organization_id, new.asset_type, new.target, new.display_target)
  on conflict (organization_id, asset_type, identifier) do update set display_identifier = excluded.display_identifier
  returning id into new.asset_id;
  return new;
end;
$$;

create trigger program_scope_entries_link_asset
  before insert or update of asset_type, target on public.program_scope_entries
  for each row execute function private.link_scope_entry_asset();

-- Reports pin their asset -------------------------------------------------------------------
alter table public.reports add column asset_id uuid;
update public.reports r set asset_id = e.asset_id from public.program_scope_entries e where e.id = r.matched_scope_entry_id;
alter table public.reports add constraint reports_asset_fk foreign key (asset_id, organization_id) references public.assets (id, organization_id);
create index reports_asset_idx on public.reports (asset_id) where asset_id is not null;

create or replace function private.pin_report_asset()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.asset_id is not null then
    new.asset_id := old.asset_id; -- pinned at submission, never moved or cleared
  elsif new.matched_scope_entry_id is not null then
    new.asset_id := (select e.asset_id from public.program_scope_entries e where e.id = new.matched_scope_entry_id);
  end if;
  return new;
end;
$$;

create trigger reports_pin_asset
  before insert or update of matched_scope_entry_id, asset_id on public.reports
  for each row execute function private.pin_report_asset();

-- The inventory ---------------------------------------------------------------------------
create or replace function public.list_organization_assets(
  p_organization_id uuid,
  p_asset_type public.program_asset_type default null,
  p_program_id uuid default null,
  p_after_identifier text default null,
  p_after_id uuid default null,
  p_limit integer default 50
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
  )
  select a.id, a.asset_type, a.display_identifier,
    coalesce((select jsonb_agg(jsonb_build_object('program_id', en.program_id, 'program_name', en.program_name, 'scope_state', en.scope_state) order by en.program_name)
              from entries en where en.asset_id = a.id), '[]'::jsonb),
    (select count(*) from public.reports r join visible_programs vp on vp.id = r.program_id
      where r.asset_id = a.id and r.status in ('new', 'triaging', 'needs_information', 'accepted')),
    (select count(*) from public.reports r join visible_programs vp on vp.id = r.program_id where r.asset_id = a.id),
    (select max(r.submitted_at) from public.reports r join visible_programs vp on vp.id = r.program_id where r.asset_id = a.id)
  from public.assets a
  where a.organization_id = p_organization_id
    and (org_wide or exists (select 1 from entries en where en.asset_id = a.id))
    and (p_asset_type is null or a.asset_type = p_asset_type)
    and (p_program_id is null or exists (select 1 from entries en where en.asset_id = a.id and en.program_id = p_program_id))
    and (p_after_identifier is null or (a.display_identifier, a.id) > (p_after_identifier, p_after_id))
  order by a.display_identifier, a.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.list_organization_assets(uuid, public.program_asset_type, uuid, text, uuid, integer) from public, anon;
grant execute on function public.list_organization_assets(uuid, public.program_asset_type, uuid, text, uuid, integer) to authenticated;
