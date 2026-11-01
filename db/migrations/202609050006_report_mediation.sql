-- Report mediation. Closes the second-clearest structural gap confirmed against both
-- HackerOne (Request Mediation) and Bugcrowd (Request a Response) -- see
-- docs/decisions/0075. A researcher who believes a report was closed unfairly (wrong
-- status, disputed severity, or a bounty they believe doesn't match the program's own
-- policy) previously had no in-product path to say so at all.
--
-- Scoped deliberately smaller than either competitor's full mediation team: this is
-- flagging-and-resolution BETWEEN the researcher and the organization's own
-- owner/security_admin -- no platform-level adjudicator exists in this schema (0026
-- Section L: platform_role is dead scaffolding), so this does not wait on that foundation
-- being built first, per 0026's own explicit sequencing note that a minimal mechanism
-- "can start as a simple flagged-report queue" resolved by the parties themselves. A
-- genuine platform-adjudicated escalation path is a natural v2 once a real platform-admin
-- role exists -- not required for this to be a real, useful mechanism today.
--
-- Same additive-sibling-table shape as report_disclosures/report_retests: never touches
-- reports.status, never a new report_status value. Scoped to any terminal report (not
-- only 'resolved' -- a researcher can just as reasonably dispute a rejection or a
-- not_applicable/informative/duplicate call), reusing private.get_terminal_report_for_disclosure
-- unchanged for that exact check (already defined, already correct for "is this report's
-- decision final").

create type public.report_mediation_status as enum ('open', 'resolved', 'declined');
create type public.report_mediation_reason as enum ('disagree_with_outcome', 'disagree_with_severity', 'disagree_with_bounty', 'unresponsive_communication', 'other');

create table public.report_mediations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  organization_id uuid not null,
  program_id uuid not null,
  opened_by uuid not null references public.users(id) on delete restrict,
  reason public.report_mediation_reason not null,
  status public.report_mediation_status not null default 'open',
  description text not null check (char_length(description) between 1 and 3000),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text check (resolution_notes is null or char_length(resolution_notes) <= 3000),
  opened_at timestamptz not null default now(),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade
);

create index report_mediations_report_id_idx on public.report_mediations(report_id, opened_at desc);
-- The queue an organization's own owner/security_admin actually works from -- every open
-- mediation across their programs, oldest first.
create index report_mediations_organization_open_idx on public.report_mediations(organization_id, opened_at) where status = 'open';

alter table public.report_mediations enable row level security;

create policy "report mediations read by researcher, org admins, or program members" on public.report_mediations
  for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and r.researcher_id = auth.uid())
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

grant select on public.report_mediations to authenticated;
grant select, insert, update, delete on public.report_mediations to service_role;

-- ---------------------------------------------------------------------------
-- open_report_mediation: the submitting researcher on a terminal report raises a dispute.
-- At most one OPEN mediation per report at a time -- the same "no piling up simultaneous
-- open requests" rule request_report_retest uses, for the identical reason (a second
-- open dispute on the same report while one is already being worked is noise, not signal).
-- ---------------------------------------------------------------------------

create or replace function public.open_report_mediation(target_report_id uuid, p_reason public.report_mediation_reason, p_description text)
returns public.report_mediations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  trimmed_description text := trim(coalesce(p_description, ''));
  new_row public.report_mediations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can open mediation on this report' using errcode = '42501';
  end if;

  if exists (select 1 from private.report_status_transitions t where t.from_status = report.status) then
    raise exception 'REPORT_NOT_TERMINAL: mediation can only be requested once this report has reached a final decision' using errcode = '55000';
  end if;

  if char_length(trimmed_description) = 0 then
    raise exception 'INVALID_MEDIATION_REQUEST: explain what you are disputing' using errcode = '22023';
  end if;
  if char_length(trimmed_description) > 3000 then
    raise exception 'INVALID_MEDIATION_REQUEST: description must be 3000 characters or fewer' using errcode = '22023';
  end if;

  if exists (select 1 from public.report_mediations where report_id = target_report_id and status = 'open') then
    raise exception 'MEDIATION_ALREADY_OPEN: a mediation request is already open for this report' using errcode = '23514';
  end if;

  insert into public.report_mediations (report_id, organization_id, program_id, opened_by, reason, description)
  values (target_report_id, report.organization_id, report.program_id, actor, p_reason, trimmed_description)
  returning * into new_row;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.mediation_opened', 'report', target_report_id, jsonb_build_object('mediation_id', new_row.id, 'reason', p_reason));

  return new_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_report_mediation: org owner/security_admin or a program member records a real
-- outcome. resolved = the dispute was addressed (with or without changing the underlying
-- decision -- resolution_notes says what happened, since this migration does not itself
-- grant any new power to reopen/change the report's actual status/severity/bounty; an
-- org that agrees with the researcher uses its EXISTING triage/severity/bounty RPCs to
-- make that change, same authorization as always -- mediation is the conversation record,
-- never a side channel that bypasses the real decision-making RPCs). declined = the
-- organization reviewed it and the original decision stands.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_report_mediation(target_mediation_id uuid, p_outcome public.report_mediation_status, p_resolution_notes text)
returns public.report_mediations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  mediation public.report_mediations;
  trimmed_notes text := trim(coalesce(p_resolution_notes, ''));
  updated public.report_mediations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into mediation from public.report_mediations where id = target_mediation_id for update;
  if mediation.id is null then raise exception 'MEDIATION_NOT_FOUND: mediation request not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(mediation.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(mediation.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot resolve this mediation' using errcode = '42501';
  end if;

  if mediation.status <> 'open' then
    raise exception 'MEDIATION_ALREADY_DECIDED: this mediation request already has an outcome' using errcode = '23514';
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
  values (actor, mediation.organization_id, 'report.mediation_resolved', 'report', mediation.report_id, jsonb_build_object('mediation_id', mediation.id, 'outcome', p_outcome));

  return updated;
end;
$$;

create or replace function public.list_report_mediations(target_report_id uuid)
returns setof public.report_mediations
language sql stable security definer set search_path = ''
as $$
  select * from public.report_mediations where report_id = target_report_id order by opened_at desc;
$$;

revoke all on function public.open_report_mediation(uuid, public.report_mediation_reason, text) from public;
revoke all on function public.resolve_report_mediation(uuid, public.report_mediation_status, text) from public;
revoke all on function public.list_report_mediations(uuid) from public;

grant execute on function public.open_report_mediation(uuid, public.report_mediation_reason, text) to authenticated;
grant execute on function public.resolve_report_mediation(uuid, public.report_mediation_status, text) to authenticated;
grant execute on function public.list_report_mediations(uuid) to authenticated;
