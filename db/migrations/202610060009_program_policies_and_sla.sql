-- Program policy, safe harbor, disclosure policy and response SLAs -- competitive-parity
-- group 2. Until now a program's rules lived only in programs.description (free text,
-- overwritten in place, no history), there was no per-program safe harbor or disclosure
-- policy, and no response target existed to measure against.
--
-- 1. program_policy_versions: append-only, one effective version per program (superseded_at
--    is null), the same pattern as program_bounty_policy_versions (202608280002). Each version
--    holds rules of engagement, whether the program commits to the platform safe harbor, its
--    disclosure policy, and SLA targets.
-- 2. publish_program_policy: owners, security admins, or the program's manager (the existing
--    lifecycle authorization); audited with the version number.
-- 3. reports.policy_version_id: every report is bound, at insert, to the policy in effect
--    when it was submitted -- the rules a researcher agreed to, even after later edits.
-- 4. get_program_policy: the effective policy for anyone who can see the program (public
--    program pages included, matching get_public_program).
-- 5. SLA: private.report_sla derives first response (first researcher-visible organization
--    message, or any triage/outcome action), triage and resolution times from real history
--    against the report's bound targets. get_report_sla (anyone who can read the report)
--    and get_organization_sla_summary (analytics readers) expose it.

-- ---------------------------------------------------------------------------
-- 1. Versions
-- ---------------------------------------------------------------------------

create type public.program_disclosure_mode as enum ('coordinated', 'full', 'none');

create table public.program_policy_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null,
  version_number integer not null check (version_number > 0),
  rules_of_engagement text not null check (char_length(rules_of_engagement) between 1 and 20000),
  safe_harbor boolean not null,
  disclosure_mode public.program_disclosure_mode not null,
  disclosure_days integer check (disclosure_days between 0 and 365),
  first_response_target_hours integer check (first_response_target_hours between 1 and 720),
  triage_target_hours integer check (triage_target_hours between 1 and 2160),
  resolution_target_days integer check (resolution_target_days between 1 and 365),
  change_note text check (change_note is null or char_length(change_note) <= 1000),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade,
  unique (program_id, version_number),
  unique (id, program_id),
  -- Days only mean something for coordinated disclosure.
  check ((disclosure_mode = 'coordinated') = (disclosure_days is not null))
);
create unique index program_policy_versions_one_effective on public.program_policy_versions (program_id) where superseded_at is null;

alter table public.program_policy_versions enable row level security;
-- Read through the programs table's own RLS: whoever can see the program sees its history.
create policy "program policy versions read with the program" on public.program_policy_versions
  for select to authenticated using (exists (select 1 from public.programs p where p.id = program_id));
grant select on public.program_policy_versions to authenticated;
grant select, insert, update, delete on public.program_policy_versions to service_role;

-- Append-only: the only permitted change is superseding.
create or replace function private.guard_program_policy_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'IMMUTABLE_POLICY: published policy versions cannot be deleted' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'superseded_at') is distinct from (to_jsonb(old) - 'superseded_at') or old.superseded_at is not null then
    raise exception 'IMMUTABLE_POLICY: a published policy version cannot be edited -- publish a new version' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger program_policy_versions_append_only
  before update or delete on public.program_policy_versions
  for each row execute function private.guard_program_policy_version();

-- ---------------------------------------------------------------------------
-- 2. Publishing
-- ---------------------------------------------------------------------------

