-- Mediation escalation to a real platform admin. Closes the gap flagged this session:
-- mediation was real but resolved only by the org itself -- a researcher had no recourse
-- if the org was unresponsive or acted in bad faith. Reuses the exact platform-admin
-- authority already proven in 202608310001 (private.is_platform_admin(), the
-- independent-re-check-in-every-function convention, the audit_logs write pattern) --
-- no new authorization primitive invented.
--
-- 'escalated' is a genuinely new report_mediation_status value, not a repurposed one --
-- added as its own statement before any function references it, which is safe on this
-- Postgres version (12+) as long as the ALTER TYPE isn't in the same statement as a use of
-- the new value; every function below is its own separate `create or replace`, so this is
-- fine as ordinary sequential migration statements.

alter type public.report_mediation_status add value if not exists 'escalated';

-- report_mediations gains two columns mirroring resolved_by/resolved_at's own shape
-- exactly, for the identical reason: a real record of who escalated it and when, not just
-- a status flip with no provenance.
alter table public.report_mediations
  add column escalated_by uuid references public.users(id) on delete set null,
  add column escalated_at timestamptz;

-- ---------------------------------------------------------------------------
-- escalate_report_mediation: only the researcher who opened the mediation can escalate
-- their own, and only while it is still 'open' -- an already-resolved/declined mediation
-- has nothing left to escalate, and a mediation already escalated can't be escalated
-- twice (a second call cleanly fails with MEDIATION_ALREADY_ESCALATED, not a silent no-op).
-- ---------------------------------------------------------------------------

create or replace function public.escalate_report_mediation(target_mediation_id uuid)
returns public.report_mediations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  mediation public.report_mediations;
  updated public.report_mediations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into mediation from public.report_mediations where id = target_mediation_id for update;
  if mediation.id is null then raise exception 'MEDIATION_NOT_FOUND: mediation request not found' using errcode = 'P0002'; end if;

  if mediation.opened_by <> actor then
    raise exception 'FORBIDDEN: only the researcher who opened this mediation can escalate it' using errcode = '42501';
  end if;

  if mediation.status = 'escalated' then
    raise exception 'MEDIATION_ALREADY_ESCALATED: this mediation has already been escalated' using errcode = '23514';
  end if;
  if mediation.status <> 'open' then
    raise exception 'MEDIATION_NOT_OPEN: only an open mediation can be escalated' using errcode = '23514';
  end if;

  update public.report_mediations set
    status = 'escalated',
    escalated_by = actor,
    escalated_at = now()
    where id = target_mediation_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, mediation.organization_id, 'report.mediation_escalated', 'report', mediation.report_id, jsonb_build_object('mediation_id', mediation.id));

  return updated;
end;
$$;

revoke all on function public.escalate_report_mediation(uuid) from public;
grant execute on function public.escalate_report_mediation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_escalated_mediations_for_admin: platform-admin-only read, same independent
-- re-check-in-body convention every 202608310001 RPC uses. Deliberately narrow metadata,
-- matching that migration's own "never report content beyond what's needed to locate and
-- adjudicate" boundary -- report title/description/target ARE included here (unlike the
-- Needs Recovery queue's opaque ids), because adjudicating a mediation genuinely requires
-- reading what was disputed and why; this is real report content exposure, intentionally
-- narrower than "platform admin can browse any report" -- only reachable via an escalated
-- mediation a researcher themselves chose to escalate, never a blanket grant.
-- ---------------------------------------------------------------------------

create or replace function public.list_escalated_mediations_for_admin()
returns table (
  id uuid,
  report_id uuid,
  organization_id uuid,
  organization_name text,
  program_id uuid,
  program_name text,
  report_title text,
  opened_by uuid,
  opened_by_name text,
  reason public.report_mediation_reason,
  description text,
  escalated_at timestamptz,
  opened_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select m.id, m.report_id, m.organization_id, o.name, m.program_id, p.name, r.title, m.opened_by, u.display_name, m.reason, m.description, m.escalated_at, m.opened_at
  from public.report_mediations m
  join public.organizations o on o.id = m.organization_id
  join public.programs p on p.id = m.program_id
  join public.reports r on r.id = m.report_id
  join public.users u on u.id = m.opened_by
  where m.status = 'escalated'
  order by m.escalated_at asc nulls last, m.opened_at asc;
end;
$$;

revoke all on function public.list_escalated_mediations_for_admin() from public;
grant execute on function public.list_escalated_mediations_for_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_escalated_report_mediation: a separate RPC from resolve_report_mediation
-- (rather than widening that one's own authorization check), because the two callers
-- should never be confusable -- an organization's own owner/security_admin resolving an
-- 'open' mediation is a materially different action from a platform admin adjudicating one
-- the organization itself failed to resolve. Only ever legal on a mediation currently
-- 'escalated'; the org's own resolve_report_mediation still independently requires
-- 'open' and will correctly reject an escalated one as MEDIATION_ALREADY_DECIDED's
-- sibling case (status check there is unchanged, still `<> 'open'`) -- an organization
-- cannot resolve out from under a live platform escalation.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_escalated_report_mediation(target_mediation_id uuid, p_outcome public.report_mediation_status, p_resolution_notes text)
returns public.report_mediations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  mediation public.report_mediations;
  trimmed_notes text := trim(coalesce(p_resolution_notes, ''));
  updated public.report_mediations;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  select * into mediation from public.report_mediations where id = target_mediation_id for update;
  if mediation.id is null then raise exception 'MEDIATION_NOT_FOUND: mediation request not found' using errcode = 'P0002'; end if;

  if mediation.status <> 'escalated' then
    raise exception 'MEDIATION_NOT_ESCALATED: only an escalated mediation can be resolved this way' using errcode = '23514';
  end if;

  if p_outcome not in ('resolved', 'declined') then
    raise exception 'INVALID_MEDIATION_OUTCOME: outcome must be resolved or declined' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) = 0 then
    raise exception 'INVALID_MEDIATION_OUTCOME: explain the resolution' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) > 3000 then
    raise exception 'INVALID_MEDIATION_OUTCOME: resolution notes must be 3000 characters or fewer' using errcode = '22023';
  end if;

  update public.report_mediations set
    status = p_outcome,
    resolved_by = actor,
    resolved_at = now(),
    resolution_notes = trimmed_notes
    where id = target_mediation_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, mediation.organization_id, 'platform.mediation_resolved', 'report', mediation.report_id, jsonb_build_object('mediation_id', mediation.id, 'outcome', p_outcome));

  return updated;
end;
$$;

revoke all on function public.resolve_escalated_report_mediation(uuid, public.report_mediation_status, text) from public;
grant execute on function public.resolve_escalated_report_mediation(uuid, public.report_mediation_status, text) to authenticated;
