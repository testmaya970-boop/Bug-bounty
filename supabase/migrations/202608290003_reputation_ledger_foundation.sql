-- Researcher Reputation Ledger Foundation. Design decisions recorded here and expanded
-- in docs/decisions/0016-reputation-ledger-foundation.md.
--
-- 1. No mutable reputation_score column is created. A pre-existing, unused Phase 1
--    column (public.researcher_profiles.reputation_score) already exists and is
--    read/written by zero application code -- it is explicitly NOT the mechanism this
--    migration builds and is never referenced by anything below.
-- 2. FACT, never INTERPRETATION: reputation_ledger.fact_type records WHAT happened
--    (report_resolved, report_duplicate, ...), never a numeric score/value/points
--    column. No final reputation formula is invented here -- aggregation (counts by
--    fact_type) is the only primitive this slice provides; scoring is a future,
--    separately-reviewable decision.
-- 3. Only FINAL, organization-confirmed outcomes generate facts. Provisional statuses
--    (new/triaging/needs_information/accepted) never do -- 'accepted' has an outgoing
--    transition (to resolved or needs_information) and is therefore not terminal.
--    Report submission alone (report.created) is deliberately excluded: raw activity is
--    not reputation, per DOMAIN.md's own words.
-- 4. Every fact type answers this migration's six evaluation questions (see the ADR):
--    report_resolved, report_duplicate, report_informative, report_not_applicable, and
--    report_rejected are all recorded -- duplicates/informative/not_applicable/rejected
--    are recorded WITHOUT any assigned valence (no "penalty"), exactly because assigning
--    one now would be inventing the forbidden formula. Researcher suspension/revocation
--    is deliberately NOT recorded: it is a single, unilateral admin action with no
--    required justification captured anywhere in the current domain model (unlike a
--    report outcome, which requires actual triage work), making it too weak and too
--    easily biased a signal to treat as reputation provenance yet.
-- 5. A finalized bounty is recorded as `bounty_finalized` -- a fact, never an amount.
--    No currency/amount column exists on this table; the payment domain remains the
--    sole authority for money.
-- 6. APPEND-ONLY is enforced by the database, not merely "no UPDATE RPC exists": a
--    trigger rejects every UPDATE and DELETE on reputation_ledger unconditionally, even
--    from a service-role connection. A correction is a new, compensating row (see
--    `compensates_fact_id`, reserved but never populated in this slice -- no domain
--    mechanism today produces a legitimate correction event; see the ADR).
-- 7. Idempotency is `source_event_id unique` directly on this table -- not the generic
--    `outbox_event_receipts` ledger from 0015. Unlike that slice's reference consumer
--    (whose side effect has no natural uniqueness key of its own), a reputation fact
--    IS itself a uniquely-keyed row, so its own unique constraint is the more direct
--    idempotency boundary; no extra join required.
-- 8. Provenance is re-derived server-side from the authoritative source table (reports,
--    or report_bounty_decisions), never trusted from the event payload -- the same
--    defense-in-depth pattern 0015's reference handler established, applied here to a
--    real, consequential domain fact rather than a proof-of-concept log line. A claimed
--    fact_type that does not match the report's actual current status is rejected as a
--    provenance mismatch, not silently accepted.
-- 9. RLS differs deliberately from outbox_events: outbox_events has zero legitimate
--    human readers (pure worker plumbing), so it has zero policies. reputation_ledger
--    DOES have a legitimate human reader (the researcher themselves, and the org that
--    produced the underlying report) -- so RLS here follows this schema's normal
--    pattern: the owning researcher reads their own rows; org oversight/program
--    managers read only rows belonging to their own organization, never another
--    tenant's history with the same researcher.
-- 10. No client can insert a reputation fact directly: record_reputation_fact/
--     record_bounty_finalized_reputation_fact are granted to service_role only, exactly
--     like claim_outbox_events/complete_outbox_event -- the sole caller is the trusted
--     reputation worker process, reacting only to already-authorized domain events.

create table public.reputation_ledger (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null references public.users(id) on delete restrict,
  organization_id uuid not null,
  program_id uuid not null,
  report_id uuid not null,
  fact_type text not null check (fact_type in ('report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized')),
  confirmed_severity public.report_severity,
  duplicate_of_report_id uuid references public.reports(id) on delete set null,
  compensates_fact_id uuid references public.reputation_ledger(id) on delete restrict,
  source_event_id uuid not null unique references public.outbox_events(id) on delete restrict,
  event_type text not null,
  schema_version integer not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint reputation_ledger_duplicate_shape_check check ((fact_type = 'report_duplicate') = (duplicate_of_report_id is not null)),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade,
  foreign key (report_id, researcher_id) references public.reports(id, researcher_id)
);

