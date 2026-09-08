-- Program Lifecycle Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0021-program-lifecycle-transitions.md.
--
-- 1. The state machine is DOMAIN.md's own five-state lifecycle
--    (draft->review->active->paused->closed), implemented as data
--    (private.program_status_transitions), following the exact pattern
--    private.report_status_transitions (202608270002) already established -- one place
--    to verify against the domain document, not scattered IF-chains.
-- 2. No generic status-update RPC: every transition is its own public function with its
--    target status hardcoded, never accepted as a client-supplied parameter. Five
--    functions cover the six legal edges: submit_program_for_review (draft->review),
--    activate_program (review->active), pause_program (active->paused), resume_program
--    (paused->active), close_program (active->closed OR paused->closed -- one function,
--    since "close" is the identical real-world action regardless of which of those two
--    states it is closed from).
-- 3. A genuine wrinkle report-triage never had: activate_program and resume_program both
--    target 'active', but from two different, non-interchangeable prior states with two
--    different real-world meanings (first go-live after review, versus recovering from a
--    pause) and two different audit event names. The shared transition table alone
--    cannot distinguish "which RPC is the correct one for this specific prior state" --
--    it only answers "is this edge legal at all" -- so each of these two functions also
--    asserts its own specific expected prior status before deferring to the shared
--    table, ensuring activate_program can never fire from 'paused' (that is
--    resume_program's job) and vice versa, even though both edges are legitimately
--    present in private.program_status_transitions.
-- 4. Authorization reuses the exact two-path check every other program-management
--    mutation in this schema already uses (private.has_org_role(['owner',
--    'security_admin']) or private.is_program_member) -- see
--    docs/decisions/0004-program-authorization.md's "who manages a program once it
--    exists". No new role is introduced. private.lock_and_authorize_program_for_lifecycle
--    mirrors private.lock_and_authorize_report_for_triage (202608270002) exactly: SELECT
--    ... FOR UPDATE locks the program row before authorizing and returning it, so two
--    managers racing to transition the same program serialize on the row rather than
--    both reading a stale status and both succeeding.
-- 5. Idempotency falls out of the transition-table design with no extra mechanism: once a
--    program is 'active', calling activate_program again finds program.status <> 'review'
--    and is rejected with INVALID_PROGRAM_TRANSITION before any write -- the identical
--    "idempotency via rejection" pattern finalize_bounty (202608280002) already
--    established for an already-finalized decision. Zero audit events are written on a
--    rejected call, since the audit insert only happens after the update succeeds.
-- 6. RLS/grants: unchanged. public.programs already has no insert/update/delete grant to
--    `authenticated` at all (202608260004) -- only these new SECURITY DEFINER functions,
--    which bypass RLS internally like every other RPC in this schema, can ever write
--    programs.status. No new policy is added or needed.
-- 7. This slice deliberately does not touch: submit_report's existing
--    paused/closed-blocks-submission check (unchanged, now finally reachable in
--    practice), add_scope_entry/update_scope_entry/remove_scope_entry's existing
--    draft-only gate (unchanged -- a real, disclosed consequence is that scope can no
--    longer be edited once a program leaves draft, since there is no path back to draft;
--    see the decision doc), and invite_researcher_to_program's existing
--    lack-of-lifecycle-gating (DOMAIN.md does not require it, so it is left exactly as
--    0007 built it, not silently changed as a side effect of this slice).

-- ---------------------------------------------------------------------------
-- private.program_status_transitions: DOMAIN.md's program lifecycle, implemented as
-- data. RLS-enabled with no policies (deny-all) as defense in depth, matching every
-- other `private` table in this schema, even though `private` is already unreachable via
-- the Data API regardless.
-- ---------------------------------------------------------------------------

create table private.program_status_transitions (
  from_status public.program_status not null,
  to_status public.program_status not null,
  primary key (from_status, to_status)
);

alter table private.program_status_transitions enable row level security;

insert into private.program_status_transitions (from_status, to_status) values
  ('draft', 'review'),
  ('review', 'active'),
  ('active', 'paused'),
  ('paused', 'active'),
  ('active', 'closed'),
  ('paused', 'closed');
-- No row for 'closed' as a from_status: closed is terminal, exactly as DOMAIN.md's own
-- report-lifecycle precedent treats its terminal statuses (no exit transition). No
-- draft->active, review->paused, or any other edge not explicitly listed in this task's
-- own matrix -- inventing an additional transition DOMAIN.md/this task does not specify
-- is exactly the anti-pattern every prior decision document in this schema warns against.

create or replace function private.is_valid_program_transition(p_from_status public.program_status, p_to_status public.program_status)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from private.program_status_transitions t
    where t.from_status = p_from_status and t.to_status = p_to_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.lock_and_authorize_program_for_lifecycle: the one shared authorize-and-lock
-- primitive every transition RPC below calls first. Mirrors
-- private.lock_and_authorize_report_for_triage (202608270002) exactly.
-- ---------------------------------------------------------------------------

create or replace function private.lock_and_authorize_program_for_lifecycle(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage this program''s lifecycle' using errcode = '42501';
  end if;

  return program;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transition RPCs. Each: lock+authorize, validate the transition, update, audit -- all
-- one transaction, all committed together or none of it. Every rejection uses errcode
-- '23514' (check_violation) directly, not '55000' -- report triage (202608270002) found
-- live that '55000' falls through to PostgREST's default 500 mapping; this migration
-- starts from the already-corrected code rather than repeating that bug.
-- ---------------------------------------------------------------------------

create or replace function public.submit_program_for_review(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if not private.is_valid_program_transition(program.status, 'review') then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program cannot be submitted for review from its current state' using errcode = '23514';
  end if;

  update public.programs set status = 'review', updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.submitted_for_review', 'program', target_program_id, jsonb_build_object('previous_status', program.status));

  return updated;
end;
$$;

create or replace function public.activate_program(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  -- Deliberately narrower than "is any edge to active legal": this function is
  -- specifically the review -> active go-live action. paused -> active is a real,
  -- separately-audited action (resume_program), even though the shared transition table
  -- allows both edges generically -- see this migration's own header comment.
  if program.status <> 'review' or not private.is_valid_program_transition(program.status, 'active') then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program cannot be activated from its current state' using errcode = '23514';
  end if;

  update public.programs set status = 'active', updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.activated', 'program', target_program_id, jsonb_build_object('previous_status', program.status));

  return updated;
end;
$$;

create or replace function public.pause_program(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if not private.is_valid_program_transition(program.status, 'paused') then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program cannot be paused from its current state' using errcode = '23514';
  end if;

  update public.programs set status = 'paused', updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.paused', 'program', target_program_id, jsonb_build_object('previous_status', program.status));

  return updated;
end;
$$;

create or replace function public.resume_program(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  -- The paused -> active counterpart to activate_program's narrowing above: this
  -- function is specifically the "recovering from a pause" action and must never fire
  -- from 'review' (that is activate_program's job).
  if program.status <> 'paused' or not private.is_valid_program_transition(program.status, 'active') then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program cannot be resumed from its current state' using errcode = '23514';
  end if;

  update public.programs set status = 'active', updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.resumed', 'program', target_program_id, jsonb_build_object('previous_status', program.status));

  return updated;
end;
$$;

create or replace function public.close_program(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if not private.is_valid_program_transition(program.status, 'closed') then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program cannot be closed from its current state' using errcode = '23514';
  end if;

  update public.programs set status = 'closed', updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.closed', 'program', target_program_id, jsonb_build_object('previous_status', program.status));

  return updated;
end;
$$;

revoke all on function public.submit_program_for_review(uuid) from public;
revoke all on function public.activate_program(uuid) from public;
revoke all on function public.pause_program(uuid) from public;
revoke all on function public.resume_program(uuid) from public;
revoke all on function public.close_program(uuid) from public;

grant execute on function public.submit_program_for_review(uuid) to authenticated;
grant execute on function public.activate_program(uuid) to authenticated;
grant execute on function public.pause_program(uuid) to authenticated;
grant execute on function public.resume_program(uuid) to authenticated;
grant execute on function public.close_program(uuid) to authenticated;

comment on column public.programs.status is 'DOMAIN.md Program lifecycle: draft->review->active->paused->closed. Created directly at draft. Transitions: submit_program_for_review, activate_program, pause_program, resume_program, close_program (see docs/decisions/0021-program-lifecycle-transitions.md). closed is terminal -- no exit transition exists.';
