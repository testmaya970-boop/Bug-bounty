-- Retest escalation to a real platform admin. Mirrors mediation escalation exactly
-- (202609050009): a researcher who requested a retest can escalate it past the org if it
-- goes unanswered or the org's own decision seems wrong, without waiting on a platform-
-- admin foundation to exist first (it already does, per 202608310001).
--
-- 'escalated' is inserted between 'requested' and the two decided outcomes -- the
-- terminal decision after escalation is still confirmed_fixed/still_vulnerable, just
-- decided by a platform admin instead of the organization. No change to how a researcher
-- requests a NEW retest after any outcome (including a platform-decided one) -- that
-- behavior is unchanged from 202609050005.

alter type public.report_retest_status add value if not exists 'escalated';

alter table public.report_retests
  add column escalated_by uuid references public.users(id) on delete set null,
  add column escalated_at timestamptz;

-- ---------------------------------------------------------------------------
-- escalate_report_retest: only the researcher who requested it, and only while still
-- 'requested' -- an already-escalated or already-decided retest has nothing left to
-- escalate (mirrors escalate_report_mediation's identical two-condition rejection).
-- ---------------------------------------------------------------------------

create or replace function public.escalate_report_retest(target_retest_id uuid)
returns public.report_retests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  retest public.report_retests;
  updated public.report_retests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into retest from public.report_retests where id = target_retest_id for update;
  if retest.id is null then raise exception 'RETEST_NOT_FOUND: retest request not found' using errcode = 'P0002'; end if;

  if retest.requested_by <> actor then
    raise exception 'FORBIDDEN: only the researcher who requested this retest can escalate it' using errcode = '42501';
  end if;

  if retest.status = 'escalated' then
    raise exception 'RETEST_ALREADY_ESCALATED: this retest has already been escalated' using errcode = '23514';
  end if;
  if retest.status <> 'requested' then
    raise exception 'RETEST_NOT_REQUESTED: only a pending retest request can be escalated' using errcode = '23514';
  end if;

  update public.report_retests set
    status = 'escalated',
    escalated_by = actor,
    escalated_at = now()
    where id = target_retest_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, retest.organization_id, 'report.retest_escalated', 'report', retest.report_id, jsonb_build_object('retest_id', retest.id));

  return updated;
end;
$$;

revoke all on function public.escalate_report_retest(uuid) from public;
grant execute on function public.escalate_report_retest(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_escalated_retests_for_admin: platform-admin-only read, identical shape to
-- list_escalated_mediations_for_admin -- real report title exposed here too, for the
-- identical reason (adjudicating whether a fix actually holds requires reading what the
-- report claims and what the researcher says they found on re-test).
-- ---------------------------------------------------------------------------

create or replace function public.list_escalated_retests_for_admin()
returns table (
  id uuid,
  report_id uuid,
  organization_id uuid,
  organization_name text,
  program_id uuid,
  program_name text,
  report_title text,
  requested_by uuid,
  requested_by_name text,
  requester_notes text,
  escalated_at timestamptz,
  requested_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select rt.id, rt.report_id, rt.organization_id, o.name, rt.program_id, p.name, r.title, rt.requested_by, u.display_name, rt.requester_notes, rt.escalated_at, rt.requested_at
  from public.report_retests rt
  join public.organizations o on o.id = rt.organization_id
  join public.programs p on p.id = rt.program_id
  join public.reports r on r.id = rt.report_id
  join public.users u on u.id = rt.requested_by
  where rt.status = 'escalated'
  order by rt.escalated_at asc nulls last, rt.requested_at asc;
end;
$$;

revoke all on function public.list_escalated_retests_for_admin() from public;
grant execute on function public.list_escalated_retests_for_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_escalated_report_retest: platform-admin-only, only legal from 'escalated',
-- p_outcome restricted to the same two real retest outcomes -- a platform admin is
-- adjudicating whether the fix holds, not inventing a fourth state.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_escalated_report_retest(target_retest_id uuid, p_outcome public.report_retest_status, p_decision_notes text)
returns public.report_retests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  retest public.report_retests;
  trimmed_notes text := trim(coalesce(p_decision_notes, ''));
  updated public.report_retests;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  select * into retest from public.report_retests where id = target_retest_id for update;
  if retest.id is null then raise exception 'RETEST_NOT_FOUND: retest request not found' using errcode = 'P0002'; end if;

  if retest.status <> 'escalated' then
    raise exception 'RETEST_NOT_ESCALATED: only an escalated retest can be resolved this way' using errcode = '23514';
  end if;

  if p_outcome not in ('confirmed_fixed', 'still_vulnerable') then
    raise exception 'INVALID_RETEST_OUTCOME: outcome must be confirmed_fixed or still_vulnerable' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) = 0 then
    raise exception 'INVALID_RETEST_OUTCOME: explain the decision' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) > 2000 then
    raise exception 'INVALID_RETEST_OUTCOME: decision notes must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.report_retests set
    status = p_outcome,
    decided_by = actor,
    decided_at = now(),
    decision_notes = trimmed_notes
    where id = target_retest_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, retest.organization_id, 'platform.retest_resolved', 'report', retest.report_id, jsonb_build_object('retest_id', retest.id, 'outcome', p_outcome));

  return updated;
end;
$$;

revoke all on function public.resolve_escalated_report_retest(uuid, public.report_retest_status, text) from public;
grant execute on function public.resolve_escalated_report_retest(uuid, public.report_retest_status, text) to authenticated;
