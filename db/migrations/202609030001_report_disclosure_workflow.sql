-- Public Disclosure Workflow. A researcher may request that a terminal report (resolved,
-- duplicate, informative, not_applicable, or rejected) be published publicly; an
-- organization must explicitly approve before anything is ever visible outside the
-- report's own participants. Never auto-published, never a status on public.reports
-- itself -- disclosure is additive metadata on an already-terminal report, not a new
-- report-lifecycle transition (DOMAIN.md: "Terminal outcomes have no arbitrary exit
-- transition" -- this respects that by never touching reports.status at all).
--
-- Design decisions:
-- 1. One row per report (unique on report_id), not an append-only request log -- a
--    researcher can re-request after a decline (the row's own status resets), matching
--    the "no reopen" spirit of reports but scoped to disclosure's own smaller state
--    machine, which does need a retry path since a decline is not meant to be final in
--    the same way a rejected report is.
-- 2. disclosure_status: requested -> approved | declined; approved -> nothing further
--    (once public, staying public -- no unpublish RPC in this slice, matching how
--    report_status itself has no reopen). declined -> requested (re-request allowed).
-- 3. Published content is a deliberate, minimal snapshot (title, description,
--    resolution_summary, confirmed_severity, resolved_at, program/org name) -- never the
--    full report row, never evidence, never the researcher/organization message thread.
--    An organization approving disclosure is approving that exact snapshot, not a live
--    view of the report that could change after approval.
-- 4. Authorization mirrors the existing report-triage pattern exactly: the researcher who
--    owns the report may request; owner/security_admin or a program member may
--    approve/decline (private.has_org_role / private.is_program_member, both already
--    defined). No new role concept.

create type public.report_disclosure_status as enum ('requested', 'approved', 'declined');

create table public.report_disclosures (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  organization_id uuid not null,
  status public.report_disclosure_status not null default 'requested',
  requested_by uuid not null references public.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 2000),
  -- The published snapshot, filled in only at approval time -- see decision 3 above.
  published_title text,
  published_summary text,
  published_at timestamptz,
  foreign key (report_id, organization_id) references public.reports(id, organization_id) on delete cascade
);

create index report_disclosures_organization_id_idx on public.report_disclosures(organization_id);
create index report_disclosures_status_idx on public.report_disclosures(status) where status = 'approved';

alter table public.report_disclosures enable row level security;

-- Read policy covers both participants (researcher/org) checking their own request state
-- AND the public list of approved disclosures -- an approved row is safe for anyone
-- authenticated or not to read (it's what gets published), everything else is
-- participant-only.
create policy "report disclosures read by participants or public if approved" on public.report_disclosures
  for select
  using (
    status = 'approved'
    or requested_by = auth.uid()
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member((select r.program_id from public.reports r where r.id = report_id))
  );

grant select on public.report_disclosures to anon, authenticated;
grant select, insert, update, delete on public.report_disclosures to service_role;

-- ---------------------------------------------------------------------------
-- private.lock_and_authorize_disclosure_for_report: shared authorize-and-lock primitive,
-- mirroring private.lock_and_authorize_report_for_triage's own shape exactly.
-- ---------------------------------------------------------------------------

create or replace function private.get_terminal_report_for_disclosure(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  report public.reports;
begin
  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if not exists (select 1 from private.report_status_transitions t where t.from_status = report.status) then
    return report; -- terminal: no outgoing transitions defined for this status
  end if;

  raise exception 'REPORT_NOT_TERMINAL: this report has not reached a final decision yet' using errcode = '55000';
end;
$$;

-- ---------------------------------------------------------------------------
-- request_report_disclosure: the researcher who owns a terminal report asks for it to be
-- published. Creates the row if none exists, or resets a declined row back to
-- 'requested' -- an approved row cannot be re-requested (nothing to change).
-- ---------------------------------------------------------------------------

create or replace function public.request_report_disclosure(target_report_id uuid)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  report := private.get_terminal_report_for_disclosure(target_report_id);

  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the researcher who submitted this report can request disclosure' using errcode = '42501';
  end if;

  select * into existing from public.report_disclosures where report_id = target_report_id;

  if existing.id is not null then
    if existing.status = 'approved' then
      raise exception 'ALREADY_APPROVED: this report has already been approved for disclosure' using errcode = '55000';
    end if;
    update public.report_disclosures
      set status = 'requested', requested_at = now(), decided_by = null, decided_at = null, decline_reason = null
      where id = existing.id
      returning * into updated;
  else
    insert into public.report_disclosures (report_id, organization_id, requested_by)
    values (target_report_id, report.organization_id, actor)
    returning * into updated;
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.requested', 'report', target_report_id, '{}'::jsonb);

  return updated;
end;
$$;

revoke all on function public.request_report_disclosure(uuid) from public;
grant execute on function public.request_report_disclosure(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_report_disclosure: an organization manager publishes the report. Captures the
-- minimal snapshot at approval time (see decision 3) -- title and resolution_summary as
-- they exist right now, never re-read live afterward.
-- ---------------------------------------------------------------------------

create or replace function public.approve_report_disclosure(target_report_id uuid)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot decide disclosure for this report' using errcode = '42501';
  end if;

  select * into existing from public.report_disclosures where report_id = target_report_id for update;
  if existing.id is null or existing.status <> 'requested' then
    raise exception 'INVALID_STATE: this report has no pending disclosure request' using errcode = '55000';
  end if;

  update public.report_disclosures
    set status = 'approved', decided_by = actor, decided_at = now(),
        published_title = report.title, published_summary = report.resolution_summary, published_at = now()
    where id = existing.id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.approved', 'report', target_report_id, '{}'::jsonb);

  return updated;
end;
$$;

revoke all on function public.approve_report_disclosure(uuid) from public;
grant execute on function public.approve_report_disclosure(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decline_report_disclosure: an organization manager declines, with an optional reason
-- shown to the researcher. Leaves the row in place (status='declined') so the researcher
-- can see why and re-request via request_report_disclosure.
-- ---------------------------------------------------------------------------

create or replace function public.decline_report_disclosure(target_report_id uuid, p_reason text default null)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
  trimmed_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot decide disclosure for this report' using errcode = '42501';
  end if;

  if trimmed_reason is not null and char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REASON: Use 2000 characters or fewer.' using errcode = '22023';
  end if;

  select * into existing from public.report_disclosures where report_id = target_report_id for update;
  if existing.id is null or existing.status <> 'requested' then
    raise exception 'INVALID_STATE: this report has no pending disclosure request' using errcode = '55000';
  end if;

  update public.report_disclosures
    set status = 'declined', decided_by = actor, decided_at = now(), decline_reason = trimmed_reason
    where id = existing.id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.declined', 'report', target_report_id, jsonb_build_object('reason', trimmed_reason));

  return updated;
end;
$$;

revoke all on function public.decline_report_disclosure(uuid, text) from public;
grant execute on function public.decline_report_disclosure(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_report_disclosure: a researcher checking the disclosure state of their own
-- report (drives the request/pending/approved/declined UI on the report page).
-- ---------------------------------------------------------------------------

create or replace function public.get_my_report_disclosure(target_report_id uuid)
returns public.report_disclosures
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.report_disclosures;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select d.* into result
  from public.report_disclosures d
  join public.reports r on r.id = d.report_id
  where d.report_id = target_report_id and r.researcher_id = actor;

  return result;
end;
$$;

revoke all on function public.get_my_report_disclosure(uuid) from public;
grant execute on function public.get_my_report_disclosure(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_pending_report_disclosures: an organization's queue of requests awaiting a
-- decision, across every program in that org.
-- ---------------------------------------------------------------------------

create or replace function public.list_pending_report_disclosures(target_org_id uuid)
returns table (
  id uuid,
  report_id uuid,
  program_id uuid,
  report_title text,
  program_name text,
  researcher_display_name text,
  requested_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot view this organization''s disclosure queue' using errcode = '42501';
  end if;

  return query
    select d.id, d.report_id, r.program_id, r.title, p.name, u.display_name, d.requested_at
    from public.report_disclosures d
    join public.reports r on r.id = d.report_id
    join public.programs p on p.id = r.program_id
    join public.users u on u.id = r.researcher_id
    where d.organization_id = target_org_id and d.status = 'requested'
    order by d.requested_at asc;
end;
$$;

revoke all on function public.list_pending_report_disclosures(uuid) from public;
grant execute on function public.list_pending_report_disclosures(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_public_disclosures: the anonymous-readable public disclosure feed. Only the
-- minimal published snapshot -- never joins back to the live report row for anything
-- beyond severity/program/org name, all of which are already non-sensitive.
-- ---------------------------------------------------------------------------

create or replace function public.list_public_disclosures()
returns table (
  report_id uuid,
  published_title text,
  published_summary text,
  confirmed_severity public.report_severity,
  program_name text,
  organization_name text,
  published_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select d.report_id, d.published_title, d.published_summary, r.confirmed_severity, p.name, o.name, d.published_at
    from public.report_disclosures d
    join public.reports r on r.id = d.report_id
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where d.status = 'approved'
    order by d.published_at desc;
end;
$$;

revoke all on function public.list_public_disclosures() from public;
grant execute on function public.list_public_disclosures() to anon, authenticated;
