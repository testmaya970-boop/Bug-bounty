-- Report collaboration and bounty splitting. Implements docs/decisions/0064's plan in
-- full: `reports.researcher_id` stays the single submitter of record -- nothing that
-- reads it changes -- collaboration is layered on top as a new, optional table, and
-- payment_obligations becomes split-aware only once a report actually has collaborators.

-- ---------------------------------------------------------------------------
-- report_collaborators: additive. The submitter is never a row here -- their share is
-- 100 minus the sum of collaborator rows, computed at read/payout time, never stored,
-- so the submitter's share can never drift out of sync with the collaborator rows.
-- ---------------------------------------------------------------------------

create table public.report_collaborators (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  researcher_id uuid not null references public.users(id) on delete restrict,
  bounty_split_percent numeric(5,2) not null check (bounty_split_percent > 0 and bounty_split_percent <= 100),
  added_by uuid not null references public.users(id) on delete restrict,
  added_at timestamptz not null default now(),
  unique (report_id, researcher_id)
);

create index report_collaborators_report_id_idx on public.report_collaborators(report_id);
create index report_collaborators_researcher_id_idx on public.report_collaborators(researcher_id);

alter table public.report_collaborators enable row level security;

-- ---------------------------------------------------------------------------
-- private.is_report_collaborator: SECURITY DEFINER, bypasses report_collaborators' own
-- RLS internally -- required because reports' SELECT policy needs to check "is the actor
-- a collaborator on this report," and report_collaborators' own SELECT policy needs to
-- check "can the actor already read this report." Inlining either check as a plain
-- exists() subquery against the other table creates a genuine infinite-recursion cycle
-- between the two policies (caught here live, the same RLS self-reference problem
-- 202608270003's own private.is_manager_or_admin_of_my_program comment already
-- documents) -- a SECURITY DEFINER helper is the same fix that precedent used, breaking
-- the cycle by not re-entering RLS on the way through.
-- ---------------------------------------------------------------------------

create or replace function private.is_report_collaborator(target_report_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.report_collaborators
    where report_id = target_report_id and researcher_id = auth.uid()
  );
end;
$$;

revoke all on function private.is_report_collaborator(uuid) from public;
grant execute on function private.is_report_collaborator(uuid) to authenticated;

-- Read: the submitter, any collaborator on the same report, or anyone who could already
-- read the underlying report (org admins / program members) -- never a broader grant
-- than the report itself already has.
create policy "report collaborators read by submitter, collaborators, or program staff" on public.report_collaborators
  for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
        and (
          r.researcher_id = auth.uid()
          or private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_member(r.program_id)
        )
    )
    or researcher_id = auth.uid()
  );

grant select on public.report_collaborators to authenticated;
grant select, insert, update, delete on public.report_collaborators to service_role;

-- ---------------------------------------------------------------------------
-- Widen report/evidence/communication read access: a collaborator sees exactly what the
-- submitter sees. Added as an additional "or" clause per docs/decisions/0064 -- no new
-- columns needed, no existing policy narrowed. Uses private.is_report_collaborator
-- (above), never an inline subquery against report_collaborators directly, to avoid the
-- recursion these two tables' policies would otherwise form.
-- ---------------------------------------------------------------------------

drop policy if exists "reports read by researcher, org admins, or program managers" on public.reports;
create policy "reports read by researcher, collaborators, org admins, or program managers" on public.reports
  for select to authenticated
  using (
    researcher_id = auth.uid()
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
    or private.is_report_collaborator(id)
  );

