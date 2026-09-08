-- Report Resolution & Classification Foundation. Design decisions recorded here and
-- expanded in docs/decisions/0012-report-resolution-and-classification.md.
--
-- 1. No new "classification" column: DOMAIN.md's own words -- "Alternative terminal
--    outcomes are DUPLICATE, INFORMATIVE, NOT_APPLICABLE, and REJECTED" -- already make
--    the terminal report_status value the classification. No new "resolution_reason"/
--    "resolution_type" column either -- resolution_summary (0009) already answers what
--    DOMAIN.md names.
-- 2. set_report_severity is redefined (not duplicated) to add exactly one new rule:
--    reject with SEVERITY_LOCKED once the report has reached a terminal state (checked
--    generically against private.report_status_transitions, never a hardcoded status
--    list) -- so a future bounty engine can trust confirmed_severity never changes after
--    a report is finalized, without this schema needing to change again.
-- 3. mark_duplicate is redefined (not duplicated) to also lock the target report row
--    (in addition to the source row 0009's lock_and_authorize_report_for_triage already
--    locks) and reject a reciprocal duplicate relationship (A dup-of B while B is
--    dup-of A). A genuine, simultaneous, reciprocal race can deadlock at the database
--    level; that is caught and re-mapped to a safe domain error, never leaked raw.
-- 4. No reopen_report operation: DOMAIN.md states "Terminal outcomes have no arbitrary
--    exit transition" directly -- this is not domain silence to fill in.
-- 5. Authorization is unchanged from 0009 for both redefined functions -- no new role
--    concept, no new capability.

-- ---------------------------------------------------------------------------
-- set_report_severity, redefined: identical to 0009 except for the new finality check.
-- ---------------------------------------------------------------------------

create or replace function public.set_report_severity(target_report_id uuid, p_severity public.report_severity)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not exists (select 1 from private.report_status_transitions t where t.from_status = report.status) then
    raise exception 'SEVERITY_LOCKED: this report has reached a final decision and its severity can no longer be changed' using errcode = '23514';
  end if;

  update public.reports set confirmed_severity = p_severity, updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.severity_set', 'report', target_report_id,
    jsonb_build_object('previous_severity', report.confirmed_severity, 'new_severity', p_severity));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_duplicate, redefined: identical to 0009 except for the added target-row lock and
-- the reciprocal-duplicate rejection. Locking order (source via
-- lock_and_authorize_report_for_triage, then target) is the same in every call, which is
-- exactly what makes a genuinely simultaneous reciprocal pair (mark_duplicate(A, B) and
-- mark_duplicate(B, A) at the same instant) a real, detectable Postgres deadlock rather
-- than a silent lost update -- caught below and re-mapped to a safe message.
-- ---------------------------------------------------------------------------

create or replace function public.mark_duplicate(target_report_id uuid, p_duplicate_of_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  duplicate_target public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'duplicate') then
    raise exception 'INVALID_TRANSITION: this report cannot be marked as a duplicate from its current state' using errcode = '23514';
  end if;

  if p_duplicate_of_report_id = target_report_id then
    raise exception 'INVALID_DUPLICATE_TARGET: A report cannot be a duplicate of itself.' using errcode = '22023';
  end if;

  begin
    select * into duplicate_target from public.reports where id = p_duplicate_of_report_id for update;
  exception
    when deadlock_detected then
      raise exception 'INVALID_DUPLICATE_TARGET: This report was being modified at the same time. Try again.' using errcode = '22023';
  end;

  if duplicate_target.id is null or duplicate_target.program_id <> report.program_id then
    raise exception 'INVALID_DUPLICATE_TARGET: That report is not eligible to be marked as the original.' using errcode = '22023';
  end if;

  if duplicate_target.duplicate_of_report_id = target_report_id then
    raise exception 'INVALID_DUPLICATE_TARGET: These two reports cannot be marked as duplicates of each other.' using errcode = '22023';
  end if;

  update public.reports set status = 'duplicate', duplicate_of_report_id = p_duplicate_of_report_id, updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.marked_duplicate', 'report', target_report_id,
    jsonb_build_object('previous_status', report.status, 'duplicate_of_report_id', p_duplicate_of_report_id));

  return updated;
end;
$$;
