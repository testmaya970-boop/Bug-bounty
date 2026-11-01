-- CVSS v3.1 base scoring: confirmed_severity (0009) stays the sole value any
-- authorization, bounty, or reputation logic reads -- this slice does not reopen or
-- weaken that. What it adds is a real, standardized, computed justification a triager can
-- attach when they set that severity: the six CVSS v3.1 base metrics, stored as their own
-- columns (never a single opaque vector string only), plus a real base score computed
-- from FIRST.org's own published v3.1 formula -- server-side, from the six metrics, never
-- accepted as a client-supplied number. See docs/decisions/0061-cvss-severity-scoring.md.
--
-- Design decisions:
-- 1. Six base-metric enums (attack vector/complexity, privileges required, user
--    interaction, scope, and the three impact metrics), all nullable -- CVSS is optional
--    metadata a triager may attach, never a replacement for confirmed_severity itself.
--    Every existing report has null CVSS columns and is completely unaffected.
-- 2. cvss_base_score is a real, server-computed value (numeric, 0.0-10.0), never
--    triager-entered -- set_report_severity computes it from the six metrics via
--    private.calculate_cvss_base_score and stores it in the same UPDATE, matching the
--    same "server computes, client never supplies" boundary calculate_bounty_recommendation
--    already draws around confirmed_severity itself. A plain stored column, not a
--    Postgres GENERATED column, since a generated column's expression cannot call a
--    plpgsql function.
-- 3. set_report_severity is redefined (not duplicated) to accept the six metrics as
--    optional parameters -- passing none of them behaves identically to before this
--    migration (every existing caller, unchanged). Passing all six computes and stores
--    the real score alongside the chosen severity in the same update.
-- 4. No new authorization concept -- CVSS metrics are set by the same actor
--    (private.lock_and_authorize_report_for_triage) who already sets confirmed_severity.

create type public.cvss_attack_vector as enum ('network', 'adjacent', 'local', 'physical');
create type public.cvss_attack_complexity as enum ('low', 'high');
create type public.cvss_privileges_required as enum ('none', 'low', 'high');
create type public.cvss_user_interaction as enum ('none', 'required');
create type public.cvss_scope as enum ('unchanged', 'changed');
create type public.cvss_impact as enum ('none', 'low', 'high');

alter table public.reports
  add column cvss_attack_vector public.cvss_attack_vector,
  add column cvss_attack_complexity public.cvss_attack_complexity,
  add column cvss_privileges_required public.cvss_privileges_required,
  add column cvss_user_interaction public.cvss_user_interaction,
  add column cvss_scope public.cvss_scope,
  add column cvss_confidentiality_impact public.cvss_impact,
  add column cvss_integrity_impact public.cvss_impact,
  add column cvss_availability_impact public.cvss_impact,
  add column cvss_base_score numeric,
  add constraint reports_cvss_all_or_none_check check (
    (cvss_attack_vector is null and cvss_attack_complexity is null and cvss_privileges_required is null and cvss_user_interaction is null
      and cvss_scope is null and cvss_confidentiality_impact is null and cvss_integrity_impact is null and cvss_availability_impact is null)
    or (cvss_attack_vector is not null and cvss_attack_complexity is not null and cvss_privileges_required is not null and cvss_user_interaction is not null
      and cvss_scope is not null and cvss_confidentiality_impact is not null and cvss_integrity_impact is not null and cvss_availability_impact is not null)
  );

comment on column public.reports.cvss_attack_vector is 'Optional CVSS v3.1 base metric, all-or-nothing with the other seven -- see docs/decisions/0061. Never authoritative on its own; confirmed_severity remains the sole value bounty/reputation logic reads.';

-- ---------------------------------------------------------------------------
-- private.calculate_cvss_base_score: FIRST.org's own published CVSS v3.1 base-score
-- formula, implemented directly from the six base metrics -- no external library, no
-- client-supplied score. Returns null when any metric is null (matches the all-or-none
-- constraint above -- this function is never called with a partial metric set in
-- practice, but stays honest about that case rather than assuming). Privileges-required
-- values of 'low'/'high' resolve differently depending on cvss_scope, exactly as the
-- v3.1 spec defines -- Changed scope raises the effective privileges-required weight.
-- ---------------------------------------------------------------------------

create or replace function private.calculate_cvss_base_score(
  p_attack_vector public.cvss_attack_vector,
  p_attack_complexity public.cvss_attack_complexity,
  p_privileges_required public.cvss_privileges_required,
  p_user_interaction public.cvss_user_interaction,
  p_scope public.cvss_scope,
  p_confidentiality_impact public.cvss_impact,
  p_integrity_impact public.cvss_impact,
  p_availability_impact public.cvss_impact
)
returns numeric
language plpgsql immutable set search_path = ''
as $$
declare
  av numeric; ac numeric; pr numeric; ui numeric;
  isc_base numeric; iss numeric;
  impact numeric; exploitability numeric;
  base_score numeric;
  changed boolean := p_scope = 'changed';
