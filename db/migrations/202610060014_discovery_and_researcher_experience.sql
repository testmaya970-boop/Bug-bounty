-- Program discovery and researcher experience, competitive-parity groups 6-7.
--
-- Discovery:
--  * list_public_programs gains server-side filters (asset type, program type, minimum
--    bounty, KYC requirement) and sorts (recent / bounty / name). Pagination keys on values
--    that don't move when a program is edited (created_at, bounty, name -- each + id), so
--    paging can't skip or repeat a program. Search escapes LIKE wildcards. One current bounty
--    version per program (a second current version can no longer duplicate the row). Each
--    row says whether the caller already participates and whether KYC is required.
--  * list_recommended_programs no longer recommends programs of suspended organizations
--    (their pages are hidden) and has a stable order.
--  * get_public_program also returns the KYC requirement and bounty range, so both are
--    visible before joining.
-- Researcher experience:
--  * list_my_reports filters by status, program and severity in the database (the page used
--    to filter only the rows already loaded).
--  * report_drafts: one server-side draft per researcher per program, so a draft survives
--    another browser or device; removed when the report is submitted.
--  * get_report_status_history: the researcher's own view of what happened to their report
--    (status changes, severity, bounty, retest, mediation, disclosure) without staff
--    identities or internal notes.

-- ---------------------------------------------------------------------------
-- Discovery
-- ---------------------------------------------------------------------------

