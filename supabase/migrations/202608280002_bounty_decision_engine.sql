-- Bounty Decision Engine Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0013-bounty-decision-engine.md.
--
-- 1. Three tables, not one: program_bounty_policy_versions/..._severity_ranges (program
--    policy, versioned, never edited in place) and report_bounty_decisions (the actual
--    per-report decision). reports.bounty_amount was never on the table.
-- 2. Severity reuses public.report_severity (0009) -- no second taxonomy. All five tiers
--    are mandatory on every policy version, as explicit numeric parameters, never a JSON
--    array, so "not configured" can never be confused with "configured to pay zero."
-- 3. Money is bigint minor units + a format-checked (not list-validated) ISO-4217-shaped
--    currency column. No floating point anywhere.
-- 4. calculate_bounty_recommendation (broad triage authorization) produces a
--    recommendation; finalize_bounty (narrow: org owner/security_admin only) is the only
--    path to a final decision; adjust_bounty (same narrow authorization) is the only way
--    to change an already-finalized amount, and always records the previous/new amount
--    and a reason rather than silently overwriting it.
-- 5. Idempotency-as-rejection: finalizing an already-finalized decision is rejected, the
--    same choice 0009 made for report-status transitions, for the same reason.
-- 6. Every bounty RPC locks the same reports row every triage RPC already locks, so
--    concurrent finalize attempts serialize on it exactly like concurrent triage
--    transitions already do.

create table public.program_bounty_policy_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null,
  version_number integer not null check (version_number > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint program_bounty_policy_versions_program_version_key unique (program_id, version_number),
  constraint program_bounty_policy_versions_id_program_id_key unique (id, program_id),
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade
);

create index program_bounty_policy_versions_effective_idx on public.program_bounty_policy_versions(program_id) where superseded_at is null;

create table public.program_bounty_policy_severity_ranges (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null references public.program_bounty_policy_versions(id) on delete cascade,
  severity public.report_severity not null,
  min_amount_minor_units bigint not null check (min_amount_minor_units >= 0),
  max_amount_minor_units bigint not null check (max_amount_minor_units >= min_amount_minor_units),
  constraint program_bounty_policy_severity_ranges_version_severity_key unique (policy_version_id, severity)
);

create table public.report_bounty_decisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique,
  program_id uuid not null,
  organization_id uuid not null,
  state text not null check (state in ('ineligible', 'calculated', 'finalized')),
  ineligible_reason text,
  policy_version_id uuid,
  severity_at_calculation public.report_severity,
  currency text,
  calculated_min_amount_minor_units bigint,
  calculated_max_amount_minor_units bigint,
  final_amount_minor_units bigint check (final_amount_minor_units is null or final_amount_minor_units >= 0),
  finalized_by uuid references public.users(id) on delete set null,
  finalized_at timestamptz,
  finalization_note text check (finalization_note is null or char_length(finalization_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_bounty_decisions_shape_check check (
    (state = 'ineligible' and ineligible_reason is not null and policy_version_id is null and final_amount_minor_units is null)
    or (state = 'calculated' and policy_version_id is not null and severity_at_calculation is not null and calculated_min_amount_minor_units is not null and calculated_max_amount_minor_units is not null and final_amount_minor_units is null)
    or (state = 'finalized' and policy_version_id is not null and final_amount_minor_units is not null and finalized_by is not null and finalized_at is not null)
  ),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade,
  foreign key (policy_version_id, program_id) references public.program_bounty_policy_versions(id, program_id)
);

create index report_bounty_decisions_program_id_idx on public.report_bounty_decisions(program_id);

alter table public.program_bounty_policy_versions enable row level security;
alter table public.program_bounty_policy_severity_ranges enable row level security;
alter table public.report_bounty_decisions enable row level security;

-- Same three-way read shape program_scope_entries already uses (0006, widened by 0007):
-- org oversight, program managers, and an active researcher may all read the current
-- bounty policy -- researchers see what severity pays what for the program they are
-- authorized to test, the same transparency every bounty program studied publishes.
create policy "bounty policy versions read by org admins, program members, or authorized researchers" on public.program_bounty_policy_versions
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
    or private.is_researcher_authorized_for_program(program_id)
  );

