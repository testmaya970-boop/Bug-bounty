-- Analytics & reporting (docs/decisions/0091).
--
-- 1. list_organization_report_facts: one row per report for a date range and filters (program,
--    severity, status, asset). Every KPI on the Explore tab and in every export (CSV, Excel,
--    PDF) is computed from these rows, so a number on screen and the same number in a file
--    can't disagree. Same readers and program scoping as the existing response-time metrics.
-- 2. list_organization_scope_assets: in-scope assets, the denominator for asset coverage.
-- 3. Scheduled exports: a saved filter + format + weekly/monthly cadence. The worker builds
--    the file AS THE PERSON WHO SCHEDULED IT (their access is re-checked every run), keeps it
--    here (exports are small; kept 90 days), and emails them a link to download it after
--    signing in. Report data never travels in the email.
-- 4. Fix to 202610290008: list_triage_analysts counts only a verified MFA factor.

create or replace function public.list_organization_report_facts(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_program_ids uuid[] default null,
  p_severities text[] default null,
  p_statuses text[] default null,
  p_asset_ids uuid[] default null
)
returns table (
  report_id uuid, title text, program_id uuid, program_name text, asset_id uuid, asset_label text, asset_type text,
  severity text, cvss_score numeric, status text, researcher_id uuid, researcher_name text,
  submitted_at timestamptz, first_response_at timestamptz, triaged_at timestamptz, closed_at timestamptz,
  first_response_target_hours integer, triage_target_hours integer, resolution_target_days integer,
  bounty_currency text, bounty_awarded_minor_units bigint, bounty_paid_minor_units bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  scope uuid[] := private.authorize_response_metrics_read(p_organization_id);
begin
  if p_to < p_from or p_to - p_from > 731 then raise exception 'INVALID_PERIOD: choose a period of up to two years' using errcode = '22023'; end if;
  return query
  select x.report_id, r.title, x.program_id, p.name, r.asset_id, a.display_identifier, coalesce(a.asset_type, r.asset_type)::text,
    x.severity, coalesce(r.cvss4_score, r.cvss_base_score), x.status, r.researcher_id, u.display_name,
    x.submitted_at, x.first_response_at, x.triaged_at, x.resolved_at,
    x.first_response_target_hours, x.triage_target_hours, x.resolution_target_days,
    x.bounty_currency, x.bounty_amount_minor_units,
    (select coalesce(sum(o.amount_minor_units), 0)::bigint from public.payment_obligations o where o.report_id = x.report_id and o.status = 'succeeded')
  from private.report_response_timings(p_organization_id, p_from::timestamp at time zone 'UTC') x
  join public.reports r on r.id = x.report_id
  join public.programs p on p.id = x.program_id
  left join public.assets a on a.id = r.asset_id
  left join public.users u on u.id = r.researcher_id
  where x.submitted_at < (p_to + 1)::timestamp at time zone 'UTC'
    and (scope is null or x.program_id = any (scope))
    and (p_program_ids is null or cardinality(p_program_ids) = 0 or x.program_id = any (p_program_ids))
    and (p_severities is null or cardinality(p_severities) = 0 or coalesce(x.severity, 'unrated') = any (p_severities))
    and (p_statuses is null or cardinality(p_statuses) = 0 or x.status = any (p_statuses))
    and (p_asset_ids is null or cardinality(p_asset_ids) = 0 or r.asset_id = any (p_asset_ids))
  order by x.submitted_at desc
  limit 20000;
end;
$$;

create or replace function public.list_organization_scope_assets(p_organization_id uuid, p_program_ids uuid[] default null)
returns table (asset_id uuid, asset_label text, asset_type text, program_names text[])
language plpgsql stable security definer set search_path = ''
as $$
declare
  scope uuid[] := private.authorize_response_metrics_read(p_organization_id);
begin
  return query
  select a.id, a.display_identifier, a.asset_type::text, array_agg(distinct p.name order by p.name)
  from public.program_scope_entries e
  join public.assets a on a.id = e.asset_id
  join public.programs p on p.id = e.program_id
  where e.organization_id = p_organization_id and e.status = 'active' and e.scope_state = 'in_scope'
    and (scope is null or e.program_id = any (scope))
    and (p_program_ids is null or cardinality(p_program_ids) = 0 or e.program_id = any (p_program_ids))
  group by a.id, a.display_identifier, a.asset_type
  order by a.display_identifier;
end;
$$;

revoke all on function public.list_organization_report_facts(uuid, date, date, uuid[], text[], text[], uuid[]) from public, anon;
grant execute on function public.list_organization_report_facts(uuid, date, date, uuid[], text[], text[], uuid[]) to authenticated, service_role;
revoke all on function public.list_organization_scope_assets(uuid, uuid[]) from public, anon;
grant execute on function public.list_organization_scope_assets(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled exports
-- ---------------------------------------------------------------------------

create table public.analytics_export_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  format text not null check (format in ('csv', 'xlsx', 'pdf')),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  -- { program_ids: uuid[], severities: text[], statuses: text[], asset_ids: uuid[] }; the period
  -- is always the 7 or ~30 days before each run.
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index analytics_export_schedules_due_idx on public.analytics_export_schedules (next_run_at) where active;

create table public.analytics_export_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.analytics_export_schedules (id) on delete set null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null references public.users (id) on delete cascade,
  format text not null check (format in ('csv', 'xlsx', 'pdf')),
  period_from date not null,
  period_to date not null,
  status text not null check (status in ('ready', 'failed')),
  file_name text,
  content bytea check (content is null or octet_length(content) <= 20 * 1024 * 1024),
  error text,
  created_at timestamptz not null default now(),
  check ((status = 'ready') = (content is not null))
);
create index analytics_export_runs_org_idx on public.analytics_export_runs (organization_id, created_at desc);

alter table public.analytics_export_schedules enable row level security;
alter table public.analytics_export_runs enable row level security;
-- The person who scheduled it, and the organization's owners and security admins.
create policy "export schedules readable by creator and org admins" on public.analytics_export_schedules for select to authenticated
  using (created_by = auth.uid() or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
create policy "export runs readable by requester and org admins" on public.analytics_export_runs for select to authenticated
  using (requested_by = auth.uid() or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
revoke all on public.analytics_export_schedules, public.analytics_export_runs from public, anon, authenticated;
grant select on public.analytics_export_schedules, public.analytics_export_runs to authenticated;
grant select, insert, update on public.analytics_export_schedules to service_role;
grant select, insert, delete on public.analytics_export_runs to service_role;

-- Weekly: Mondays 07:00 UTC. Monthly: the 1st, 07:00 UTC.
create or replace function private.next_export_run(p_frequency text, p_after timestamptz)
returns timestamptz
language sql immutable set search_path = ''
as $$
  select case p_frequency
    when 'weekly' then date_trunc('week', p_after at time zone 'UTC') + interval '7 days 7 hours'
    else date_trunc('month', p_after at time zone 'UTC') + interval '1 month 7 hours'
  end at time zone 'UTC';
$$;
revoke all on function private.next_export_run(text, timestamptz) from public, anon;

create or replace function public.create_analytics_export_schedule(p_organization_id uuid, p_name text, p_format text, p_frequency text, p_filters jsonb)
returns public.analytics_export_schedules
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  scope uuid[] := private.authorize_response_metrics_read(p_organization_id);
  v_name text := trim(coalesce(p_name, ''));
  result public.analytics_export_schedules;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'INVALID_SCHEDULE: give the export a name' using errcode = '22023'; end if;
  if p_format not in ('csv', 'xlsx', 'pdf') then raise exception 'INVALID_SCHEDULE: choose CSV, Excel or PDF' using errcode = '22023'; end if;
  if p_frequency not in ('weekly', 'monthly') then raise exception 'INVALID_SCHEDULE: choose weekly or monthly' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) <> 'object' then raise exception 'INVALID_SCHEDULE: invalid filters' using errcode = '22023'; end if;
  -- A program manager may only schedule programs they manage (scope is null for org-wide readers).
  if scope is not null and exists (
    select 1 from jsonb_array_elements_text(coalesce(p_filters -> 'program_ids', '[]'::jsonb)) pid where not (pid::uuid = any (scope))
  ) then
    raise exception 'FORBIDDEN: you can only export the programs you manage' using errcode = '42501';
  end if;
  if (select count(*) from public.analytics_export_schedules s where s.organization_id = p_organization_id and s.active) >= 20 then
    raise exception 'TOO_MANY_SCHEDULES: an organization can keep up to 20 scheduled exports' using errcode = '23514';
  end if;
  insert into public.analytics_export_schedules (organization_id, created_by, name, format, frequency, filters, next_run_at)
  values (p_organization_id, actor, v_name, p_format, p_frequency, coalesce(p_filters, '{}'::jsonb), private.next_export_run(p_frequency, now()))
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'analytics.export_scheduled', 'organization', p_organization_id,
    jsonb_build_object('schedule_id', result.id, 'format', p_format, 'frequency', p_frequency));
  return result;
end;
$$;

create or replace function public.delete_analytics_export_schedule(p_schedule_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  s public.analytics_export_schedules;
begin
  select * into s from public.analytics_export_schedules where id = p_schedule_id for update;
  if s.id is null or not (s.created_by = actor or private.has_org_role(s.organization_id, array['owner', 'security_admin']::public.organization_member_role[])) then
    raise exception 'NOT_FOUND: scheduled export not found' using errcode = 'P0002';
  end if;
  update public.analytics_export_schedules set active = false where id = s.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, s.organization_id, 'analytics.export_unscheduled', 'organization', s.organization_id, jsonb_build_object('schedule_id', s.id));
end;
$$;

-- Worker: due schedules, advanced to their next slot in the same statement, so a schedule runs
-- at most once per slot even with several workers (or a crash between claim and run).
create or replace function public.claim_due_analytics_exports(p_limit integer default 5)
returns setof public.analytics_export_schedules
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  update public.analytics_export_schedules s set next_run_at = private.next_export_run(s.frequency, now()), last_run_at = now()
  where s.id in (
    select d.id from public.analytics_export_schedules d where d.active and d.next_run_at <= now()
    order by d.next_run_at limit greatest(1, least(p_limit, 50)) for update skip locked
  )
  returning s.*;
end;
$$;
revoke all on function public.claim_due_analytics_exports(integer) from public, anon, authenticated;
grant execute on function public.claim_due_analytics_exports(integer) to service_role;

revoke all on function public.create_analytics_export_schedule(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.create_analytics_export_schedule(uuid, text, text, text, jsonb) to authenticated;
revoke all on function public.delete_analytics_export_schedule(uuid) from public, anon;
grant execute on function public.delete_analytics_export_schedule(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fix: an analyst "has MFA" only with a verified factor.
-- ---------------------------------------------------------------------------

create or replace function public.list_triage_analysts()
returns table (user_id uuid, display_name text, email text, added_at timestamptz, has_mfa boolean, open_claims bigint, actions_30d bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select a.user_id, u.display_name, u.email, a.added_at,
    exists (select 1 from public.mfa_factors f where f.user_id = a.user_id and f.status = 'verified'),
    (select count(*) from public.managed_triage_claims c where c.analyst_id = a.user_id),
    (select count(*) from public.audit_logs l where l.actor_id = a.user_id and l.entity_type = 'report' and l.created_at > now() - interval '30 days')
  from public.triage_analysts a join public.users u on u.id = a.user_id
  where a.active order by u.display_name;
end;
$$;

-- Server-side tooling (seed, support scripts) reaches the Managed Triage tables as service_role.
grant select, insert, update, delete on public.triage_analysts, public.managed_triage_subscriptions, public.managed_triage_claims,
  public.report_triage_assessments, public.report_triage_escalations to service_role;
grant select, insert on public.organization_service_charges to service_role;
