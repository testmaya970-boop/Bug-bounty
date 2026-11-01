-- ---------------------------------------------------------------------------
-- docs/decisions/0047-report-composer-weakness-impact-severity.md
--
-- Three real additions to the report submission contract, matching the shape a
-- researcher already expects from HackerOne-style composers, without inventing anything
-- Sentinel cannot back with real data or real authority:
--
-- 1. weakness_type: a real, fixed vulnerability-category taxonomy the researcher selects
--    at submission -- pure metadata, never authorization-bearing, purely additive.
-- 2. impact: split out of the single `description` column into its own field --
--    "how do I reproduce it" (description) vs "why does it matter" (impact), both
--    required going forward.
-- 3. researcher_severity: the researcher's OWN suggested severity -- explicitly NOT the
--    same column as confirmed_severity (0009's own, deliberately deferred, organization-
--    only authority). This does not reopen or weaken that decision: confirmed_severity
--    remains the only severity value any authorization, bounty, or reputation logic ever
--    reads. researcher_severity is a second, clearly-labeled, advisory-only column no
--    downstream logic trusts for anything -- the exact "hacker suggests, triager
--    decides" split real bounty platforms use.
--
-- Both new columns are nullable at the schema level (existing reports predate this
-- migration and must not be retroactively invalidated); weakness_type and impact become
-- REQUIRED going forward via validation inside submit_report itself, the same place
-- title/description are already validated -- never enforced only in the UI.
-- ---------------------------------------------------------------------------

create type public.report_weakness_type as enum (
  'cross_site_scripting',
  'sql_injection',
  'ssrf',
  'idor',
  'broken_authentication',
  'broken_access_control',
  'csrf',
  'remote_code_execution',
  'information_disclosure',
  'insecure_deserialization',
  'security_misconfiguration',
  'injection_other',
  'business_logic',
  'denial_of_service',
  'cryptographic_failure',
  'other'
);

alter table public.reports
  add column weakness_type public.report_weakness_type,
  add column impact text check (impact is null or char_length(impact) <= 20000),
  add column researcher_severity public.report_severity;

comment on column public.reports.researcher_severity is
  'Advisory only -- the researcher''s own suggested severity. Never read by authorization, bounty, or reputation logic. confirmed_severity (organization-set, triage-only) remains the sole authoritative value.';

-- ---------------------------------------------------------------------------
-- submit_report redefined (not duplicated) to require weakness_type/impact and accept
-- an optional researcher_severity -- every other line (rate limit, authorization,
-- program-status check, title/description validation, scope matching, the audit_logs
-- row, the report.created outbox event) is copied verbatim from 202608290005's
-- definition, unchanged. A genuinely new signature (three new parameters) is a new
-- function by Postgres's own rules -- the old 5-parameter overload is explicitly dropped
-- so no caller can silently bypass the new required fields by keeping the old shape.
-- ---------------------------------------------------------------------------

drop function if exists public.submit_report(uuid, public.program_asset_type, text, text, text);

create or replace function public.submit_report(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  target_input text,
  p_title text,
  p_description text,
  p_weakness_type public.report_weakness_type,
  p_impact text,
  p_researcher_severity public.report_severity default null
)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  trimmed_title text := trim(p_title);
  trimmed_description text := trim(p_description);
  trimmed_impact text := trim(p_impact);
  canon record;
  match_result record;
  new_report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.check_and_consume_rate_limit('report_submit:' || actor::text, 30, 3600) then
    raise exception 'RATE_LIMITED: too many reports submitted recently, try again later' using errcode = '53400';
  end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not private.is_researcher_authorized_for_program(target_program_id) then
    raise exception 'FORBIDDEN: actor is not an authorized researcher for this program' using errcode = '42501';
  end if;

  if program.status in ('paused', 'closed') then
    raise exception 'SUBMISSIONS_CLOSED: this program is not currently accepting reports' using errcode = '55000';
  end if;

  if trimmed_title is null or char_length(trimmed_title) = 0 then
    raise exception 'INVALID_TITLE: Enter a report title.' using errcode = '22023';
  end if;
  if char_length(trimmed_title) > 200 then
    raise exception 'INVALID_TITLE: Use 200 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_TITLE: Report title contains invalid characters.' using errcode = '22023';
  end if;

  if trimmed_description is null or char_length(trimmed_description) = 0 then
    raise exception 'INVALID_DESCRIPTION: Enter a description.' using errcode = '22023';
  end if;
  if char_length(trimmed_description) > 20000 then
    raise exception 'INVALID_DESCRIPTION: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  if p_weakness_type is null then
    raise exception 'INVALID_WEAKNESS_TYPE: Select the type of weakness you found.' using errcode = '22023';
  end if;

  if trimmed_impact is null or char_length(trimmed_impact) = 0 then
    raise exception 'INVALID_IMPACT: Describe the impact of this finding.' using errcode = '22023';
  end if;
  if char_length(trimmed_impact) > 20000 then
    raise exception 'INVALID_IMPACT: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);
  select * into match_result from private.match_program_scope(target_program_id, p_asset_type, canon.canonical, canon.cidr_value, canon.url_origin, canon.url_path);

  if match_result.matched_entry_id is null or match_result.matched_scope_state <> 'in_scope' then
    raise exception 'TARGET_NOT_ELIGIBLE: This target is not currently eligible for this program.' using errcode = '22023';
  end if;

  insert into public.reports (
    program_id, organization_id, researcher_id, title, description, asset_type, target, display_target,
    matched_scope_entry_id, matched_scope_state, matched_target, weakness_type, impact, researcher_severity
  )
  values (
    target_program_id, program.organization_id, actor, trimmed_title, trimmed_description, p_asset_type, canon.canonical, canon.display,
    match_result.matched_entry_id, match_result.matched_scope_state, match_result.matched_target, p_weakness_type, trimmed_impact, p_researcher_severity
  )
  returning * into new_report;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'report.created', 'report', new_report.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values (
    'report.created', 1, 'report', new_report.id, program.organization_id,
    jsonb_build_object(
      'report_id', new_report.id, 'program_id', target_program_id, 'organization_id', program.organization_id,
      'researcher_id', actor, 'title', trimmed_title, 'asset_type', p_asset_type, 'display_target', canon.display
    )
  );

  return new_report;
end;
$$;

revoke all on function public.submit_report(uuid, public.program_asset_type, text, text, text, public.report_weakness_type, text, public.report_severity) from public;
grant execute on function public.submit_report(uuid, public.program_asset_type, text, text, text, public.report_weakness_type, text, public.report_severity) to authenticated;