create policy "bounty severity ranges read by org admins, program members, or authorized researchers" on public.program_bounty_policy_severity_ranges
  for select to authenticated
  using (
    exists (
      select 1 from public.program_bounty_policy_versions v
      where v.id = policy_version_id
        and (
          private.has_org_role(v.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_member(v.program_id)
          or private.is_researcher_authorized_for_program(v.program_id)
        )
    )
  );

-- report_bounty_decisions: the submitting researcher reads their own report's full
-- decision (their own report's outcome, the same transparency 0009/0012 already extend
-- to status/severity/resolution); org oversight or a program manager reads every
-- decision for their program. No visibility split beyond that -- there is no
-- internal-only bounty concept in this slice, unlike report_messages/report_evidence's
-- researcher_visible/internal axis.
create policy "report bounty decisions read by researcher, org admins, or program managers" on public.report_bounty_decisions
  for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and r.researcher_id = auth.uid())
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

grant select on public.program_bounty_policy_versions, public.program_bounty_policy_severity_ranges, public.report_bounty_decisions to authenticated;
grant select, insert, update, delete on public.program_bounty_policy_versions, public.program_bounty_policy_severity_ranges, public.report_bounty_decisions to service_role;

-- ---------------------------------------------------------------------------
-- private.lock_and_authorize_report_for_finance: the narrow-authorization sibling of
-- 0009's private.lock_and_authorize_report_for_triage -- identical locking (the same
-- reports row, so concurrent finance operations serialize against concurrent triage
-- operations too), but only has_org_role(owner, security_admin) authorizes -- a
-- program_members manager who is not also an org owner/security_admin is deliberately
-- excluded, since committing an actual financial figure is a materially more sensitive
-- action than triage. 0009's migration is not edited.
-- ---------------------------------------------------------------------------

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

  if not private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot make financial decisions for this report' using errcode = '42501';
  end if;

  return report;
end;
$$;

create or replace function private.effective_bounty_policy_version(target_program_id uuid)
returns public.program_bounty_policy_versions
language plpgsql stable security definer set search_path = ''
as $$
declare
  policy public.program_bounty_policy_versions;
begin
  select * into policy from public.program_bounty_policy_versions
    where program_id = target_program_id and superseded_at is null;
  return policy;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_bounty_policy_version: the same broad two-path program-management check every
-- other program-configuration mutation uses (0004/0006/0009). Never edits an existing
-- version -- supersedes the current one (if any) and inserts a new one, in one
-- transaction.
-- ---------------------------------------------------------------------------

create or replace function public.create_bounty_policy_version(
  target_program_id uuid,
  p_currency text,
  p_none_min bigint, p_none_max bigint,
  p_low_min bigint, p_low_max bigint,
  p_medium_min bigint, p_medium_max bigint,
  p_high_min bigint, p_high_max bigint,
  p_critical_min bigint, p_critical_max bigint
)
returns public.program_bounty_policy_versions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  previous public.program_bounty_policy_versions;
  new_version public.program_bounty_policy_versions;
  next_version_number integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot configure bounty policy for this program' using errcode = '42501';
  end if;

  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'INVALID_BOUNTY_POLICY: Currency must be a 3-letter ISO code, e.g. USD.' using errcode = '22023';
  end if;
  if p_none_min > p_none_max or p_low_min > p_low_max or p_medium_min > p_medium_max or p_high_min > p_high_max or p_critical_min > p_critical_max then
    raise exception 'INVALID_BOUNTY_POLICY: Each severity tier''s minimum must not exceed its maximum.' using errcode = '22023';
  end if;
  if p_none_min < 0 or p_low_min < 0 or p_medium_min < 0 or p_high_min < 0 or p_critical_min < 0 then
    raise exception 'INVALID_BOUNTY_POLICY: Amounts cannot be negative.' using errcode = '22023';
  end if;

  select * into previous from public.program_bounty_policy_versions
    where program_id = target_program_id and superseded_at is null
    for update;

  next_version_number := coalesce(previous.version_number, 0) + 1;

  if previous.id is not null then
    update public.program_bounty_policy_versions set superseded_at = now() where id = previous.id;
  end if;

  insert into public.program_bounty_policy_versions (program_id, organization_id, version_number, currency, created_by)
  values (target_program_id, program.organization_id, next_version_number, p_currency, actor)
  returning * into new_version;

  insert into public.program_bounty_policy_severity_ranges (policy_version_id, severity, min_amount_minor_units, max_amount_minor_units) values
    (new_version.id, 'none', p_none_min, p_none_max),
    (new_version.id, 'low', p_low_min, p_low_max),
    (new_version.id, 'medium', p_medium_min, p_medium_max),
    (new_version.id, 'high', p_high_min, p_high_max),
    (new_version.id, 'critical', p_critical_min, p_critical_max);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'bounty.policy_version_created', 'program', target_program_id,
    jsonb_build_object('policy_version_id', new_version.id, 'version_number', next_version_number, 'currency', p_currency));

  return new_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- calculate_bounty_recommendation: broad triage authorization. A precondition that is