create or replace function public.publish_program_policy(
  target_program_id uuid,
  p_rules_of_engagement text,
  p_safe_harbor boolean,
  p_disclosure_mode public.program_disclosure_mode,
  p_disclosure_days integer,
  p_first_response_target_hours integer,
  p_triage_target_hours integer,
  p_resolution_target_days integer,
  p_change_note text default null
)
returns public.program_policy_versions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  previous public.program_policy_versions;
  created public.program_policy_versions;
  trimmed_rules text := trim(coalesce(p_rules_of_engagement, ''));
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if char_length(trimmed_rules) = 0 then
    raise exception 'INVALID_POLICY: write the rules of engagement researchers must follow' using errcode = '22023';
  end if;
  if char_length(trimmed_rules) > 20000 then
    raise exception 'INVALID_POLICY: rules of engagement must be 20000 characters or fewer' using errcode = '22023';
  end if;
  if p_safe_harbor is null or p_disclosure_mode is null then
    raise exception 'INVALID_POLICY: choose a safe harbor and disclosure policy' using errcode = '22023';
  end if;
  if (p_disclosure_mode = 'coordinated') <> (p_disclosure_days is not null) then
    raise exception 'INVALID_POLICY: coordinated disclosure needs a number of days; other modes take none' using errcode = '22023';
  end if;
  if p_triage_target_hours is not null and p_first_response_target_hours is not null and p_triage_target_hours < p_first_response_target_hours then
    raise exception 'INVALID_POLICY: the triage target cannot be shorter than the first-response target' using errcode = '22023';
  end if;

  select * into previous from public.program_policy_versions where program_id = program.id and superseded_at is null for update;
  if previous.id is not null then
    update public.program_policy_versions set superseded_at = now() where id = previous.id;
  end if;

  insert into public.program_policy_versions (
    program_id, organization_id, version_number, rules_of_engagement, safe_harbor, disclosure_mode, disclosure_days,
    first_response_target_hours, triage_target_hours, resolution_target_days, change_note, created_by
  ) values (
    program.id, program.organization_id, coalesce(previous.version_number, 0) + 1, trimmed_rules, p_safe_harbor, p_disclosure_mode, p_disclosure_days,
    p_first_response_target_hours, p_triage_target_hours, p_resolution_target_days, nullif(trim(coalesce(p_change_note, '')), ''), actor
  ) returning * into created;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.policy_published', 'program', program.id,
    jsonb_build_object('version_number', created.version_number, 'safe_harbor', created.safe_harbor, 'disclosure_mode', created.disclosure_mode,
                       'disclosure_days', created.disclosure_days, 'first_response_target_hours', created.first_response_target_hours,
                       'triage_target_hours', created.triage_target_hours, 'resolution_target_days', created.resolution_target_days));
  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reports are bound to the policy they were submitted under
-- ---------------------------------------------------------------------------

alter table public.reports add column policy_version_id uuid;
alter table public.reports add constraint reports_policy_version_fkey
  foreign key (policy_version_id, program_id) references public.program_policy_versions(id, program_id);

-- The submitter must have acknowledged exactly the version in effect: the caller sets the
-- transaction-local app.acknowledged_policy_version (services/reports.ts submitReport) in
-- the same transaction as submit_report, so a policy republished mid-submission is refused
-- rather than silently bound. Programs without a policy need no acknowledgement.
create or replace function private.bind_report_policy_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  effective public.program_policy_versions;
begin
  select * into effective from public.program_policy_versions v where v.program_id = new.program_id and v.superseded_at is null;
  if effective.id is not null
     and coalesce(nullif(current_setting('app.acknowledged_policy_version', true), ''), '0') <> effective.version_number::text then
    raise exception 'POLICY_NOT_ACKNOWLEDGED: read and accept the current program policy (version %) before submitting', effective.version_number using errcode = '23514';
  end if;
  new.policy_version_id := effective.id;
  return new;
end;
$$;
create trigger reports_bind_policy_version
  before insert on public.reports
  for each row execute function private.bind_report_policy_version();

-- ---------------------------------------------------------------------------
-- 4. Reading the effective policy
-- ---------------------------------------------------------------------------

create or replace function public.get_program_policy(target_program_id uuid)
returns setof public.program_policy_versions
language plpgsql stable security definer set search_path = ''
as $$
declare
  program public.programs;
begin
  select * into program from public.programs where id = target_program_id;
  if program.id is null then return; end if;
  if not (
    exists (
      select 1 from public.organizations o
      where o.id = program.organization_id and program.visibility = 'public' and program.status in ('active', 'paused') and o.status <> 'suspended'
    )
    or private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_triager(program.id)
    or private.is_researcher_authorized_for_program(program.id)
  ) then
    return;
  end if;
  return query select * from public.program_policy_versions v where v.program_id = program.id and v.superseded_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. SLA
-- ---------------------------------------------------------------------------