drop function public.list_public_programs(text, public.program_status, public.researcher_focus_area, timestamptz, uuid, integer);
create function public.list_public_programs(
  p_search text default null,
  p_status public.program_status default null,
  p_focus_area public.researcher_focus_area default null,
  p_asset_type public.program_asset_type default null,
  p_program_type public.program_type default null,
  p_min_bounty_minor_units bigint default null,
  p_requires_kyc boolean default null,
  p_sort text default 'recent',
  p_cursor_value text default null,
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
  updated_at timestamptz,
  requires_kyc boolean,
  joined boolean,
  sort_value text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  effective_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  pattern text := '%' || replace(replace(replace(nullif(trim(coalesce(p_search, '')), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  sort_key text := case when p_sort in ('recent', 'bounty', 'name') then p_sort else 'recent' end;
begin
  return query
    with listed as (
      select
        p.id, p.organization_id, p.name, o.name as organization_name, p.status, p.program_type, p.description, p.focus_areas,
        coalesce(scope.asset_types, '{}'::public.program_asset_type[]) as asset_types,
        bounty.min_minor_units, bounty.max_minor_units, bounty.currency,
        coalesce(researchers.active_count, 0)::int as active_count,
        coalesce(resolved.resolved_count, 0)::int as resolved_count,
        p.updated_at, p.created_at, p.requires_kyc,
        exists (select 1 from public.program_researchers pr where pr.program_id = p.id and pr.user_id = auth.uid() and pr.status = 'active') as joined
      from public.programs p
      join public.organizations o on o.id = p.organization_id
      left join lateral (
        select array_agg(distinct se.asset_type) as asset_types
        from public.program_scope_entries se
        where se.program_id = p.id and se.scope_state = 'in_scope' and se.status = 'active'
      ) scope on true
      left join lateral (
        select min(r.min_amount_minor_units) as min_minor_units, max(r.max_amount_minor_units) as max_minor_units, v.currency
        from (select * from public.program_bounty_policy_versions v0
              where v0.program_id = p.id and v0.superseded_at is null order by v0.created_at desc limit 1) v
        join public.program_bounty_policy_severity_ranges r on r.policy_version_id = v.id
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
        and (p_program_type is null or p.program_type = p_program_type)
        and (p_requires_kyc is null or p.requires_kyc = p_requires_kyc)
        and (pattern is null or p.name ilike pattern escape '\' or o.name ilike pattern escape '\')
    ),
    keyed as (
      select l.*,
        case sort_key
          when 'recent' then to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
          when 'bounty' then lpad(coalesce(l.max_minor_units, -1)::text, 20, '0')
          else lower(l.name)
        end as key
      from listed l
      where (p_asset_type is null or p_asset_type = any(l.asset_types))
        and (p_min_bounty_minor_units is null or coalesce(l.max_minor_units, 0) >= p_min_bounty_minor_units)
    )
    select k.id, k.organization_id, k.name, k.organization_name, k.status, k.program_type, k.description, k.focus_areas,
      k.asset_types, k.min_minor_units, k.max_minor_units, k.currency, k.active_count, k.resolved_count, k.updated_at,
      k.requires_kyc, k.joined, k.key
    from keyed k
    where p_cursor_value is null
       or (sort_key = 'name' and (k.key, k.id) > (p_cursor_value, p_cursor_id))
       or (sort_key <> 'name' and (k.key, k.id) < (p_cursor_value, p_cursor_id))
    order by
      case when sort_key = 'name' then k.key end asc,
      case when sort_key = 'name' then k.id end asc,
      case when sort_key <> 'name' then k.key end desc,
      case when sort_key <> 'name' then k.id end desc
    limit effective_limit;
end;
$$;
revoke all on function public.list_public_programs(text, public.program_status, public.researcher_focus_area, public.program_asset_type, public.program_type, bigint, boolean, text, text, uuid, integer) from public;
grant execute on function public.list_public_programs(text, public.program_status, public.researcher_focus_area, public.program_asset_type, public.program_type, bigint, boolean, text, text, uuid, integer) to anon, authenticated;

create or replace function public.list_recommended_programs(p_limit int default 6)
returns table (
  id uuid, organization_id uuid, name text, organization_name text, status public.program_status,
  description text, focus_areas public.researcher_focus_area[], updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  effective_limit int := least(greatest(coalesce(p_limit, 6), 1), 20);
  my_interests public.researcher_focus_area[];
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select hacking_interests into my_interests from public.researcher_profiles where user_id = actor;
  if my_interests is null or array_length(my_interests, 1) is null then return; end if;

  return query
    select p.id, p.organization_id, p.name, o.name, p.status, p.description, p.focus_areas, p.updated_at
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.visibility = 'public' and p.status in ('active', 'paused') and o.status <> 'suspended'
      and p.focus_areas && my_interests
      and not exists (select 1 from public.program_researchers pr where pr.program_id = p.id and pr.user_id = actor and pr.status = 'active')
    order by p.updated_at desc, p.id desc
    limit effective_limit;
end;
$$;

drop function public.get_public_program(uuid);
create function public.get_public_program(target_program_id uuid)
returns table (
  id uuid, organization_id uuid, name text, organization_name text, status public.program_status,
  program_type public.program_type, description text, updated_at timestamptz,
  requires_kyc boolean, bounty_min_minor_units bigint, bounty_max_minor_units bigint, bounty_currency text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select p.id, p.organization_id, p.name, o.name, p.status, p.program_type, p.description, p.updated_at,
      p.requires_kyc, bounty.min_minor_units, bounty.max_minor_units, bounty.currency
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    left join lateral (
      select min(r.min_amount_minor_units) as min_minor_units, max(r.max_amount_minor_units) as max_minor_units, v.currency
      from (select * from public.program_bounty_policy_versions v0
            where v0.program_id = p.id and v0.superseded_at is null order by v0.created_at desc limit 1) v
      join public.program_bounty_policy_severity_ranges r on r.policy_version_id = v.id
      group by v.currency
    ) bounty on true
    where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused')
      and o.status <> 'suspended';
end;
$$;
revoke all on function public.get_public_program(uuid) from public;
grant execute on function public.get_public_program(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- My reports, filtered in the database
-- ---------------------------------------------------------------------------

drop function public.list_my_reports(integer, timestamptz, uuid);
create function public.list_my_reports(
  p_limit integer default 20,
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null,
  p_status public.report_status default null,
  p_program_id uuid default null,
  p_severity public.report_severity default null
)
returns table (
  id uuid, program_id uuid, organization_id uuid, program_name text, organization_name text,
  title text, display_target text, status public.report_status, confirmed_severity public.report_severity, submitted_at timestamptz
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
      and (p_status is null or r.status = p_status)
      and (p_program_id is null or r.program_id = p_program_id)
      and (p_severity is null or r.confirmed_severity = p_severity)
      and (p_before_submitted_at is null or (r.submitted_at, r.id) < (p_before_submitted_at, p_before_id))
    order by r.submitted_at desc, r.id desc
    limit effective_limit;
end;
$$;
revoke all on function public.list_my_reports(integer, timestamptz, uuid, public.report_status, uuid, public.report_severity) from public, anon;
grant execute on function public.list_my_reports(integer, timestamptz, uuid, public.report_status, uuid, public.report_severity) to authenticated;

-- ---------------------------------------------------------------------------
-- Server-side report drafts
-- ---------------------------------------------------------------------------

create table public.report_drafts (
  researcher_id uuid not null references public.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 120000),
  updated_at timestamptz not null default now(),
  primary key (researcher_id, program_id)
);
alter table public.report_drafts enable row level security;
create policy "report drafts are private to their researcher" on public.report_drafts
  for select to authenticated using (researcher_id = auth.uid());
grant select on public.report_drafts to authenticated;
grant select, insert, update, delete on public.report_drafts to service_role;

-- Only text fields a researcher typed are kept; attachments are never stored in a draft.
create or replace function public.save_my_report_draft(target_program_id uuid, p_draft jsonb)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved timestamptz;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.program_researchers pr where pr.program_id = target_program_id and pr.user_id = actor and pr.status = 'active') then
    raise exception 'FORBIDDEN: you are not an active researcher on this program' using errcode = '42501';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or pg_column_size(p_draft) > 120000 then
    raise exception 'INVALID_DRAFT: the draft is too large' using errcode = '22023';
  end if;
  insert into public.report_drafts (researcher_id, program_id, draft, updated_at) values (actor, target_program_id, p_draft, now())
  on conflict (researcher_id, program_id) do update set draft = excluded.draft, updated_at = now()
  returning updated_at into saved;
  return saved;
end;
$$;

create or replace function public.delete_my_report_draft(target_program_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.report_drafts where researcher_id = auth.uid() and program_id = target_program_id;
$$;

create or replace function private.clear_report_draft_on_submit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.report_drafts where researcher_id = new.researcher_id and program_id = new.program_id;
  return new;
end;
$$;
create trigger reports_clear_draft_on_submit
  after insert on public.reports
  for each row execute function private.clear_report_draft_on_submit();

revoke all on function public.save_my_report_draft(uuid, jsonb) from public, anon;
revoke all on function public.delete_my_report_draft(uuid) from public, anon;
revoke all on function private.clear_report_draft_on_submit() from public;
grant execute on function public.save_my_report_draft(uuid, jsonb) to authenticated;
grant execute on function public.delete_my_report_draft(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The researcher's status history
-- ---------------------------------------------------------------------------

create or replace function public.get_report_status_history(target_report_id uuid)
returns table (action text, occurred_at timestamptz, detail text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_currently_read_report(target_report_id, auth.uid()) then
    return;
  end if;
  return query
    select al.action, al.created_at,
      coalesce(al.metadata ->> 'outcome', al.metadata ->> 'severity', al.metadata ->> 'confirmed_severity', al.metadata ->> 'new_severity')
    from public.audit_logs al
    where al.entity_type = 'report' and al.entity_id = target_report_id
      and al.action in (
        'report.created', 'report.triage_started', 'report.information_requested', 'report.researcher_responded',
        'report.accepted', 'report.resolved', 'report.marked_duplicate', 'report.marked_informative',
        'report.marked_not_applicable', 'report.rejected', 'report.severity_set', 'report.reopened',
        'report.retest_requested', 'report.retest_decided', 'report.mediation_opened', 'report.mediation_resolved',
        'bounty.finalized', 'bounty.adjusted',
        'report_disclosure.requested', 'report_disclosure.approved', 'report_disclosure.declined', 'report_disclosure.unpublished'
      )
    order by al.created_at, al.id;
end;
$$;
revoke all on function public.get_report_status_history(uuid) from public, anon;
grant execute on function public.get_report_status_history(uuid) to authenticated;
