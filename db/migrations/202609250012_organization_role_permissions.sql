-- Organization roles, part 2: make all five roles real (product decision, 2026-09-25).
--
-- Before this, every permission check named only 'owner' and 'security_admin'; an invited
-- Program Manager, Triager, or Billing Admin could see the org name and roster and nothing
-- else, and nothing could assign anyone to a program except its creator.
--
--                                 Owner  Sec.Admin  Program Mgr     Triager         Billing
--   members, roles, org settings   all   non-owner   -               -               -
--   create/launch/pause programs   yes   yes         assigned        -               -
--   scope, settings, researchers   yes   yes         assigned        -               -
--   read reports                   yes   yes         assigned        assigned        summaries only
--   triage, severity, messages     yes   yes         assigned        assigned        -
--   decide/finalize bounties       yes   yes         assigned        -               -
--   payouts, fees, payment ledger  yes   yes         -               -               yes
--
-- "Assigned" = a program_members row (role 'manager' or 'triager') AND an active
-- organization membership. The membership check is new: program access used to survive a
-- member being suspended or removed from the organization.
--
-- Helpers, deliberately not callers: private.is_program_member keeps meaning "manages
-- this program" (now also requiring the manager role and active membership), so the ~23
-- management functions that call it keep their exact semantics. The new
-- private.is_program_triager (manager OR triager) is swapped in only where triagers belong:
-- report/program reads, triage transitions, messages, evidence, program analytics.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.is_program_member(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.program_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
    where pm.program_id = target_program_id and pm.user_id = auth.uid() and pm.role = 'manager'
  );
end;
$$;

create or replace function private.is_program_triager(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.program_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
    where pm.program_id = target_program_id and pm.user_id = auth.uid() and pm.role in ('manager', 'triager')
  );
end;
$$;

