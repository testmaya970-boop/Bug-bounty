-- Report Triage Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0009-report-triage-state-machine.md.
--
-- 1. The state machine is DOMAIN.md's own, implemented verbatim as data
--    (private.report_status_transitions), not invented and not copied from this task's
--    own (looser) example state names.
-- 2. No generic status-update RPC: every transition is its own public function with its
--    target status hardcoded, never accepted as a client-supplied parameter. Each one
--    still independently re-validates against the shared transition table.
-- 3. private.lock_and_authorize_report_for_triage is the one shared authorize-and-lock
--    primitive (SELECT ... FOR UPDATE + the same two-path manager check every other
--    program-management mutation uses) -- every transition-specific rule (required
--    fields, target status) stays in its own named function.
-- 4. No dedicated report-history table. audit_logs already is DOMAIN.md's "event
--    record"; reports.status is "what is true now"; audit_logs filtered to this report
--    is "what happened." resolution_summary/information_request_reason/
--    researcher_response are real DOMAIN.md-relevant current-state fields (not audit
--    trail), so they are real columns, never buried in jsonb.
-- 5. Triage is NOT gated by program lifecycle (unlike submission) -- a paused/closed
--    program may still have reports awaiting a decision.

create type public.report_severity as enum ('none', 'low', 'medium', 'high', 'critical');

alter table public.reports
  add column confirmed_severity public.report_severity,
  add column duplicate_of_report_id uuid references public.reports(id) on delete set null,
  add column information_request_reason text check (information_request_reason is null or char_length(information_request_reason) <= 2000),
  add column researcher_response text check (researcher_response is null or char_length(researcher_response) <= 5000),
  add column resolution_summary text check (resolution_summary is null or char_length(resolution_summary) <= 5000),
  add constraint reports_duplicate_not_self_check check (duplicate_of_report_id is null or duplicate_of_report_id <> id);

-- ---------------------------------------------------------------------------
-- private.report_status_transitions: DOMAIN.md's transition table, implemented as data
-- so there is exactly one place to verify against the domain document, not eight.
-- RLS-enabled with no policies (deny-all) as defense in depth even though `private` is
-- already unreachable via the Data API regardless -- consistent with every other table
-- in this schema always having RLS enabled.
-- ---------------------------------------------------------------------------

create table private.report_status_transitions (
  from_status public.report_status not null,
  to_status public.report_status not null,
  primary key (from_status, to_status)
);

alter table private.report_status_transitions enable row level security;

insert into private.report_status_transitions (from_status, to_status) values
  ('new', 'triaging'),
  ('new', 'needs_information'),
  ('new', 'accepted'),
  ('new', 'duplicate'),
  ('new', 'informative'),
  ('new', 'not_applicable'),
  ('new', 'rejected'),
  ('triaging', 'needs_information'),
  ('triaging', 'accepted'),
  ('triaging', 'duplicate'),
  ('triaging', 'informative'),
  ('triaging', 'not_applicable'),
  ('triaging', 'rejected'),
  ('needs_information', 'triaging'),
  ('needs_information', 'accepted'),
  ('needs_information', 'duplicate'),
  ('needs_information', 'informative'),
  ('needs_information', 'not_applicable'),
  ('needs_information', 'rejected'),
  ('accepted', 'resolved'),
  ('accepted', 'needs_information');

create or replace function private.is_valid_report_transition(p_from_status public.report_status, p_to_status public.report_status)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from private.report_status_transitions t
    where t.from_status = p_from_status and t.to_status = p_to_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.lock_and_authorize_report_for_triage: derives the actor, locks the report row
-- (FOR UPDATE -- this is what makes concurrent transitions deterministic, see 0009),
-- and authorizes via the identical two-path check every other program-management
-- mutation already uses. Every manager-facing transition RPC calls this first.
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
    or private.is_program_member(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot triage this report' using errcode = '42501';
  end if;

  return report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transition RPCs. Each: lock+authorize, validate the transition against the shared
-- table, apply any transition-specific required fields, update, audit -- all one
-- transaction, all committed together or none of it.
-- ---------------------------------------------------------------------------

create or replace function public.start_triage(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'triaging') then
    raise exception 'INVALID_TRANSITION: this report cannot move to triaging from its current state' using errcode = '23514';
  end if;

  update public.reports set status = 'triaging', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.triage_started', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  return updated;
end;
$$;

create or replace function public.request_information(target_report_id uuid, p_reason text)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  trimmed_reason text := trim(p_reason);
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'needs_information') then
    raise exception 'INVALID_TRANSITION: this report cannot move to needs information from its current state' using errcode = '23514';
  end if;

  if trimmed_reason is null or char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_REASON: Explain what information is needed.' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REASON: Use 2000 characters or fewer.' using errcode = '22023';
  end if;

  update public.reports
    set status = 'needs_information', information_request_reason = trimmed_reason, researcher_response = null, updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.information_requested', 'report', target_report_id,
    jsonb_build_object('previous_status', report.status, 'reason', trimmed_reason));

  return updated;
end;
$$;