drop policy if exists "report evidence read by permitted viewers" on public.report_evidence;
create policy "report evidence read by permitted viewers" on public.report_evidence
  for select to authenticated
  using (
    (visibility = 'researcher_visible' and (
      researcher_id = auth.uid()
      or private.is_report_collaborator(report_id)
    ))
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

drop policy if exists "report messages read by permitted viewers" on public.report_messages;
create policy "report messages read by permitted viewers" on public.report_messages
  for select to authenticated
  using (
    (visibility = 'researcher_visible' and (
      researcher_id = auth.uid()
      or private.is_report_collaborator(report_id)
    ))
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

-- ---------------------------------------------------------------------------
-- add_report_collaborator: submitter-only, only while the report is still 'new' or
-- 'triaging' (locked once triage moves past that, matching both competitors' actual
-- mechanics). Re-validates the running split sum server-side -- never trusts a
-- client-computed remainder. Cap of 10 total, enforced as a row-count check here (a
-- CHECK constraint can't count sibling rows).
-- ---------------------------------------------------------------------------

create or replace function public.add_report_collaborator(
  target_report_id uuid,
  p_collaborator_username text,
  p_bounty_split_percent numeric
)
returns public.report_collaborators
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  collaborator_id uuid;
  existing_count integer;
  existing_split_sum numeric(6,2);
  new_row public.report_collaborators;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can add collaborators' using errcode = '42501';
  end if;
  if report.status not in ('new', 'triaging') then
    raise exception 'REPORT_LOCKED_FOR_COLLABORATION: collaborators can only be added while the report is new or in triage' using errcode = '23514';
  end if;

  if p_bounty_split_percent is null or p_bounty_split_percent <= 0 or p_bounty_split_percent > 100 then
    raise exception 'INVALID_SPLIT: bounty split percent must be greater than 0 and at most 100' using errcode = '22023';
  end if;

  select u.id into collaborator_id from public.users u where lower(u.public_username) = lower(trim(coalesce(p_collaborator_username, '')));
  if collaborator_id is null then
    raise exception 'COLLABORATOR_NOT_FOUND: no researcher exists with that username' using errcode = 'P0002';
  end if;
  if collaborator_id = actor then
    raise exception 'INVALID_COLLABORATOR: you cannot add yourself as a collaborator' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.program_researchers
    where program_id = report.program_id and user_id = collaborator_id and status = 'active'
  ) then
    raise exception 'COLLABORATOR_NOT_AUTHORIZED: that researcher is not an active participant of this program' using errcode = '42501';
  end if;

  select count(*), coalesce(sum(bounty_split_percent), 0) into existing_count, existing_split_sum
    from public.report_collaborators where report_id = target_report_id;

  if existing_count >= 10 then
    raise exception 'COLLABORATOR_LIMIT_REACHED: a report can have at most 10 collaborators' using errcode = '23514';
  end if;
  if existing_split_sum + p_bounty_split_percent >= 100 then
    raise exception 'SPLIT_EXCEEDS_TOTAL: collaborator splits must leave the submitter at least 0.01%% of the bounty' using errcode = '23514';
  end if;

  insert into public.report_collaborators (report_id, researcher_id, bounty_split_percent, added_by)
  values (target_report_id, collaborator_id, p_bounty_split_percent, actor)
  returning * into new_row;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.collaborator_added', 'report', target_report_id,
    jsonb_build_object('collaborator_id', collaborator_id, 'bounty_split_percent', p_bounty_split_percent));

  return new_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_report_collaborator: same authorization and status gate as add. Once a report
-- reaches a terminal status, collaborators are permanently locked -- no "edit split after
-- resolution" path exists on purpose, since a resolved report may already have started
-- payout obligation creation.
-- ---------------------------------------------------------------------------

create or replace function public.remove_report_collaborator(target_collaborator_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  collaborator public.report_collaborators;
  report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into collaborator from public.report_collaborators where id = target_collaborator_id;
  if collaborator.id is null then raise exception 'COLLABORATOR_NOT_FOUND: collaborator not found' using errcode = 'P0002'; end if;

  select * into report from public.reports where id = collaborator.report_id for update;
  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can remove collaborators' using errcode = '42501';
  end if;
  if report.status not in ('new', 'triaging') then
    raise exception 'REPORT_LOCKED_FOR_COLLABORATION: collaborators can only be removed while the report is new or in triage' using errcode = '23514';
  end if;

  delete from public.report_collaborators where id = target_collaborator_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.collaborator_removed', 'report', report.id,
    jsonb_build_object('collaborator_id', collaborator.researcher_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- list_report_collaborators: convenience read RPC joining display_name/public_username
-- so the UI never has to separately fetch user rows. RLS on report_collaborators already
-- gates who can call this meaningfully; the function itself has no additional check
-- beyond what SELECT already enforces.
-- ---------------------------------------------------------------------------

create or replace function public.list_report_collaborators(target_report_id uuid)
returns table (
  id uuid,
  researcher_id uuid,
  display_name text,
  public_username text,
  bounty_split_percent numeric,
  added_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.researcher_id, u.display_name, u.public_username, c.bounty_split_percent, c.added_at
  from public.report_collaborators c
  join public.users u on u.id = c.researcher_id
  where c.report_id = target_report_id
  order by c.added_at asc;
$$;

revoke all on function public.add_report_collaborator(uuid, text, numeric) from public;
revoke all on function public.remove_report_collaborator(uuid) from public;
revoke all on function public.list_report_collaborators(uuid) from public;

grant execute on function public.add_report_collaborator(uuid, text, numeric) to authenticated;
grant execute on function public.remove_report_collaborator(uuid) to authenticated;
grant execute on function public.list_report_collaborators(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bounty-split payout fan-out (one payment_obligations row per collaborator, per
-- docs/decisions/0064) is deliberately NOT built in this pass: create_payment_obligation
-- keeps its existing single-obligation-to-submitter behavior unchanged, and a
-- collaborated report is paid out exactly like an uncollaborated one today. Splitting the
-- payout requires relaxing payment_obligations' one-row-per-decision uniqueness and
-- reworking services/payments.ts, actions/payments.ts, and PaymentStatusSection's
-- single-obligation assumption -- a payments-side change in its own right, not a
-- collaboration-scoped one. 0064 itself calls this out as the one part that depends on
-- 0063's payout shape being settled first; that has not happened yet.
