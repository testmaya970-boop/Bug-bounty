-- Remaining fixes from the 2026-10-12 QA pass.
--
--  1. Reputation followed the FIRST outcome forever: a report resolved, reopened by a failed
--     retest and then rejected kept its resolved points. A report now scores only its
--     latest outcome, and its bounty fact only while that outcome is "resolved".
--  2. The resolved fact read the report's LIVE severity when the worker ran, so a reopen and
--     severity change before then changed the points. reports.severity_at_resolution is
--     frozen at the first resolution and is what the fact records.
--  3. Duplicate chains collapse to the root original (A dup of B dup of C -> A dup of C).
--  4. Collaborator splits are checked after numeric(5,2) rounding: 99.999% used to pass the
--     "< 100" check and store as 100.00, leaving the submitter nothing.
--  5. A report can't be linked to a removed scope entry.
--  6. A suspended organization can't change program visibility or scope.
--  7. At most 3 retests per report (each one notifies the org).
--  8. Title, description and impact can't be whitespace only (tabs/newlines slipped past
--     trim()). NOT VALID: existing rows are left alone.
--  9. No payout to a suspended or deactivated researcher.
-- 10. CTF: a challenge solved before an event now still earns that event's points (it
--     returned "already solved" before attributing), the flag is always checked, and
--     organization or suspended accounts can't solve.
-- 11. Triagers can read a program's access instructions (they need them to reproduce).

-- 2 -------------------------------------------------------------------------
alter table public.reports add column if not exists severity_at_resolution public.report_severity;

