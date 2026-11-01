-- Report retest. Closes the single clearest structural researcher-side gap confirmed
-- across HackerOne and Bugcrowd's own documented mechanics (docs/decisions/0075) --
-- neither this session's nor any prior audit found a way for a researcher to confirm a
-- fix actually landed. A resolved report was a permanent dead end.
--
-- Design mirrors report_disclosures' own precedent (202609030001) exactly: a new,
-- additive sibling table hanging off an already-terminal report, never a new
-- report_status value and never a new row in private.report_status_transitions --
-- DOMAIN.md's "Terminal outcomes have no arbitrary exit transition" stays true, because
-- reports.status is never touched by anything in this migration. Retest is scoped
-- specifically to 'resolved' (not every terminal state) -- a fix was actually applied and
-- claimed complete; asking to retest a report that was rejected/informative/duplicate/not
-- applicable makes no sense, since nothing was ever fixed there to verify.
--
-- Small, bounded state machine: requested -> confirmed_fixed | still_vulnerable. Either
-- outcome is final for that specific request (matches every other terminal-outcome
-- pattern in this schema) -- a researcher who finds the issue still present after a
-- 'still_vulnerable' outcome requests a NEW retest, not a reopening of the old one, so the
-- history of every retest attempt stays a real, readable append-only record rather than
-- one row silently overwritten.

create type public.report_retest_status as enum ('requested', 'confirmed_fixed', 'still_vulnerable');

create table public.report_retests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  organization_id uuid not null,
  program_id uuid not null,
  requested_by uuid not null references public.users(id) on delete restrict,
  status public.report_retest_status not null default 'requested',
  requester_notes text check (requester_notes is null or char_length(requester_notes) <= 2000),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  decision_notes text check (decision_notes is null or char_length(decision_notes) <= 2000),
  requested_at timestamptz not null default now(),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade
);

create index report_retests_report_id_idx on public.report_retests(report_id, requested_at desc);
create index report_retests_organization_id_idx on public.report_retests(organization_id, status);

alter table public.report_retests enable row level security;

-- Read: the researcher who owns the report, or org admins/program members -- the exact
-- same read shape report_disclosures/report_messages already use.
create policy "report retests read by researcher, org admins, or program members" on public.report_retests
  for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and r.researcher_id = auth.uid())
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

grant select on public.report_retests to authenticated;
grant select, insert, update, delete on public.report_retests to service_role;

-- ---------------------------------------------------------------------------
-- request_report_retest: the submitting researcher on a resolved report asks the
-- organization to confirm whether the fix actually landed. At most one OPEN (status =
-- 'requested') retest at a time per report -- a researcher who wants to check again after
-- a decided outcome requests a fresh one, never piling up simultaneous open requests for
-- the same report.
-- ---------------------------------------------------------------------------

create or replace function public.request_report_retest(target_report_id uuid, p_requester_notes text default null)
returns public.report_retests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  trimmed_notes text := nullif(trim(coalesce(p_requester_notes, '')), '');
  new_row public.report_retests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can request a retest' using errcode = '42501';
  end if;
  if report.status <> 'resolved' then
    raise exception 'REPORT_NOT_RESOLVED: only a resolved report can be retested' using errcode = '23514';
  end if;

  if exists (select 1 from public.report_retests where report_id = target_report_id and status = 'requested') then
    raise exception 'RETEST_ALREADY_PENDING: a retest request is already open for this report' using errcode = '23514';
  end if;

  if trimmed_notes is not null and char_length(trimmed_notes) > 2000 then
    raise exception 'INVALID_RETEST_REQUEST: notes must be 2000 characters or fewer' using errcode = '22023';
  end if;

  insert into public.report_retests (report_id, organization_id, program_id, requested_by, requester_notes)
  values (target_report_id, report.organization_id, report.program_id, actor, trimmed_notes)
  returning * into new_row;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.retest_requested', 'report', target_report_id, jsonb_build_object('retest_id', new_row.id));

  return new_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- decide_report_retest: org owner/security_admin or a program member records the real
-- outcome of actually retesting. p_outcome is the one thing this RPC can set -- there is
-- no generic "update retest" RPC, matching every other terminal-decision pattern in this
-- schema (e.g. record_manual_payment_result's identical shape).
-- ---------------------------------------------------------------------------

create or replace function public.decide_report_retest(target_retest_id uuid, p_outcome public.report_retest_status, p_decision_notes text default null)
returns public.report_retests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  retest public.report_retests;
  trimmed_notes text := nullif(trim(coalesce(p_decision_notes, '')), '');
  updated public.report_retests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into retest from public.report_retests where id = target_retest_id for update;
  if retest.id is null then raise exception 'RETEST_NOT_FOUND: retest request not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(retest.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(retest.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot decide this retest' using errcode = '42501';
  end if;

  if retest.status <> 'requested' then
    raise exception 'RETEST_ALREADY_DECIDED: this retest request already has an outcome' using errcode = '23514';
  end if;

  if p_outcome not in ('confirmed_fixed', 'still_vulnerable') then
    raise exception 'INVALID_RETEST_OUTCOME: outcome must be confirmed_fixed or still_vulnerable' using errcode = '22023';
  end if;

  update public.report_retests set
    status = p_outcome,
    decided_by = actor,
    decided_at = now(),
    decision_notes = trimmed_notes
    where id = target_retest_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, retest.organization_id, 'report.retest_decided', 'report', retest.report_id, jsonb_build_object('retest_id', retest.id, 'outcome', p_outcome));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_report_retests: convenience read RPC -- RLS on report_retests already gates who
-- can read meaningfully; ordered newest first so the current/most relevant attempt leads.
-- ---------------------------------------------------------------------------

create or replace function public.list_report_retests(target_report_id uuid)
returns setof public.report_retests
language sql stable security definer set search_path = ''
as $$
  select * from public.report_retests where report_id = target_report_id order by requested_at desc;
$$;

revoke all on function public.request_report_retest(uuid, text) from public;
revoke all on function public.decide_report_retest(uuid, public.report_retest_status, text) from public;
revoke all on function public.list_report_retests(uuid) from public;

grant execute on function public.request_report_retest(uuid, text) to authenticated;
grant execute on function public.decide_report_retest(uuid, public.report_retest_status, text) to authenticated;
grant execute on function public.list_report_retests(uuid) to authenticated;