-- fixable and retryable (not yet resolved; severity not yet confirmed; no policy
-- configured) is a plain rejection -- no row is written, because nothing durable is true
-- yet. A permanent classification fact (a terminal status other than resolved) is
-- written as a real, stored ineligible row.
-- ---------------------------------------------------------------------------

create or replace function public.calculate_bounty_recommendation(target_report_id uuid)
returns public.report_bounty_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  policy public.program_bounty_policy_versions;
  matched_range public.program_bounty_policy_severity_ranges;
  existing public.report_bounty_decisions;
  decision public.report_bounty_decisions;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  -- A finalized decision is locked; recalculating must never silently discard it. Only
  -- adjust_bounty may change an already-finalized amount.
  select * into existing from public.report_bounty_decisions where report_id = target_report_id;
  if existing.id is not null and existing.state = 'finalized' then
    raise exception 'BOUNTY_ALREADY_FINALIZED: this report''s bounty has already been finalized' using errcode = '23514';
  end if;

  if exists (select 1 from private.report_status_transitions t where t.from_status = report.status) then
    raise exception 'REPORT_NOT_FINALIZED: this report has not yet reached a final decision' using errcode = '23514';
  end if;

  if report.status <> 'resolved' then
    insert into public.report_bounty_decisions (report_id, program_id, organization_id, state, ineligible_reason)
    values (target_report_id, report.program_id, report.organization_id, 'ineligible', 'This report''s classification is not eligible for a bounty.')
    on conflict (report_id) do update set state = 'ineligible', ineligible_reason = excluded.ineligible_reason,
      policy_version_id = null, severity_at_calculation = null, currency = null,
      calculated_min_amount_minor_units = null, calculated_max_amount_minor_units = null,
      final_amount_minor_units = null, finalized_by = null, finalized_at = null, finalization_note = null,
      updated_at = now()
    returning * into decision;

    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, report.organization_id, 'bounty.calculated', 'report', target_report_id, jsonb_build_object('state', 'ineligible'));

    return decision;
  end if;

  if report.confirmed_severity is null then
    raise exception 'SEVERITY_REQUIRED: confirm this report''s severity before calculating a bounty' using errcode = '23514';
  end if;

  policy := private.effective_bounty_policy_version(report.program_id);
  if policy.id is null then
    raise exception 'NO_BOUNTY_POLICY: this program has not configured a bounty policy' using errcode = '23514';
  end if;

  select * into matched_range from public.program_bounty_policy_severity_ranges
    where policy_version_id = policy.id and severity = report.confirmed_severity;

  insert into public.report_bounty_decisions (
    report_id, program_id, organization_id, state, policy_version_id, severity_at_calculation, currency,
    calculated_min_amount_minor_units, calculated_max_amount_minor_units
  )
  values (
    target_report_id, report.program_id, report.organization_id, 'calculated', policy.id, report.confirmed_severity, policy.currency,
    matched_range.min_amount_minor_units, matched_range.max_amount_minor_units
  )
  on conflict (report_id) do update set
    state = 'calculated', ineligible_reason = null,
    policy_version_id = excluded.policy_version_id, severity_at_calculation = excluded.severity_at_calculation, currency = excluded.currency,
    calculated_min_amount_minor_units = excluded.calculated_min_amount_minor_units, calculated_max_amount_minor_units = excluded.calculated_max_amount_minor_units,
    final_amount_minor_units = null, finalized_by = null, finalized_at = null, finalization_note = null,
    updated_at = now()
  returning * into decision;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.calculated', 'report', target_report_id,
    jsonb_build_object('state', 'calculated', 'policy_version_id', policy.id, 'severity', report.confirmed_severity));

  return decision;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_bounty: narrow authorization (org owner/security_admin only). Requires a