create or replace function private.report_sla(target_report_id uuid)
returns table (
  report_id uuid,
  policy_version_number integer,
  submitted_at timestamptz,
  first_response_due_at timestamptz,
  first_responded_at timestamptz,
  triage_due_at timestamptz,
  triaged_at timestamptz,
  resolution_due_at timestamptz,
  closed_at timestamptz,
  first_response_breached boolean,
  triage_breached boolean,
  resolution_breached boolean
)
language sql stable security definer set search_path = ''
as $$
  with r as (
    select rp.id, rp.submitted_at, v.version_number, v.first_response_target_hours, v.triage_target_hours, v.resolution_target_days
    from public.reports rp
    left join public.program_policy_versions v on v.id = rp.policy_version_id
    where rp.id = target_report_id
  ),
  history as (
    select
      (select min(at) from (
        select min(m.created_at) as at from public.report_messages m
         where m.report_id = target_report_id and m.author_context = 'organization' and m.visibility = 'researcher_visible'
        union all
        select min(al.created_at) from public.audit_logs al
         where al.entity_type = 'report' and al.entity_id = target_report_id
           and al.action in ('report.triage_started', 'report.information_requested', 'report.accepted', 'report.resolved',
                             'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')
      ) firsts) as first_responded_at,
      (select min(al.created_at) from public.audit_logs al
        where al.entity_type = 'report' and al.entity_id = target_report_id and al.action = 'report.triage_started') as triaged_at,
      (select min(al.created_at) from public.audit_logs al
        where al.entity_type = 'report' and al.entity_id = target_report_id
          and al.action in ('report.resolved', 'report.marked_duplicate', 'report.marked_informative', 'report.marked_not_applicable', 'report.rejected')) as closed_at
  ),
  due as (
    select r.*, h.*,
      r.submitted_at + make_interval(hours => r.first_response_target_hours) as fr_due,
      r.submitted_at + make_interval(hours => r.triage_target_hours) as tr_due,
      r.submitted_at + make_interval(days => r.resolution_target_days) as res_due
    from r cross join history h
  )
  select id, version_number, submitted_at,
    fr_due, first_responded_at, tr_due, triaged_at, res_due, closed_at,
    case when fr_due is null then null else coalesce(first_responded_at, now()) > fr_due end,
    case when tr_due is null then null else coalesce(triaged_at, now()) > tr_due end,
    case when res_due is null then null else coalesce(closed_at, now()) > res_due end
  from due;
$$;

create or replace function public.get_report_sla(target_report_id uuid)
returns table (
  report_id uuid, policy_version_number integer, submitted_at timestamptz,
  first_response_due_at timestamptz, first_responded_at timestamptz,
  triage_due_at timestamptz, triaged_at timestamptz,
  resolution_due_at timestamptz, closed_at timestamptz,
  first_response_breached boolean, triage_breached boolean, resolution_breached boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_currently_read_report(target_report_id, auth.uid()) then
    return;
  end if;
  return query select * from private.report_sla(target_report_id);
end;
$$;

-- Per program: how many reports had each target, how many missed it, and the median first
-- response. Reports without a bound policy (submitted before one existed) have no targets
-- and are counted only in report_count.
create or replace function public.get_organization_sla_summary(target_organization_id uuid)
returns table (
  program_id uuid,
  report_count bigint,
  first_response_tracked bigint,
  first_response_breached bigint,
  triage_tracked bigint,
  triage_breached bigint,
  resolution_tracked bigint,
  resolution_breached bigint,
  median_first_response_hours numeric
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  select rp.program_id,
    count(*),
    count(s.first_response_breached),
    count(*) filter (where s.first_response_breached),
    count(s.triage_breached),
    count(*) filter (where s.triage_breached),
    count(s.resolution_breached),
    count(*) filter (where s.resolution_breached),
    round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_responded_at - s.submitted_at)) / 3600))::numeric, 1)
  from public.reports rp
  cross join lateral private.report_sla(rp.id) s
  where rp.organization_id = target_organization_id
  group by rp.program_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.guard_program_policy_version() from public;
revoke all on function private.bind_report_policy_version() from public;
revoke all on function private.report_sla(uuid) from public;
revoke all on function public.publish_program_policy(uuid, text, boolean, public.program_disclosure_mode, integer, integer, integer, integer, text) from public, anon;
revoke all on function public.get_report_sla(uuid) from public, anon;
revoke all on function public.get_organization_sla_summary(uuid) from public, anon;
revoke all on function public.get_program_policy(uuid) from public;
grant execute on function public.publish_program_policy(uuid, text, boolean, public.program_disclosure_mode, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.get_report_sla(uuid) to authenticated;
grant execute on function public.get_organization_sla_summary(uuid) to authenticated;
-- Public program pages are readable signed out, like get_public_program.
grant execute on function public.get_program_policy(uuid) to anon, authenticated;
