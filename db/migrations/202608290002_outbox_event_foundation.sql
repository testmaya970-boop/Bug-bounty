-- Transactional Outbox + Job Execution Foundation. Design decisions recorded here and
-- expanded in docs/decisions/0015-outbox-event-foundation.md.
--
-- 1. This is infrastructure, not a product feature. No Reputation, Notifications,
--    Analytics, Stripe/Razorpay, or Kafka/Redis/microservices are introduced. A single
--    existing RPC (submit_report) is instrumented as the one reference integration,
--    proving the pattern without retrofitting every mutation in the codebase.
-- 2. audit_logs != outbox_events. audit_logs answers "what happened, for forensic
--    history" (unchanged, still written by every mutation that already writes it).
--    outbox_events answers "something happened that another process may need to react
--    to" -- a genuinely different table, for a genuinely different reader (a worker
--    process, never a human browsing a UI).
-- 3. Only four states exist on outbox_events (pending/processing/succeeded/dead_letter)
--    -- no separate "failed" state distinct from "pending, will retry after backoff",
--    since attempts/last_error already distinguish a fresh row from a retried one. A
--    retryable failure returns to 'pending' with a bumped available_at; a permanent
--    failure (unknown event type, or attempts exhausted) goes straight to 'dead_letter'.
-- 4. Worker claiming uses `FOR UPDATE SKIP LOCKED` inside one atomic SQL function
--    (claim_outbox_events) -- multiple worker processes can call it concurrently and
--    never claim the same row, without any application-level locking.
-- 5. Lease expiry needs no separate reaper process: claim_outbox_events' own claimable
--    predicate already includes "processing, but the lease looks abandoned"
--    (locked_at older than the caller's own lease window), so the very next claim call
--    from any worker recovers a crashed worker's abandoned row. A row whose attempts
--    already reached max_attempts is dead-lettered at claim time instead of being
--    reclaimed forever -- otherwise a worker that reliably crashes immediately after
--    claiming could retry the same event indefinitely without ever reaching dead_letter.
-- 6. aggregate_id is intentionally polymorphic (aggregate_type decides which table it
--    points into) and therefore has no foreign key -- the identical, already-accepted
--    tradeoff audit_logs.entity_id already makes for the same reason.
-- 7. No table/function here is reachable by `authenticated` or `anon` at all -- workers
--    run as trusted, server-only processes using the service_role key directly (the same
--    trust boundary lib/evidence-store.ts already established for object storage), never
--    through a public RPC a browser session could call. RLS is still enabled with zero
--    permissive policies, so an accidental non-service-role query still gets nothing.

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (char_length(event_type) between 3 and 100),
  schema_version integer not null default 1 check (schema_version > 0),
  aggregate_type text not null check (char_length(aggregate_type) between 2 and 40),
  aggregate_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'dead_letter')),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbox_events_shape_check check (
    (status in ('pending', 'succeeded', 'dead_letter') and locked_at is null and locked_by is null)
    or (status = 'processing' and locked_at is not null and locked_by is not null)
  )
);

-- The claim query's own WHERE clause, as two partial indexes: the common case (genuinely
-- pending, due now) and the rare case (an abandoned lease being reclaimed).
create index outbox_events_pending_available_idx on public.outbox_events(available_at) where status = 'pending';
create index outbox_events_processing_locked_at_idx on public.outbox_events(locked_at) where status = 'processing';
create index outbox_events_aggregate_idx on public.outbox_events(aggregate_type, aggregate_id);
create index outbox_events_organization_id_idx on public.outbox_events(organization_id);

-- The idempotent-consumer ledger: a consumer's side effect is guarded by an attempted
-- insert here first (ON CONFLICT DO NOTHING). A second delivery of the same event to the
-- same consumer is a guaranteed no-op at the database level, not a hope that application
-- code remembered to check.
create table public.outbox_event_receipts (
  consumer_name text not null check (char_length(consumer_name) between 3 and 100),
  event_id uuid not null references public.outbox_events(id) on delete cascade,
  processed_at timestamptz not null default now(),
  primary key (consumer_name, event_id)
);

alter table public.outbox_events enable row level security;
alter table public.outbox_event_receipts enable row level security;