revoke all on function private.is_program_triager(uuid) from public;
grant execute on function private.is_program_triager(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read policies: triagers read what they triage
-- ---------------------------------------------------------------------------

-- Each table's SELECT policy is found by the exact text being replaced, and must match
-- exactly once -- anything else aborts the migration rather than changing access silently.
do $$
declare
  tbl text;
  pol record;
  matches integer;
begin
  foreach tbl in array array[
    'programs', 'reports', 'program_scope_entries', 'report_messages', 'report_evidence', 'report_collaborators',
    'report_retests', 'report_mediations', 'report_disclosures', 'report_bounty_decisions',
    'program_bounty_policy_versions', 'program_bounty_policy_severity_ranges', 'users'
  ] loop
    matches := 0;
    for pol in select policyname, qual from pg_policies
      where schemaname = 'public' and tablename = tbl and cmd = 'SELECT' and qual like '%private.is_program_member(%'
    loop
      matches := matches + 1;
      execute format('alter policy %I on public.%I using (%s)', pol.policyname, tbl, replace(pol.qual, 'private.is_program_member(', 'private.is_program_triager('));
    end loop;
    if matches <> 1 then raise exception 'role migration: expected 1 program-member read policy on %, found %', tbl, matches; end if;
  end loop;
end;
$$;

-- Billing Admins read the payment ledger and bounty decisions (amounts only -- the report
-- rows themselves stay unreadable to them; see list_payment_obligations_for_billing).
do $$
declare
  tbl text;
  pol record;
  matches integer;
  admins constant text := 'ARRAY[''owner''::organization_member_role, ''security_admin''::organization_member_role]';
  with_billing constant text := 'ARRAY[''owner''::organization_member_role, ''security_admin''::organization_member_role, ''billing_admin''::organization_member_role]';
begin
  foreach tbl in array array['payment_obligations', 'payment_attempts', 'report_bounty_decisions'] loop
    matches := 0;
    for pol in select policyname, qual from pg_policies
      where schemaname = 'public' and tablename = tbl and cmd = 'SELECT' and position(admins in qual) > 0
    loop
      matches := matches + 1;
      execute format('alter policy %I on public.%I using (%s)', pol.policyname, tbl, replace(pol.qual, admins, with_billing));
    end loop;
    if matches <> 1 then raise exception 'role migration: expected 1 org-admin read policy on %, found %', tbl, matches; end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triage, communication, evidence, analytics: open to triagers
-- (identical to their current definitions except is_program_member -> is_program_triager)
-- ---------------------------------------------------------------------------

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
  return report;
end;
$$;

create or replace function private.authorize_report_for_communication(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_triager(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot communicate on this report' using errcode = '42501';
  end if;
  return report;
end;
$$;

create or replace function private.authorize_program_analytics_read(target_program_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  program public.programs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_triager(target_program_id)
    or private.is_researcher_authorized_for_program(target_program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot view analytics for this program' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.record_evidence_download(target_evidence_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  evidence public.report_evidence;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into evidence from public.report_evidence
    where id = target_evidence_id
      and (
        (visibility = 'researcher_visible' and researcher_id = actor)
        or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
        or private.is_program_triager(program_id)
      );
  if evidence.id is null then raise exception 'EVIDENCE_NOT_FOUND: evidence not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, evidence.organization_id, 'report.evidence_downloaded', 'report', evidence.report_id, jsonb_build_object('evidence_id', evidence.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Money: bounty decisions (+ program managers) vs payments (+ billing admins)
-- ---------------------------------------------------------------------------

-- finalize_bounty / adjust_bounty: the program's manager may decide the amount.
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
  return report;
end;
$$;

-- Payments: owners, security admins, billing admins -- never program managers or triagers.
create or replace function private.lock_and_authorize_report_for_payments(target_report_id uuid)
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
  if not private.has_org_role(report.organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot manage payments for this report' using errcode = '42501';
  end if;
  return report;
end;
$$;

revoke all on function private.lock_and_authorize_report_for_payments(uuid) from public;

create or replace function private.lock_and_authorize_obligation_for_finance(target_obligation_id uuid)
returns public.payment_obligations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  obligation public.payment_obligations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into obligation from public.payment_obligations where id = target_obligation_id for update;
  if obligation.id is null then raise exception 'OBLIGATION_NOT_FOUND: payment obligation not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(obligation.organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot manage payment obligations for this program' using errcode = '42501';
  end if;
  return obligation;
end;
$$;

-- Identical to 202609250001's version except the lock (payments, not bounty decisions).
create or replace function public.create_payment_obligation(target_report_id uuid)
returns public.payment_obligations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  existing public.payment_obligations;
  obligation public.payment_obligations;
  platform_fee_bps constant integer := 2000;
  fee_amount bigint;
begin
  report := private.lock_and_authorize_report_for_payments(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id for update;
  if decision.id is null or decision.state <> 'finalized' then
    raise exception 'BOUNTY_NOT_FINALIZED: only a finalized bounty decision can create a payment obligation' using errcode = '23514';
  end if;

  if decision.final_amount_minor_units <= 0 then
    raise exception 'NOTHING_TO_PAY: this bounty was finalized at zero, no payment obligation is needed' using errcode = '23514';
  end if;

  select * into existing from public.payment_obligations where bounty_decision_id = decision.id;
  if existing.id is not null then
    raise exception 'OBLIGATION_ALREADY_EXISTS: a payment obligation already exists for this bounty decision' using errcode = '23514';
  end if;

  fee_amount := (decision.final_amount_minor_units * platform_fee_bps) / 10000;

  insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, amount_minor_units, platform_fee_minor_units, currency, status)
  values (report.organization_id, report.program_id, target_report_id, report.researcher_id, decision.id, decision.final_amount_minor_units, fee_amount, decision.currency, 'pending')
  returning * into obligation;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'payment.obligation_created', 'report', target_report_id,
    jsonb_build_object('obligation_id', obligation.id, 'amount_minor_units', obligation.amount_minor_units, 'platform_fee_minor_units', obligation.platform_fee_minor_units, 'currency', obligation.currency));

  return obligation;
end;
$$;

-- Billing Admin's view of the ledger: report TITLE only (never description, impact,
-- evidence, or messages -- report rows stay unreadable to them under RLS).
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
  select o.id, o.report_id, o.program_id, p.name, r.title, u.display_name,
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

revoke all on function public.list_payment_obligations_for_billing(uuid) from public;
grant execute on function public.list_payment_obligations_for_billing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Program assignment (owners and security admins)
-- ---------------------------------------------------------------------------

-- The program role follows the org role: a Program Manager is assigned as 'manager', a
-- Triager as 'triager'. Owners and security admins already reach every program, and
-- billing admins never work reports, so neither is assignable.
create or replace function public.assign_program_member(target_program_id uuid, target_user_id uuid)
returns public.program_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  target_role public.organization_member_role;
  program_role public.program_member_role;
  assigned public.program_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can assign program members' using errcode = '42501';
  end if;

  select m.role into target_role from public.organization_members m
  where m.organization_id = program.organization_id and m.user_id = target_user_id and m.status = 'active';
  if target_role is null then
    raise exception 'NOT_A_MEMBER: this person is not an active member of the organization' using errcode = '22023';
  end if;
  program_role := case target_role when 'program_manager' then 'manager'::public.program_member_role when 'triager' then 'triager'::public.program_member_role end;
  if program_role is null then
    raise exception 'ROLE_NOT_ASSIGNABLE: only Program Managers and Triagers are assigned to programs (owners and security admins already reach every program)' using errcode = '22023';
  end if;

  insert into public.program_members (program_id, organization_id, user_id, role, added_by)
  values (target_program_id, program.organization_id, target_user_id, program_role, actor)
  on conflict (program_id, user_id) do update set role = excluded.role
  returning * into assigned;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.member_assigned', 'program', target_program_id,
    jsonb_build_object('user_id', target_user_id, 'program_role', program_role));

  return assigned;
end;
$$;

revoke all on function public.assign_program_member(uuid, uuid) from public;
grant execute on function public.assign_program_member(uuid, uuid) to authenticated;

create or replace function public.unassign_program_member(target_program_id uuid, target_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can unassign program members' using errcode = '42501';
  end if;

  delete from public.program_members where program_id = target_program_id and user_id = target_user_id;
  if not found then raise exception 'NOT_ASSIGNED: this person is not assigned to the program' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.member_unassigned', 'program', target_program_id, jsonb_build_object('user_id', target_user_id));
end;
$$;

revoke all on function public.unassign_program_member(uuid, uuid) from public;
grant execute on function public.unassign_program_member(uuid, uuid) to authenticated;