-- Researcher-only: NOT authorized via private.lock_and_authorize_report_for_triage
-- (that is the manager-authorization primitive) -- this has its own, distinct
-- researcher-identity check, the same shape submit_report already uses.
create or replace function public.respond_to_information_request(target_report_id uuid, p_response text)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  trimmed_response text := trim(p_response);
  updated public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can respond to this report' using errcode = '42501';
  end if;
  if not private.is_researcher_authorized_for_program(report.program_id) then
    raise exception 'FORBIDDEN: your access to this program is not currently active' using errcode = '42501';
  end if;
  if report.status <> 'needs_information' then
    raise exception 'INVALID_TRANSITION: this report is not currently awaiting a response' using errcode = '23514';
  end if;

  if trimmed_response is null or char_length(trimmed_response) = 0 then
    raise exception 'INVALID_RESPONSE: Enter a response.' using errcode = '22023';
  end if;
  if char_length(trimmed_response) > 5000 then
    raise exception 'INVALID_RESPONSE: Use 5000 characters or fewer.' using errcode = '22023';
  end if;

  update public.reports set researcher_response = trimmed_response, updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.researcher_responded', 'report', target_report_id, '{}'::jsonb);

  return updated;
end;
$$;

create or replace function public.accept_report(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'accepted') then
    raise exception 'INVALID_TRANSITION: this report cannot be accepted from its current state' using errcode = '23514';
  end if;

  update public.reports set status = 'accepted', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.accepted', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  return updated;
end;
$$;

-- Same message for "does not exist" and "wrong program" -- see 0009's enumeration-safety
-- reasoning (identical to 0008's TARGET_NOT_ELIGIBLE collapsing).
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

  select * into duplicate_target from public.reports where id = p_duplicate_of_report_id;
  if duplicate_target.id is null or duplicate_target.program_id <> report.program_id then
    raise exception 'INVALID_DUPLICATE_TARGET: That report is not eligible to be marked as the original.' using errcode = '22023';
  end if;

  update public.reports set status = 'duplicate', duplicate_of_report_id = p_duplicate_of_report_id, updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.marked_duplicate', 'report', target_report_id,
    jsonb_build_object('previous_status', report.status, 'duplicate_of_report_id', p_duplicate_of_report_id));

  return updated;
end;
$$;

create or replace function public.mark_informative(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'informative') then
    raise exception 'INVALID_TRANSITION: this report cannot be marked informative from its current state' using errcode = '23514';
  end if;

  update public.reports set status = 'informative', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.marked_informative', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  return updated;
end;
$$;

create or replace function public.mark_not_applicable(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'not_applicable') then
    raise exception 'INVALID_TRANSITION: this report cannot be marked not applicable from its current state' using errcode = '23514';
  end if;

  update public.reports set status = 'not_applicable', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.marked_not_applicable', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  return updated;
end;
$$;

create or replace function public.reject_report(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'rejected') then
    raise exception 'INVALID_TRANSITION: this report cannot be rejected from its current state' using errcode = '23514';
  end if;

  update public.reports set status = 'rejected', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.rejected', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  return updated;
end;
$$;

create or replace function public.resolve_report(target_report_id uuid, p_resolution_summary text)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  trimmed_summary text := trim(p_resolution_summary);
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'resolved') then
    raise exception 'INVALID_TRANSITION: this report cannot be resolved from its current state' using errcode = '23514';
  end if;

  if trimmed_summary is null or char_length(trimmed_summary) = 0 then
    raise exception 'INVALID_RESOLUTION: Describe how this report was resolved.' using errcode = '22023';
  end if;
  if char_length(trimmed_summary) > 5000 then
    raise exception 'INVALID_RESOLUTION: Use 5000 characters or fewer.' using errcode = '22023';
  end if;

  update public.reports set status = 'resolved', resolution_summary = trimmed_summary, updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.resolved', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  return updated;
end;
$$;

-- Not a status transition -- orthogonal to the state machine, any status, same manager
-- authorization. See 0009 for why this is a standalone RPC rather than bundled into
-- accept_report.
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

  update public.reports set confirmed_severity = p_severity, updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.severity_set', 'report', target_report_id,
    jsonb_build_object('previous_severity', report.confirmed_severity, 'new_severity', p_severity));

  return updated;
end;
$$;

revoke all on function public.start_triage(uuid) from public;
revoke all on function public.request_information(uuid, text) from public;
revoke all on function public.respond_to_information_request(uuid, text) from public;
revoke all on function public.accept_report(uuid) from public;
revoke all on function public.mark_duplicate(uuid, uuid) from public;
revoke all on function public.mark_informative(uuid) from public;
revoke all on function public.mark_not_applicable(uuid) from public;
revoke all on function public.reject_report(uuid) from public;
revoke all on function public.resolve_report(uuid, text) from public;
revoke all on function public.set_report_severity(uuid, public.report_severity) from public;

grant execute on function public.start_triage(uuid) to authenticated;
grant execute on function public.request_information(uuid, text) to authenticated;
grant execute on function public.respond_to_information_request(uuid, text) to authenticated;
grant execute on function public.accept_report(uuid) to authenticated;
grant execute on function public.mark_duplicate(uuid, uuid) to authenticated;
grant execute on function public.mark_informative(uuid) to authenticated;
grant execute on function public.mark_not_applicable(uuid) to authenticated;
grant execute on function public.reject_report(uuid) to authenticated;
grant execute on function public.resolve_report(uuid, text) to authenticated;
grant execute on function public.set_report_severity(uuid, public.report_severity) to authenticated;