-- researcher_id: every researcher-scoped read and the future summary aggregation both
-- filter on it. organization_id: the org-scoped RLS policy below filters on it.
-- fact_type is not indexed on its own -- this table's expected volume (one row per
-- terminal report outcome or finalized bounty) does not yet justify it; add one if a
-- future aggregation query pattern proves it necessary (see docs/architecture.md's own
-- "add indexes only where actual query patterns justify them" precedent).
create index reputation_ledger_researcher_id_idx on public.reputation_ledger(researcher_id);
create index reputation_ledger_organization_id_idx on public.reputation_ledger(organization_id);

alter table public.reputation_ledger enable row level security;

create policy "reputation ledger read by the owning researcher or their own organization" on public.reputation_ledger
  for select to authenticated
  using (
    researcher_id = auth.uid()
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

-- No update/delete grant to any role -- append-only is a grant-level fact, not merely
-- an RLS omission. service_role gets select+insert only (the trigger below is the
-- second, unconditional line of defense even if a future grant were ever widened).
grant select on public.reputation_ledger to authenticated;
grant select, insert on public.reputation_ledger to service_role;

-- ---------------------------------------------------------------------------
-- Append-only enforcement: a real trigger, not merely "no RPC exists for it". Rejects
-- every UPDATE and DELETE unconditionally, regardless of caller -- even a service-role
-- connection, even a future careless migration.
-- ---------------------------------------------------------------------------

create or replace function private.reject_reputation_ledger_mutation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'REPUTATION_LEDGER_APPEND_ONLY: reputation_ledger rows can never be updated or deleted -- record a compensating row instead' using errcode = '0A000';
end;
$$;

create trigger reputation_ledger_no_update before update on public.reputation_ledger
  for each row execute function private.reject_reputation_ledger_mutation();
create trigger reputation_ledger_no_delete before delete on public.reputation_ledger
  for each row execute function private.reject_reputation_ledger_mutation();

-- ---------------------------------------------------------------------------
-- record_reputation_fact: the sole insertion path for the five report-outcome fact
-- types. Re-derives every provenance field (researcher_id/organization_id/program_id/
-- confirmed_severity/duplicate_of_report_id) from the authoritative `reports` row
-- itself -- the event payload is trusted only for "which report, which fact type,
-- which source event, when." Idempotent: a source_event_id already recorded returns
-- the existing row rather than raising or inserting a second one. Granted to
-- service_role only -- never callable by authenticated/anon.
-- ---------------------------------------------------------------------------

create or replace function public.record_reputation_fact(p_source_event_id uuid, p_fact_type text, p_report_id uuid, p_occurred_at timestamptz)
returns public.reputation_ledger
language plpgsql set search_path = ''
as $$
declare
  report public.reports;
  existing public.reputation_ledger;
  inserted public.reputation_ledger;
  expected_status public.report_status;
begin
  select * into existing from public.reputation_ledger where source_event_id = p_source_event_id;
  if existing.id is not null then
    return existing;
  end if;

  if p_fact_type not in ('report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected') then
    raise exception 'INVALID_FACT_TYPE: % is not a report-outcome fact type', p_fact_type using errcode = '22023';
  end if;

  select * into report from public.reports where id = p_report_id;
  if report.id is null then
    raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002';
  end if;

  expected_status := case p_fact_type
    when 'report_resolved' then 'resolved'::public.report_status
    when 'report_duplicate' then 'duplicate'::public.report_status
    when 'report_informative' then 'informative'::public.report_status
    when 'report_not_applicable' then 'not_applicable'::public.report_status
    when 'report_rejected' then 'rejected'::public.report_status
  end;

  if report.status <> expected_status then
    raise exception 'PROVENANCE_MISMATCH: report''s current status does not match the claimed fact type' using errcode = '23514';
  end if;

  begin
    insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, confirmed_severity, duplicate_of_report_id, source_event_id, event_type, schema_version, occurred_at)
    values (
      report.researcher_id, report.organization_id, report.program_id, report.id, p_fact_type, report.confirmed_severity,
      case when p_fact_type = 'report_duplicate' then report.duplicate_of_report_id else null end,
      p_source_event_id, 'report.' || replace(p_fact_type, 'report_', ''), 1, p_occurred_at
    )
    returning * into inserted;
  exception
    when unique_violation then
      -- A genuinely concurrent call raced us between the existence check above and
      -- this insert. The unique constraint on source_event_id is what actually
      -- prevents a duplicate fact; treat losing the race the same as finding the
      -- row up front, not as an error the caller needs to handle.
      select * into inserted from public.reputation_ledger where source_event_id = p_source_event_id;
  end;

  return inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_bounty_finalized_reputation_fact: the sole insertion path for the