begin
  if p_attack_vector is null or p_attack_complexity is null or p_privileges_required is null or p_user_interaction is null
    or p_scope is null or p_confidentiality_impact is null or p_integrity_impact is null or p_availability_impact is null then
    return null;
  end if;

  av := case p_attack_vector when 'network' then 0.85 when 'adjacent' then 0.62 when 'local' then 0.55 when 'physical' then 0.2 end;
  ac := case p_attack_complexity when 'low' then 0.77 when 'high' then 0.44 end;
  ui := case p_user_interaction when 'none' then 0.85 when 'required' then 0.62 end;
  pr := case p_privileges_required
    when 'none' then 0.85
    when 'low' then (case when changed then 0.68 else 0.62 end)
    when 'high' then (case when changed then 0.5 else 0.27 end)
  end;

  isc_base := 1 - (
    (1 - case p_confidentiality_impact when 'high' then 0.56 when 'low' then 0.22 when 'none' then 0 end)
    * (1 - case p_integrity_impact when 'high' then 0.56 when 'low' then 0.22 when 'none' then 0 end)
    * (1 - case p_availability_impact when 'high' then 0.56 when 'low' then 0.22 when 'none' then 0 end)
  );

  if changed then
    iss := 7.52 * (isc_base - 0.029) - 3.25 * power(isc_base - 0.02, 15);
  else
    iss := 6.42 * isc_base;
  end if;

  if isc_base <= 0 then
    impact := 0;
  else
    impact := iss;
  end if;

  exploitability := 8.22 * av * ac * pr * ui;

  if impact <= 0 then
    base_score := 0;
  elsif changed then
    base_score := least(1.08 * (impact + exploitability), 10);
  else
    base_score := least(impact + exploitability, 10);
  end if;

  -- Round up to one decimal place, matching CVSS v3.1's own defined rounding.
  return ceil(base_score * 10) / 10;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_report_severity, redefined (not duplicated): identical authorization/finality
-- check as 202608280001; the eight new parameters default to null, so every existing
-- caller (no CVSS metrics) behaves exactly as before. Passing all eight computes and
-- stores the real base score in the same update as confirmed_severity.
--
-- A changed parameter list is a distinct overload to Postgres, not a redefinition of the
-- same function -- the old 2-parameter signature must be dropped explicitly, or both
-- versions coexist and PostgREST's RPC dispatch cannot disambiguate which one a plain
-- `{target_report_id, p_severity}` call should resolve to (found live: this is exactly
-- what broke severity-setting after this migration first shipped without the drop below).
-- ---------------------------------------------------------------------------

drop function if exists public.set_report_severity(uuid, public.report_severity);

create or replace function public.set_report_severity(
  target_report_id uuid,
  p_severity public.report_severity,
  p_cvss_attack_vector public.cvss_attack_vector default null,
  p_cvss_attack_complexity public.cvss_attack_complexity default null,
  p_cvss_privileges_required public.cvss_privileges_required default null,
  p_cvss_user_interaction public.cvss_user_interaction default null,
  p_cvss_scope public.cvss_scope default null,
  p_cvss_confidentiality_impact public.cvss_impact default null,
  p_cvss_integrity_impact public.cvss_impact default null,
  p_cvss_availability_impact public.cvss_impact default null
)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
  score numeric;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not exists (select 1 from private.report_status_transitions t where t.from_status = report.status) then
    raise exception 'SEVERITY_LOCKED: this report has reached a final decision and its severity can no longer be changed' using errcode = '23514';
  end if;

  score := private.calculate_cvss_base_score(
    p_cvss_attack_vector, p_cvss_attack_complexity, p_cvss_privileges_required, p_cvss_user_interaction,
    p_cvss_scope, p_cvss_confidentiality_impact, p_cvss_integrity_impact, p_cvss_availability_impact
  );

  update public.reports set
    confirmed_severity = p_severity,
    cvss_attack_vector = p_cvss_attack_vector,
    cvss_attack_complexity = p_cvss_attack_complexity,
    cvss_privileges_required = p_cvss_privileges_required,
    cvss_user_interaction = p_cvss_user_interaction,
    cvss_scope = p_cvss_scope,
    cvss_confidentiality_impact = p_cvss_confidentiality_impact,
    cvss_integrity_impact = p_cvss_integrity_impact,
    cvss_availability_impact = p_cvss_availability_impact,
    cvss_base_score = score,
    updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.severity_set', 'report', target_report_id,
    jsonb_build_object('previous_severity', report.confirmed_severity, 'new_severity', p_severity, 'cvss_base_score', score));

  return updated;
end;
$$;