-- Deliberately zero policies for `authenticated`/`anon` on either table -- not "narrow,"
-- absent. There is no legitimate browser-facing read of a worker's internal job queue.
-- Only `service_role` (which bypasses RLS entirely, the same trust boundary every other
-- server-only integration in this codebase already uses) can reach these tables at all.
revoke all on public.outbox_events, public.outbox_event_receipts from authenticated, anon;
grant select, insert, update, delete on public.outbox_events, public.outbox_event_receipts to service_role;

-- ---------------------------------------------------------------------------
-- private.outbox_backoff_seconds: exponential backoff capped at 5 minutes. A pure,
-- deterministic function -- no randomness, no external state -- so retry timing is
-- reproducible and testable.
-- ---------------------------------------------------------------------------

create or replace function private.outbox_backoff_seconds(p_attempts integer)
returns integer
language sql immutable set search_path = ''
as $$
  select least(power(2, greatest(p_attempts, 0))::integer, 300);
$$;

-- ---------------------------------------------------------------------------
-- claim_outbox_events: the sole write path into 'processing'. Atomically dead-letters any
-- lease-expired row that has exhausted its attempts (closing the eternal-crash-loop gap
-- described above), then claims up to p_batch_size claimable rows via
-- `FOR UPDATE SKIP LOCKED` so concurrent callers never contend for, or double-claim, the
-- same row. Not exposed to `authenticated`/`anon` at all -- see the grants at the bottom.
-- ---------------------------------------------------------------------------

create or replace function public.claim_outbox_events(p_worker_id text, p_batch_size integer default 10, p_lease_seconds integer default 60)
returns setof public.outbox_events
language plpgsql set search_path = ''
as $$
begin
  if p_worker_id is null or char_length(trim(p_worker_id)) = 0 then
    raise exception 'INVALID_WORKER_ID: a non-empty worker id is required' using errcode = '22023';
  end if;
  if p_batch_size <= 0 or p_batch_size > 100 then
    raise exception 'INVALID_BATCH_SIZE: batch size must be between 1 and 100' using errcode = '22023';
  end if;

  -- An abandoned lease (the worker that claimed it never completed it) whose attempts
  -- are already exhausted must not be reclaimed forever -- dead-letter it here, once,
  -- rather than leaving it eligible for the claim below to pick up again.
  update public.outbox_events
  set status = 'dead_letter', processed_at = now(), locked_at = null, locked_by = null,
    last_error = coalesce(last_error, '') || case when last_error is null then '' else ' | ' end || 'Abandoned after lease expiry with attempts exhausted.',
    updated_at = now()
  where status = 'processing'
    and locked_at < now() - make_interval(secs => p_lease_seconds)
    and attempts >= max_attempts;

  return query
  with claimable as (
    select o.id
    from public.outbox_events o
    where (o.status = 'pending' and o.available_at <= now())
       or (o.status = 'processing' and o.locked_at < now() - make_interval(secs => p_lease_seconds))
    order by o.available_at asc
    limit p_batch_size
    for update skip locked
  )
  update public.outbox_events
  set status = 'processing', locked_at = now(), locked_by = p_worker_id, attempts = attempts + 1, updated_at = now()
  where id in (select id from claimable)
  returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_outbox_event: the sole path out of 'processing'. Requires the caller to still
-- hold the lease it thinks it holds (locked_by = p_worker_id) -- a worker whose lease was
-- already reclaimed by another worker gets a clear LEASE_LOST rejection instead of
-- silently overwriting a different worker's in-flight (or already-completed) work.
-- p_permanent bypasses the attempts/backoff calculation entirely: a permanent failure
-- (unknown event type, malformed payload) will never succeed no matter how many times
-- retried, so retrying it is pure waste -- straight to dead_letter regardless of
-- how many attempts remain.
-- ---------------------------------------------------------------------------

create or replace function public.complete_outbox_event(p_event_id uuid, p_worker_id text, p_success boolean, p_permanent boolean default false, p_error text default null)
returns public.outbox_events
language plpgsql set search_path = ''
as $$
declare
  event public.outbox_events;
  trimmed_error text := nullif(trim(coalesce(p_error, '')), '');
  updated public.outbox_events;