-- bounty_finalized fact type. Re-derives provenance from report_bounty_decisions,
-- never from the event payload, and never records an amount or currency -- the
-- reputation layer references the bounty outcome, never becomes a second payment
-- ledger. Idempotent and service_role-only, identically to record_reputation_fact.
-- ---------------------------------------------------------------------------

create or replace function public.record_bounty_finalized_reputation_fact(p_source_event_id uuid, p_report_id uuid, p_occurred_at timestamptz)
returns public.reputation_ledger
language plpgsql set search_path = ''
as $$
declare
  report public.reports;
  decision public.report_bounty_decisions;
  existing public.reputation_ledger;
  inserted public.reputation_ledger;
begin
  select * into existing from public.reputation_ledger where source_event_id = p_source_event_id;
  if existing.id is not null then
    return existing;
  end if;

  select * into report from public.reports where id = p_report_id;
  if report.id is null then
    raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002';
  end if;

  select * into decision from public.report_bounty_decisions where report_id = p_report_id;
  if decision.id is null or decision.state <> 'finalized' then
    raise exception 'PROVENANCE_MISMATCH: this report has no finalized bounty decision' using errcode = '23514';
  end if;

  begin
    insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, confirmed_severity, duplicate_of_report_id, source_event_id, event_type, schema_version, occurred_at)
    values (report.researcher_id, report.organization_id, report.program_id, report.id, 'bounty_finalized', report.confirmed_severity, null, p_source_event_id, 'bounty.finalized', 1, p_occurred_at)
    returning * into inserted;
  exception
    when unique_violation then
      -- Same concurrent-race handling as record_reputation_fact: the unique
      -- constraint on source_event_id is the real safeguard, so losing the race
      -- returns the winner's row instead of surfacing a raw error.
      select * into inserted from public.reputation_ledger where source_event_id = p_source_event_id;
  end;

  return inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_reputation_summary: the one safe, derived read exposed to a researcher --
-- counts by fact_type for their own history, never the raw ledger rows, never another
-- researcher's data (auth.uid() only, no parameter -- structurally self-only). No
-- score, no formula: a plain count per objective category.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_reputation_summary()
returns table (fact_type text, fact_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
  select r.fact_type, count(*) as fact_count
  from public.reputation_ledger r
  where r.researcher_id = actor
  group by r.fact_type;
end;
$$;

revoke all on function public.record_reputation_fact(uuid, text, uuid, timestamptz) from public, authenticated, anon;
revoke all on function public.record_bounty_finalized_reputation_fact(uuid, uuid, timestamptz) from public, authenticated, anon;
revoke all on function public.get_my_reputation_summary() from public;

grant execute on function public.record_reputation_fact(uuid, text, uuid, timestamptz) to service_role;
grant execute on function public.record_bounty_finalized_reputation_fact(uuid, uuid, timestamptz) to service_role;
grant execute on function public.get_my_reputation_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- The five report-outcome RPCs, redefined (not duplicated): each adds exactly one more
-- outbox insert, after its existing audit_logs insert, in the same transaction --
-- identical in spirit to 0015's instrumentation of submit_report. Every other line is
-- unchanged from 202608280001/202608270002. No behavior, authorization, or validation
-- rule changes -- purely additive event emission.
-- ---------------------------------------------------------------------------

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

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.resolved', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$$;

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

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.duplicate', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

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

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.informative', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

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

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.not_applicable', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

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

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.rejected', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_bounty, redefined: identical to 202608280002 except for one added outbox
-- insert, emitting no amount/currency -- only the fact that a bounty was finalized.
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

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('bounty.finalized', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$$;
