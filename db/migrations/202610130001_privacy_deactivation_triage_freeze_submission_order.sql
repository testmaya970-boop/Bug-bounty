-- Product decisions from 2026-10-13 (after the QA pass).
--
-- 1. Researcher emails are private, as on HackerOne. Org staff see a researcher's Unpatched
--    email alias, never the real address; researchers never see staff emails. The email
--    column is no longer readable by `authenticated` at all -- public.visible_email()
--    returns it only to the user themselves, their org co-members, or a platform admin,
--    and public.researcher_alias_local_part() gives program staff the alias.
-- 2. A suspended organization's triage and bounty decisions are frozen (both report
--    authorization helpers refuse while the org is not operable).
-- 3. A deactivated account no longer exists for anyone else: other users can't read its
--    row, people lists drop it, and records it left behind (reports, payments, disclosures,
--    collaborators, invitations) show "Deactivated account". Platform admins still see it.
-- 4. "Two researchers submit at the same time -- who wins?" submitted_at is transaction
--    start time and can tie. reports.submission_seq comes from a sequence at insert, so it
--    is the true arrival order with no ties, and the duplicate rule uses it.

-- 1 -------------------------------------------------------------------------
create or replace function public.visible_email(target_user_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select u.email from public.users u
  where u.id = target_user_id
    and (u.id = auth.uid() or private.is_platform_admin() or (u.deactivated_at is null and private.shares_organization_with(u.id)));
$$;

revoke all on function public.visible_email(uuid) from public;
grant execute on function public.visible_email(uuid) to authenticated;

create or replace function public.researcher_alias_local_part(target_user_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select a.local_part
  from public.researcher_email_aliases a
  join public.users u on u.id = a.user_id and u.deactivated_at is null
  where a.user_id = target_user_id
    and (a.user_id = auth.uid() or exists (
      select 1 from public.program_researchers r
      where r.user_id = a.user_id
        and (private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(r.program_id))
    ));
$$;

revoke all on function public.researcher_alias_local_part(uuid) from public;
grant execute on function public.researcher_alias_local_part(uuid) to authenticated;

revoke select (email) on public.users from authenticated;

-- 3: other users' rows disappear once deactivated (your own row stays readable) ------
drop policy if exists "users read org co-members" on public.users;
create policy "users read org co-members" on public.users for select to authenticated
  using (id = auth.uid() or (deactivated_at is null and private.shares_organization_with(id)));

drop policy if exists "users read by researchers of a program the user manages or admi" on public.users;
create policy "users read by researchers of a program the user manages or admi" on public.users for select to authenticated
  using (deactivated_at is null and private.is_manager_or_admin_of_my_program(id));

drop policy if exists "users read by managers of a program the user participates in" on public.users;
create policy "users read by managers of a program the user participates in" on public.users for select to authenticated
  using (deactivated_at is null and exists (
    select 1 from public.program_researchers r
    where r.user_id = users.id
      and (private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(r.program_id))
  ));

-- 2 -------------------------------------------------------------------------
create or replace function private.lock_and_authorize_report_for_triage(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_triager(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot triage this report' using errcode = '42501';
  end if;
  if not private.organization_is_operable(report.organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is suspended, so its reports are frozen' using errcode = '42501';
  end if;
  perform private.forbid_self_dealing(report.id);
  return report;
end;
$$;

create or replace function private.lock_and_authorize_report_for_finance(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot make financial decisions for this report' using errcode = '42501';
  end if;
  if not private.organization_is_operable(report.organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is suspended, so its reports are frozen' using errcode = '42501';
  end if;
  return report;
end;
$$;

-- 4 -------------------------------------------------------------------------
create sequence if not exists public.report_submission_seq;
alter table public.reports add column if not exists submission_seq bigint;
update public.reports r set submission_seq = o.n
  from (select id, row_number() over (order by submitted_at, created_at, id) as n from public.reports) o
  where o.id = r.id and r.submission_seq is null;
select setval('public.report_submission_seq', coalesce((select max(submission_seq) from public.reports), 0) + 1, false);
alter table public.reports alter column submission_seq set default nextval('public.report_submission_seq');
alter table public.reports alter column submission_seq set not null;
create unique index if not exists reports_submission_seq_key on public.reports(submission_seq);
grant usage on sequence public.report_submission_seq to authenticated, service_role;

create or replace function private.enforce_report_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  original public.reports;
  hops integer := 0;
begin
  if new.status is distinct from old.status and not private.is_valid_report_transition(old.status, new.status)
     -- The single reopen path: decide_report_retest(still_vulnerable), in this transaction only.
     and not (old.status = 'resolved' and new.status = 'accepted' and current_setting('app.reopening_report', true) = new.id::text) then
    raise exception 'INVALID_TRANSITION: a report cannot move from % to %', old.status, new.status using errcode = '23514';
  end if;

  if new.status is distinct from old.status
     and new.status in ('rejected', 'not_applicable', 'informative', 'duplicate')
     and exists (select 1 from public.report_bounty_decisions d where d.report_id = new.id and d.state = 'finalized') then
    raise exception 'BOUNTY_FINALIZED: this report has a finalized bounty, so it can only be resolved again' using errcode = '23514';
  end if;

  if new.status = 'resolved' and old.status is distinct from 'resolved' and new.severity_at_resolution is null then
    new.severity_at_resolution := new.confirmed_severity;
  end if;

  if new.duplicate_of_report_id is not null and new.duplicate_of_report_id is distinct from old.duplicate_of_report_id then
    select * into original from public.reports where id = new.duplicate_of_report_id;
    -- Point at the root original, not at another duplicate.
    while original.duplicate_of_report_id is not null and hops < 50 loop
      select * into original from public.reports where id = original.duplicate_of_report_id;
      hops := hops + 1;
    end loop;
    if original.id is null or original.program_id <> new.program_id then
      raise exception 'INVALID_DUPLICATE: the original report must be in the same program' using errcode = '22023';
    end if;
    if original.id = new.id then
      raise exception 'INVALID_DUPLICATE: a report cannot duplicate itself' using errcode = '22023';
    end if;
    -- First to arrive wins: submission order, which never ties.
    if original.submission_seq > new.submission_seq then
      raise exception 'INVALID_DUPLICATE: a report can only duplicate one submitted before it' using errcode = '22023';
    end if;
    new.duplicate_of_report_id := original.id;
  end if;
  return new;
end;
$$;

-- 3: functions that bypass row security ----------------------------------------
-- public.get_organization_top_researchers: deactivated accounts leave the list (from 202610060015_org_analytics_corrections.sql)
create or replace function public.get_organization_top_researchers(target_organization_id uuid, p_limit integer default 10)
returns table (
  researcher_id uuid,
  display_name text,
  resolved_count bigint,
  high_or_critical_count bigint,
  invalid_count bigint,
  signal_percent integer,
  currency text,
  awarded_minor_units numeric,
  paid_minor_units numeric,
  last_submitted_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_read(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[]);

  return query
  with per_researcher as (
    select r.researcher_id,
      count(*) filter (where r.status = 'resolved') as resolved,
      count(*) filter (where r.status = 'resolved' and r.confirmed_severity in ('high', 'critical')) as severe,
      count(*) filter (where r.status in ('rejected', 'not_applicable')) as invalid,
      max(r.submitted_at) as last_submitted
    from public.reports r
    where r.organization_id = target_organization_id
    group by r.researcher_id
  ),
  money as (
    select o.researcher_id, o.currency,
      sum(o.amount_minor_units) filter (where o.status <> 'cancelled') as awarded,
      sum(o.amount_minor_units) filter (where o.status = 'succeeded') as paid
    from public.payment_obligations o
    where o.organization_id = target_organization_id
    group by o.researcher_id, o.currency
  )
  select p.researcher_id, u.display_name, p.resolved, p.severe, p.invalid,
    case when p.resolved + p.invalid > 0 then ((100 * p.resolved) / (p.resolved + p.invalid))::integer end,
    m.currency, coalesce(m.awarded, 0), coalesce(m.paid, 0), p.last_submitted
  from per_researcher p
  join public.users u on u.id = p.researcher_id and u.deactivated_at is null
  left join lateral (select * from money where money.researcher_id = p.researcher_id order by money.awarded desc nulls last limit 1) m on true
  where p.resolved > 0
  order by p.resolved desc, p.severe desc, p.last_submitted desc, p.researcher_id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

-- public.list_assignable_staff: deactivated accounts leave the list (from 202610060011_report_assignment_and_triage.sql)
create or replace function public.list_assignable_staff(target_organization_id uuid, target_program_id uuid default null)
returns table (user_id uuid, display_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (
    private.has_org_role(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or (target_program_id is not null and private.is_program_triager(target_program_id))
    or (target_program_id is null and exists (
          select 1 from public.program_members pm join public.programs p on p.id = pm.program_id
          where p.organization_id = target_organization_id and pm.user_id = auth.uid()))
  ) then
    raise exception 'FORBIDDEN: only the organization''s triage staff can list assignees' using errcode = '42501';
  end if;

  return query
    select distinct u.id, u.display_name
    from public.organization_members m
    join public.users u on u.id = m.user_id and u.deactivated_at is null
    where m.organization_id = target_organization_id and m.status = 'active'
      and (
        m.role in ('owner', 'security_admin')
        or exists (
          select 1 from public.program_members pm join public.programs p on p.id = pm.program_id
          where pm.user_id = m.user_id and p.organization_id = target_organization_id
            and (target_program_id is null or pm.program_id = target_program_id)
        )
      )
    order by u.display_name;
end;
$$;

-- public.list_researchers_for_organization: deactivated accounts leave the list (from 202609060002_organization_researcher_intelligence.sql)
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
  join public.users u on u.id = rp.user_id and u.deactivated_at is null
  left join resolved_contribution rc on rc.researcher_id = rp.user_id
  left join recency rec on rec.researcher_id = rp.user_id
  order by u.display_name;
end;
$$;

-- public.get_report_payout_readiness: a deactivated account is shown as such (from 202610060008_payout_lifecycle.sql)
create or replace function public.get_report_payout_readiness(target_report_id uuid)
returns table (researcher_id uuid, display_name text, blockers text[])
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  is_finance boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  is_finance := private.has_org_role(report.organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]);

  return query
    select u.id, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end), private.payout_blockers(u.id, report.program_id)
    from (
      select report.researcher_id as id
      union
      select c.researcher_id from public.report_collaborators c where c.report_id = report.id
    ) recipients
    join public.users u on u.id = recipients.id
    where is_finance or recipients.id = actor;
end;
$$;

-- public.list_payment_obligations_for_billing: a deactivated account is shown as such (from 202609250012_organization_role_permissions.sql)
create or replace function public.list_payment_obligations_for_billing(target_org_id uuid)
returns table (
  obligation_id uuid,
  report_id uuid,
  program_id uuid,
  program_name text,
  report_title text,
  researcher_name text,
  amount_minor_units bigint,
  platform_fee_minor_units bigint,
  currency text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_org_role(target_org_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot view this organization''s payments' using errcode = '42501';
  end if;

  return query
  select o.id, o.report_id, o.program_id, p.name, r.title, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end),
         o.amount_minor_units::bigint, o.platform_fee_minor_units, o.currency, o.status::text, o.created_at, o.updated_at
  from public.payment_obligations o
  join public.programs p on p.id = o.program_id
  join public.reports r on r.id = o.report_id
  left join public.users u on u.id = o.researcher_id
  where o.organization_id = target_org_id
  order by o.created_at desc
  limit 500;
end;
$$;

-- public.list_pending_report_disclosures: a deactivated account is shown as such (from 202609030001_report_disclosure_workflow.sql)
create or replace function public.list_pending_report_disclosures(target_org_id uuid)
returns table (
  id uuid,
  report_id uuid,
  program_id uuid,
  report_title text,
  program_name text,
  researcher_display_name text,
  requested_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot view this organization''s disclosure queue' using errcode = '42501';
  end if;

  return query
    select d.id, d.report_id, r.program_id, r.title, p.name, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end), d.requested_at
    from public.report_disclosures d
    join public.reports r on r.id = d.report_id
    join public.programs p on p.id = r.program_id
    join public.users u on u.id = r.researcher_id
    where d.organization_id = target_org_id and d.status = 'requested'
    order by d.requested_at asc;
end;
$$;

-- public.list_report_collaborators: a deactivated account is shown as such (from 202610050010_authorize_report_scoped_readers.sql)
create or replace function public.list_report_collaborators(target_report_id uuid)
returns table (id uuid, researcher_id uuid, display_name text, public_username text, bounty_split_percent numeric, added_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.researcher_id, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end), (case when u.deactivated_at is null then u.public_username end), c.bounty_split_percent, c.added_at
  from public.report_collaborators c
  join public.users u on u.id = c.researcher_id
  where c.report_id = target_report_id
    and exists (
      select 1 from public.reports r
      where r.id = target_report_id
        and (r.researcher_id = auth.uid()
          or private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_triager(r.program_id)
          or private.is_report_collaborator(r.id))
    )
  order by c.added_at asc;
$$;

-- public.list_my_pending_invitations: a deactivated account is shown as such (from 202608260003_organization_creation.sql)
create or replace function public.list_my_pending_invitations()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  role public.organization_member_role,
  invited_by_name text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- `id` (and every other RETURNS TABLE column name) is an OUT-parameter-like variable
  -- in scope across this ENTIRE function body, not just the final RETURN QUERY -- a bare
  -- `id` here is ambiguous with that output column, confirmed by actually running this
  -- function before qualifying it (same class of bug as create_organization's
  -- idempotency_key parameter, different mechanism: output columns, not an argument).
  select users.email into actor_email from public.users where users.id = actor;
  if actor_email is null then return; end if;

  return query
    select i.id, i.organization_id, o.name, i.role, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end), i.expires_at, i.created_at
    from public.organization_invitations i
    join public.organizations o on o.id = i.organization_id
    left join public.users u on u.id = i.invited_by
    where i.email = actor_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

-- public.list_my_pending_program_invitations: a deactivated account is shown as such (from 202608260006_researcher_access_foundation.sql)
create or replace function public.list_my_pending_program_invitations()
returns table (
  id uuid,
  program_id uuid,
  program_name text,
  organization_name text,
  invited_by_name text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select users.email into actor_email from public.users where users.id = actor;
  if actor_email is null then return; end if;

  return query
    select i.id, i.program_id, p.name, o.name, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end), i.expires_at, i.created_at
    from public.program_invitations i
    join public.programs p on p.id = i.program_id
    join public.organizations o on o.id = i.organization_id
    left join public.users u on u.id = i.invited_by
    where i.email = actor_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

-- public.add_report_collaborator: a deactivated account can't be added (from 202609050003_report_collaboration.sql)
create or replace function public.add_report_collaborator(
  target_report_id uuid,
  p_collaborator_username text,
  p_bounty_split_percent numeric
)
returns public.report_collaborators
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  collaborator_id uuid;
  existing_count integer;
  existing_split_sum numeric(6,2);
  new_row public.report_collaborators;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can add collaborators' using errcode = '42501';
  end if;
  if report.status not in ('new', 'triaging') then
    raise exception 'REPORT_LOCKED_FOR_COLLABORATION: collaborators can only be added while the report is new or in triage' using errcode = '23514';
  end if;

  if p_bounty_split_percent is null or p_bounty_split_percent <= 0 or p_bounty_split_percent > 100 then
    raise exception 'INVALID_SPLIT: bounty split percent must be greater than 0 and at most 100' using errcode = '22023';
  end if;

  select u.id into collaborator_id from public.users u where u.deactivated_at is null and lower(u.public_username) = lower(trim(coalesce(p_collaborator_username, '')));
  if collaborator_id is null then
    raise exception 'COLLABORATOR_NOT_FOUND: no researcher exists with that username' using errcode = 'P0002';
  end if;
  if collaborator_id = actor then
    raise exception 'INVALID_COLLABORATOR: you cannot add yourself as a collaborator' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.program_researchers
    where program_id = report.program_id and user_id = collaborator_id and status = 'active'
  ) then
    raise exception 'COLLABORATOR_NOT_AUTHORIZED: that researcher is not an active participant of this program' using errcode = '42501';
  end if;

  select count(*), coalesce(sum(bounty_split_percent), 0) into existing_count, existing_split_sum
    from public.report_collaborators where report_id = target_report_id;

  if existing_count >= 10 then
    raise exception 'COLLABORATOR_LIMIT_REACHED: a report can have at most 10 collaborators' using errcode = '23514';
  end if;
  if existing_split_sum + p_bounty_split_percent >= 100 then
    raise exception 'SPLIT_EXCEEDS_TOTAL: collaborator splits must leave the submitter at least 0.01%% of the bounty' using errcode = '23514';
  end if;

  insert into public.report_collaborators (report_id, researcher_id, bounty_split_percent, added_by)
  values (target_report_id, collaborator_id, p_bounty_split_percent, actor)
  returning * into new_row;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.collaborator_added', 'report', target_report_id,
    jsonb_build_object('collaborator_id', collaborator_id, 'bounty_split_percent', p_bounty_split_percent));

  return new_row;
end;
$$;