begin
  select * into event from public.outbox_events where id = p_event_id for update;
  if event.id is null then raise exception 'EVENT_NOT_FOUND: outbox event not found' using errcode = 'P0002'; end if;
  if event.status <> 'processing' then
    raise exception 'EVENT_NOT_PROCESSING: this event is not currently claimed' using errcode = '23514';
  end if;
  if event.locked_by <> p_worker_id then
    raise exception 'LEASE_LOST: this event is no longer leased by this worker' using errcode = '23514';
  end if;
  if trimmed_error is not null and char_length(trimmed_error) > 2000 then
    raise exception 'INVALID_COMPLETION: error message must be 2000 characters or fewer' using errcode = '22023';
  end if;

  if p_success then
    update public.outbox_events set
      status = 'succeeded', processed_at = now(), locked_at = null, locked_by = null, updated_at = now()
      where id = p_event_id
      returning * into updated;
  elsif p_permanent or event.attempts >= event.max_attempts then
    update public.outbox_events set
      status = 'dead_letter', processed_at = now(), locked_at = null, locked_by = null, last_error = trimmed_error, updated_at = now()
      where id = p_event_id
      returning * into updated;
  else
    update public.outbox_events set
      status = 'pending', available_at = now() + make_interval(secs => private.outbox_backoff_seconds(event.attempts)),
      locked_at = null, locked_by = null, last_error = trimmed_error, updated_at = now()
      where id = p_event_id
      returning * into updated;
  end if;

  return updated;
end;
$$;

revoke all on function public.claim_outbox_events(text, integer, integer) from public, authenticated, anon;
revoke all on function public.complete_outbox_event(uuid, text, boolean, boolean, text) from public, authenticated, anon;
grant execute on function public.claim_outbox_events(text, integer, integer) to service_role;
grant execute on function public.complete_outbox_event(uuid, text, boolean, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- submit_report redefined (not duplicated): adds exactly one insert -- a 'report.created'
-- v1 outbox event, in the same transaction as the report row and its existing audit
-- event. Every other line is unchanged from 202608270001. This is the slice's one
-- reference integration; no other existing RPC is modified.
-- ---------------------------------------------------------------------------

create or replace function public.submit_report(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  target_input text,
  p_title text,
  p_description text
)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  trimmed_title text := trim(p_title);
  trimmed_description text := trim(p_description);
  canon record;
  match_result record;
  new_report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not private.is_researcher_authorized_for_program(target_program_id) then
    raise exception 'FORBIDDEN: actor is not an authorized researcher for this program' using errcode = '42501';
  end if;

  if program.status in ('paused', 'closed') then
    raise exception 'SUBMISSIONS_CLOSED: this program is not currently accepting reports' using errcode = '55000';
  end if;

  if trimmed_title is null or char_length(trimmed_title) = 0 then
    raise exception 'INVALID_TITLE: Enter a report title.' using errcode = '22023';
  end if;
  if char_length(trimmed_title) > 200 then
    raise exception 'INVALID_TITLE: Use 200 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_TITLE: Report title contains invalid characters.' using errcode = '22023';
  end if;

  if trimmed_description is null or char_length(trimmed_description) = 0 then
    raise exception 'INVALID_DESCRIPTION: Enter a description.' using errcode = '22023';
  end if;
  if char_length(trimmed_description) > 20000 then
    raise exception 'INVALID_DESCRIPTION: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);
  select * into match_result from private.match_program_scope(target_program_id, p_asset_type, canon.canonical, canon.cidr_value, canon.url_origin, canon.url_path);

  if match_result.matched_entry_id is null or match_result.matched_scope_state <> 'in_scope' then
    raise exception 'TARGET_NOT_ELIGIBLE: This target is not currently eligible for this program.' using errcode = '22023';
  end if;

  insert into public.reports (program_id, organization_id, researcher_id, title, description, asset_type, target, display_target, matched_scope_entry_id, matched_scope_state, matched_target)
  values (target_program_id, program.organization_id, actor, trimmed_title, trimmed_description, p_asset_type, canon.canonical, canon.display, match_result.matched_entry_id, match_result.matched_scope_state, match_result.matched_target)
  returning * into new_report;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'report.created', 'report', new_report.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values (
    'report.created', 1, 'report', new_report.id, program.organization_id,
    jsonb_build_object(
      'report_id', new_report.id, 'program_id', target_program_id, 'organization_id', program.organization_id,
      'researcher_id', actor, 'title', trimmed_title, 'asset_type', p_asset_type, 'display_target', canon.display
    )
  );

  return new_report;
end;
$$;

revoke all on function public.submit_report(uuid, public.program_asset_type, text, text, text) from public;
grant execute on function public.submit_report(uuid, public.program_asset_type, text, text, text) to authenticated;