-- calculated recommendation to already exist. Rejects if already finalized --
-- idempotency-as-rejection, the same choice 0009 made for status transitions.
-- ---------------------------------------------------------------------------

create or replace function public.finalize_bounty(target_report_id uuid, p_amount_minor_units bigint, p_note text)
returns public.report_bounty_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  trimmed_note text := nullif(trim(coalesce(p_note, '')), '');
  updated public.report_bounty_decisions;
begin
  report := private.lock_and_authorize_report_for_finance(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id;
  if decision.id is null then
    raise exception 'BOUNTY_NOT_READY: calculate a bounty recommendation before finalizing one' using errcode = '23514';
  end if;
  if decision.state = 'finalized' then
    raise exception 'BOUNTY_ALREADY_FINALIZED: this report''s bounty has already been finalized' using errcode = '23514';
  end if;
  if decision.state = 'ineligible' then
    raise exception 'BOUNTY_NOT_READY: this report is not eligible for a bounty' using errcode = '23514';
  end if;

  if p_amount_minor_units is null or p_amount_minor_units < 0 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Amount cannot be negative.' using errcode = '22023';
  end if;
  if trimmed_note is not null and char_length(trimmed_note) > 2000 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Note must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  update public.report_bounty_decisions set
    state = 'finalized', final_amount_minor_units = p_amount_minor_units, finalized_by = actor, finalized_at = now(),
    finalization_note = trimmed_note, updated_at = now()
    where report_id = target_report_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.finalized', 'report', target_report_id,
    jsonb_build_object('amount_minor_units', p_amount_minor_units, 'currency', decision.currency));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- adjust_bounty: narrow authorization. Requires an already-finalized decision. Always
-- records the previous and new amount plus a reason in the audit event -- never a bare
-- UPDATE with no trace of what changed.
-- ---------------------------------------------------------------------------

create or replace function public.adjust_bounty(target_report_id uuid, p_new_amount_minor_units bigint, p_reason text)
returns public.report_bounty_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  trimmed_reason text := trim(coalesce(p_reason, ''));
  updated public.report_bounty_decisions;
begin
  report := private.lock_and_authorize_report_for_finance(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id;
  if decision.id is null or decision.state <> 'finalized' then
    raise exception 'BOUNTY_NOT_FINALIZED: only an already-finalized bounty can be adjusted' using errcode = '23514';
  end if;

  if p_new_amount_minor_units is null or p_new_amount_minor_units < 0 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Amount cannot be negative.' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Explain why this bounty is being adjusted.' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Reason must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  update public.report_bounty_decisions set
    final_amount_minor_units = p_new_amount_minor_units, finalized_by = actor, finalized_at = now(),
    finalization_note = trimmed_reason, updated_at = now()
    where report_id = target_report_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.adjusted', 'report', target_report_id,
    jsonb_build_object('previous_amount_minor_units', decision.final_amount_minor_units, 'new_amount_minor_units', p_new_amount_minor_units, 'reason', trimmed_reason));

  return updated;
end;
$$;

revoke all on function public.create_bounty_policy_version(uuid, text, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint) from public;
revoke all on function public.calculate_bounty_recommendation(uuid) from public;
revoke all on function public.finalize_bounty(uuid, bigint, text) from public;
revoke all on function public.adjust_bounty(uuid, bigint, text) from public;

grant execute on function public.create_bounty_policy_version(uuid, text, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint) to authenticated;
grant execute on function public.calculate_bounty_recommendation(uuid) to authenticated;
grant execute on function public.finalize_bounty(uuid, bigint, text) to authenticated;
grant execute on function public.adjust_bounty(uuid, bigint, text) to authenticated;