-- 2 + 3 (and keeps 202610120001's bounty pin) --------------------------------
create or replace function private.enforce_report_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  original public.reports;
  hops integer := 0;
begin
  if new.status is distinct from old.status and not private.is_valid_report_transition(old.status, new.status)
     -- The single reopen path: decide_report_retest(still_vulnerable), in this transaction only.
     and not (old.status = 'resolved' and new.status = 'accepted' and current_setting('app.reopening_report', true) = new.id::text) then
    raise exception 'INVALID_TRANSITION: a report cannot move from % to %', old.status, new.status using errcode = '23514';
  end if;

  if new.status is distinct from old.status
     and new.status in ('rejected', 'not_applicable', 'informative', 'duplicate')
     and exists (select 1 from public.report_bounty_decisions d where d.report_id = new.id and d.state = 'finalized') then
    raise exception 'BOUNTY_FINALIZED: this report has a finalized bounty, so it can only be resolved again' using errcode = '23514';
  end if;

  if new.status = 'resolved' and old.status is distinct from 'resolved' and new.severity_at_resolution is null then
    new.severity_at_resolution := new.confirmed_severity;
  end if;

  if new.duplicate_of_report_id is not null and new.duplicate_of_report_id is distinct from old.duplicate_of_report_id then
    select * into original from public.reports where id = new.duplicate_of_report_id;
    -- Point at the root original, not at another duplicate.
    while original.duplicate_of_report_id is not null and hops < 50 loop
      select * into original from public.reports where id = original.duplicate_of_report_id;
      hops := hops + 1;
    end loop;
    if original.id is null or original.program_id <> new.program_id then
      raise exception 'INVALID_DUPLICATE: the original report must be in the same program' using errcode = '22023';
    end if;
    if original.id = new.id then
      raise exception 'INVALID_DUPLICATE: a report cannot duplicate itself' using errcode = '22023';
    end if;
    if original.submitted_at > new.submitted_at then
      raise exception 'INVALID_DUPLICATE: a report can only duplicate one submitted before it' using errcode = '22023';
    end if;
    new.duplicate_of_report_id := original.id;
  end if;
  return new;
end;
$$;

-- 1 -------------------------------------------------------------------------
create or replace function private.effective_reputation_facts()
returns setof public.reputation_ledger
language sql stable security definer set search_path = ''
as $$
  with firsts as (
    select distinct on (coalesce(l.report_id::text, l.id::text), l.fact_type) l.*
    from public.reputation_ledger l
    order by coalesce(l.report_id::text, l.id::text), l.fact_type, l.occurred_at, l.created_at, l.id
  ),
  latest_outcome as (
    select distinct on (f.report_id) f.report_id, f.fact_type
    from firsts f
    where f.report_id is not null and f.fact_type like 'report\_%'
    order by f.report_id, f.occurred_at desc, f.created_at desc
  )
  select f.*
  from firsts f
  left join latest_outcome lo on lo.report_id = f.report_id
  where f.report_id is null
     or (f.fact_type like 'report\_%' and f.fact_type = lo.fact_type)
     or (f.fact_type = 'bounty_finalized' and lo.fact_type = 'report_resolved')
     or (f.fact_type not like 'report\_%' and f.fact_type <> 'bounty_finalized');
$$;

-- 2: the recorder freezes the resolution-time severity ------------------------
create or replace function public.record_reputation_fact(p_source_event_id uuid, p_fact_type text, p_report_id uuid, p_occurred_at timestamptz)
returns public.reputation_ledger
language plpgsql set search_path = ''
as $$
declare
  report public.reports;
  existing public.reputation_ledger;
  inserted public.reputation_ledger;
  expected_action text;
begin
  select * into existing from public.reputation_ledger where source_event_id = p_source_event_id;
  if existing.id is not null then return existing; end if;

  expected_action := case p_fact_type
    when 'report_resolved' then 'report.resolved'
    when 'report_duplicate' then 'report.marked_duplicate'
    when 'report_informative' then 'report.marked_informative'
    when 'report_not_applicable' then 'report.marked_not_applicable'
    when 'report_rejected' then 'report.rejected'
  end;
  if expected_action is null then
    raise exception 'INVALID_FACT_TYPE: % is not a report-outcome fact type', p_fact_type using errcode = '22023';
  end if;

  select * into report from public.reports where id = p_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002'; end if;

  -- The outcome happened (a later reopen doesn't undo that it was reached).
  if not exists (select 1 from public.audit_logs al where al.entity_type = 'report' and al.entity_id = report.id and al.action = expected_action) then
    raise exception 'PROVENANCE_MISMATCH: this report never reached the claimed outcome' using errcode = '23514';
  end if;

  -- A report earns each outcome once, however many times it is re-resolved.
  select * into existing from public.reputation_ledger where report_id = report.id and fact_type = p_fact_type order by occurred_at limit 1;
  if existing.id is not null then return existing; end if;

  begin
    insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, confirmed_severity, duplicate_of_report_id, source_event_id, event_type, schema_version, occurred_at)
    values (report.researcher_id, report.organization_id, report.program_id, report.id, p_fact_type,
      case when p_fact_type = 'report_resolved' then coalesce(report.severity_at_resolution, report.confirmed_severity) else report.confirmed_severity end,
      case when p_fact_type = 'report_duplicate' then report.duplicate_of_report_id end,
      p_source_event_id, 'report.' || replace(p_fact_type, 'report_', ''), 1, p_occurred_at)
    returning * into inserted;
  exception when unique_violation then
    select * into inserted from public.reputation_ledger where source_event_id = p_source_event_id;
  end;
  return inserted;
end;
$$;

-- 4 -------------------------------------------------------------------------
create or replace function private.check_collaborator_split()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- NEW is already rounded to the column's numeric(5,2) here.
  if (select coalesce(sum(c.bounty_split_percent), 0) from public.report_collaborators c where c.report_id = new.report_id and c.id <> new.id) + new.bounty_split_percent >= 100 then
    raise exception 'INVALID_SPLIT: collaborator splits must leave the submitter at least 0.01%%' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.check_collaborator_split() from public;
drop trigger if exists report_collaborators_check_split on public.report_collaborators;
create trigger report_collaborators_check_split
  before insert or update of bounty_split_percent on public.report_collaborators
  for each row execute function private.check_collaborator_split();

-- 5 -------------------------------------------------------------------------
create or replace function private.check_report_scope_link()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.matched_scope_entry_id is distinct from old.matched_scope_entry_id
     and exists (select 1 from public.program_scope_entries e where e.id = new.matched_scope_entry_id and e.status = 'removed') then
    raise exception 'SCOPE_ENTRY_NOT_FOUND: that asset has been removed from scope' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke all on function private.check_report_scope_link() from public;
drop trigger if exists reports_check_scope_link on public.reports;
create trigger reports_check_scope_link
  before update of matched_scope_entry_id on public.reports
  for each row execute function private.check_report_scope_link();

-- 6 (scope half joins 202610120001's review lock) -----------------------------
create or replace function private.lock_scope_during_review()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  program public.programs;
begin
  select * into program from public.programs p where p.id = new.program_id;
  if program.status = 'review' then
    raise exception 'SCOPE_LOCKED_IN_REVIEW: scope can''t change while the program is in launch review' using errcode = '23514';
  end if;
  if not private.organization_is_operable(program.organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot change scope' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.check_visibility_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.visibility is distinct from old.visibility and not private.organization_is_operable(new.organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot change program visibility' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.check_visibility_change() from public;
drop trigger if exists programs_check_visibility_change on public.programs;
create trigger programs_check_visibility_change
  before update of visibility on public.programs
  for each row execute function private.check_visibility_change();

-- 7 -------------------------------------------------------------------------
create or replace function private.limit_report_retests()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.report_retests r where r.report_id = new.report_id) >= 3 then
    raise exception 'RETEST_LIMIT_REACHED: this report has already been retested 3 times' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.limit_report_retests() from public;
drop trigger if exists report_retests_limit on public.report_retests;
create trigger report_retests_limit
  before insert on public.report_retests
  for each row execute function private.limit_report_retests();

-- 8 -------------------------------------------------------------------------
alter table public.reports
  add constraint reports_text_not_blank check (
    title ~ '[^[:space:]]' and description ~ '[^[:space:]]' and (impact is null or impact ~ '[^[:space:]]')
  ) not valid;

-- 9 -------------------------------------------------------------------------
create or replace function private.payout_blockers(target_researcher_id uuid, target_program_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select array_remove(array[
    case when not exists (select 1 from public.researcher_payout_details d where d.user_id = target_researcher_id and d.method is not null)
      then 'payout_method_missing' end,
    case when not exists (select 1 from public.researcher_payout_details d where d.user_id = target_researcher_id and d.tax_form_status = 'verified')
      then 'tax_form_not_verified' end,
    case when exists (select 1 from public.programs p where p.id = target_program_id and p.requires_kyc)
          and not private.researcher_has_verified_kyc(target_researcher_id)
      then 'kyc_not_verified' end,
    case when exists (select 1 from public.users u where u.id = target_researcher_id and (u.is_suspended or u.deactivated_at is not null))
      then 'researcher_unavailable' end
  ], null);
$$;

-- 10 ------------------------------------------------------------------------
create or replace function public.submit_ctf_flag(p_challenge_id text, p_flag text)
returns table (correct boolean, points_awarded integer, already_solved boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  challenge public.ctf_challenges;
  newly_solved boolean := false;
  event_credits integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if exists (select 1 from public.users u where u.id = actor and (u.account_type = 'organization' or u.is_suspended)) then
    raise exception 'FORBIDDEN: this account cannot take part in CTF challenges' using errcode = '42501';
  end if;

  select * into challenge from public.ctf_challenges where id = p_challenge_id;
  if challenge.id is null then raise exception 'CHALLENGE_NOT_FOUND: unknown challenge' using errcode = 'P0002'; end if;

  if p_flag is null or encode(extensions.digest(trim(p_flag), 'sha256'), 'hex') <> challenge.flag_hash then
    correct := false; points_awarded := 0; already_solved := false; return next; return;
  end if;

  -- Practice score and reputation: once per researcher and challenge, ever.
  if not exists (select 1 from public.ctf_solves s where s.researcher_id = actor and s.challenge_id = p_challenge_id) then
    insert into public.ctf_solves (researcher_id, challenge_id, points_awarded)
    values (actor, p_challenge_id, challenge.points);
    insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, source_event_id, event_type, schema_version, occurred_at)
    values (actor, null, null, null, 'ctf_challenge_solved', null, 'ctf.solved', 1, now());
    newly_solved := true;
  end if;

  -- Events: once per event, even for a challenge solved before the event opened.
  with credited as (
    insert into public.ctf_event_solves (event_id, researcher_id, challenge_id, points_awarded, solved_at)
    select e.id, actor, p_challenge_id, challenge.points, now()
    from public.ctf_events e
    join public.ctf_event_challenges c on c.event_id = e.id and c.challenge_id = p_challenge_id
    where e.status <> 'draft' and now() >= e.starts_at and now() < e.ends_at
    on conflict (event_id, researcher_id, challenge_id) do nothing
    returning 1
  )
  select count(*) into event_credits from credited;

  correct := true;
  already_solved := not newly_solved and event_credits = 0;
  points_awarded := case when already_solved then 0 else challenge.points end;
  return next;
end;
$$;

-- 11 ------------------------------------------------------------------------
create or replace function public.get_program_access_instructions(target_program_id uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select access_instructions into result from public.programs
    where id = target_program_id
      and (
        private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
        or private.is_program_triager(id)
        or private.is_invited_researcher_for_program(id)
      );
  -- Not found and not authorized are deliberately the same null.
  return result;
end;
$$;
