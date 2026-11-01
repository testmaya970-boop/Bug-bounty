-- Operational priority (P0-P4), kept separate from severity.
--
-- * confirmed_severity / CVSS say how bad the vulnerability is. priority says how the program
--   treats it and which payout tier it earns. They usually agree, which is why priority
--   DEFAULTS from confirmed severity (critical -> P0 ... none/"Info" -> P4), but a triager may
--   set it explicitly (business context, chained impact, an internal SLA class).
-- * Payout ranges are per priority tier. Storage is unchanged: a policy's ranges stay keyed by
--   the tier enum (critical, high, medium, low, none), which now reads as P0..P4. Because a
--   report with no explicit priority maps to exactly the row its severity used before, no
--   existing recommendation, policy or finalized bounty changes.
-- * report_bounty_decisions.severity_at_calculation keeps holding the tier key that picked the
--   range (the asset-tier trigger re-reads the range by it); priority_at_calculation records
--   the priority itself for display.
-- * A finalized bounty locks priority exactly as it already locks severity and CVSS.

create type public.report_priority as enum ('p0', 'p1', 'p2', 'p3', 'p4');

alter table public.reports add column if not exists priority public.report_priority;
comment on column public.reports.priority is 'Explicit operational priority set by a triager. NULL means "derived from confirmed_severity" (private.effective_report_priority). Never a CVSS rating.';

alter table public.report_bounty_decisions add column if not exists priority_at_calculation public.report_priority;

create or replace function private.priority_for_severity(p_severity public.report_severity)
returns public.report_priority
language sql immutable set search_path = ''
as $$
  select case p_severity when 'critical' then 'p0' when 'high' then 'p1' when 'medium' then 'p2' when 'low' then 'p3' when 'none' then 'p4' end::public.report_priority;
$$;

create or replace function private.payout_tier_for_priority(p_priority public.report_priority)
returns public.report_severity
language sql immutable set search_path = ''
as $$
  select case p_priority when 'p0' then 'critical' when 'p1' then 'high' when 'p2' then 'medium' when 'p3' then 'low' when 'p4' then 'none' end::public.report_severity;
$$;

create or replace function private.effective_report_priority(r public.reports)
returns public.report_priority
language sql stable set search_path = ''
as $$
  select coalesce(r.priority, private.priority_for_severity(r.confirmed_severity));
$$;

-- Set (or clear, with NULL, back to the severity default) a report's priority. Triagers only.
create or replace function public.set_report_priority(target_report_id uuid, p_priority public.report_priority)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);
  if report.priority is not distinct from p_priority then return report; end if;
  update public.reports set priority = p_priority, updated_at = now() where id = target_report_id returning * into report;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.priority_set', 'report', target_report_id,
    jsonb_build_object('priority', p_priority, 'effective_priority', private.effective_report_priority(report)));
  return report;
end;
$$;
revoke all on function public.set_report_priority(uuid, public.report_priority) from public;
grant execute on function public.set_report_priority(uuid, public.report_priority) to authenticated;

-- The finalized-bounty lock now covers priority too.
create or replace function private.reports_lock_severity_after_bounty()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.confirmed_severity, new.priority, new.cvss_attack_vector, new.cvss_attack_complexity, new.cvss_privileges_required, new.cvss_user_interaction,
      new.cvss_scope, new.cvss_confidentiality_impact, new.cvss_integrity_impact, new.cvss_availability_impact, new.cvss4_vector)
     is distinct from
     (old.confirmed_severity, old.priority, old.cvss_attack_vector, old.cvss_attack_complexity, old.cvss_privileges_required, old.cvss_user_interaction,
      old.cvss_scope, old.cvss_confidentiality_impact, old.cvss_integrity_impact, old.cvss_availability_impact, old.cvss4_vector)
     and exists (select 1 from public.report_bounty_decisions d where d.report_id = new.id and d.state = 'finalized') then
    raise exception 'SEVERITY_LOCKED: the bounty for this report is finalized, so its severity and priority can no longer be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists reports_lock_severity_after_bounty on public.reports;
create trigger reports_lock_severity_after_bounty before update of confirmed_severity, priority, cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required,
  cvss_user_interaction, cvss_scope, cvss_confidentiality_impact, cvss_integrity_impact, cvss_availability_impact, cvss4_vector on public.reports
  for each row execute function private.reports_lock_severity_after_bounty();

-- The recommendation now reads the effective priority's tier. Everything else is unchanged
-- from 202608280002 (finalized lock, final-decision requirement, ineligible path, audit row).
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
  v_priority public.report_priority;
  v_tier public.report_severity;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

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
      policy_version_id = null, severity_at_calculation = null, priority_at_calculation = null, currency = null,
      calculated_min_amount_minor_units = null, calculated_max_amount_minor_units = null,
      final_amount_minor_units = null, finalized_by = null, finalized_at = null, finalization_note = null,
      updated_at = now()
    returning * into decision;

    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, report.organization_id, 'bounty.calculated', 'report', target_report_id, jsonb_build_object('state', 'ineligible'));

    return decision;
  end if;

  v_priority := private.effective_report_priority(report);
  if v_priority is null then
    raise exception 'PRIORITY_REQUIRED: confirm this report''s severity or set its priority before calculating a bounty' using errcode = '23514';
  end if;
  v_tier := private.payout_tier_for_priority(v_priority);

  policy := private.effective_bounty_policy_version(report.program_id);
  if policy.id is null then
    raise exception 'NO_BOUNTY_POLICY: this program has not configured a bounty policy' using errcode = '23514';
  end if;

  select * into matched_range from public.program_bounty_policy_severity_ranges
    where policy_version_id = policy.id and severity = v_tier;

  insert into public.report_bounty_decisions (
    report_id, program_id, organization_id, state, policy_version_id, severity_at_calculation, priority_at_calculation, currency,
    calculated_min_amount_minor_units, calculated_max_amount_minor_units
  )
  values (
    target_report_id, report.program_id, report.organization_id, 'calculated', policy.id, v_tier, v_priority, policy.currency,
    matched_range.min_amount_minor_units, matched_range.max_amount_minor_units
  )
  on conflict (report_id) do update set
    state = 'calculated', ineligible_reason = null,
    policy_version_id = excluded.policy_version_id, severity_at_calculation = excluded.severity_at_calculation,
    priority_at_calculation = excluded.priority_at_calculation, currency = excluded.currency,
    calculated_min_amount_minor_units = excluded.calculated_min_amount_minor_units, calculated_max_amount_minor_units = excluded.calculated_max_amount_minor_units,
    final_amount_minor_units = null, finalized_by = null, finalized_at = null, finalization_note = null,
    updated_at = now()
  returning * into decision;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.calculated', 'report', target_report_id,
    jsonb_build_object('state', 'calculated', 'policy_version_id', policy.id, 'priority', v_priority, 'payout_tier', v_tier,
      'severity', report.confirmed_severity, 'priority_explicit', report.priority is not null));

  return decision;
end;
$$;
