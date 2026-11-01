-- Timed CTF events (docs/decisions/0081). Adds competition events on top of the existing,
-- always-open practice library (the 28 ctf_challenges from 202609050001, unchanged): an
-- event picks a SUBSET of those same challenges, opens for a start/end window, and has its
-- own leaderboard. Challenge content is never duplicated -- an event references existing
-- challenge ids.
--
-- ---------------------------------------------------------------------------
-- Leaderboard-attribution model (the one real design choice here), and why:
--
-- A flag submitted for a challenge that is inside a currently-active event must (a) still
-- go through the SAME server-side verification as a practice solve -- submit_ctf_flag,
-- unforked -- and (b) also count toward that event's own leaderboard. Two models were
-- considered:
--
--   1. Add event_id to ctf_solves. Rejected: ctf_solves has unique(researcher_id,
--      challenge_id) -- one solve per challenge per researcher, EVER. A challenge can belong
--      to several events, and a challenge solved in practice must not be silently credited to
--      an event it wasn't solved during. A single nullable event_id column cannot express
--      "counts for event A and event B" and fights that unique constraint.
--
--   2. A separate attribution table, ctf_event_solves, written at solve time for every
--      active event the challenge belongs to. CHOSEN. It is the honest, simpler model: the
--      practice solve (ctf_solves) stays exactly what it was -- the one durable "you solved
--      this challenge" fact and the sole provenance for the reputation_ledger fact -- and an
--      event standing is a derived, time-scoped attribution layered on top. The time-window
--      rule falls out naturally: attribution rows are only ever written while now() is inside
--      an event's [starts_at, ends_at) window, so a challenge solved before an event opened,
--      or after it ended, is correctly NOT on that event's board. An event leaderboard is a
--      plain aggregate over ctf_event_solves. No verification logic is duplicated:
--      submit_ctf_flag is redefined (same signature, same return, same reputation fact) with
--      one extra step appended -- fan out an attribution row per active event.
--
-- Tradeoff accepted: event attribution happens at solve time, so it credits solves made
-- DURING the window only (which is exactly what a timed competition wants). It deliberately
-- does NOT retroactively credit a challenge a researcher had already solved in practice
-- before the event started -- in a real CTF you must (re)capture the flag during the event.
-- That is the intended competition semantics, disclosed here rather than assumed.
--
-- The global /ctf practice leaderboard stays mock and is now labelled "practice library,
-- not ranked" in the UI (it never claimed a real ranking); the REAL, ranked leaderboards
-- are the per-event ones this migration introduces (get_ctf_event_leaderboard).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Event status enum. In its OWN concern from any use of its values below? No new-enum-
--    in-same-transaction hazard here: this CREATE TYPE and every statement that uses the
--    values live in one file/one transaction, which is fine -- the hazard is only for
--    ALTER TYPE ... ADD VALUE, never CREATE TYPE (a freshly created enum's values are usable
--    in the same transaction). Modeled on public.program_status's own multi-state shape.
--
--    'draft'/'scheduled'/'active'/'ended' is the admin's STORED intent. The genuinely
--    time-derived state (is it open right now?) is computed from starts_at/ends_at by the
--    read RPCs below (ctf_event_effective_status) -- the stored status gates whether an event
--    is published at all (draft = hidden), the window decides whether a published event is
--    upcoming / open / over.
-- ---------------------------------------------------------------------------

create type public.ctf_event_status as enum ('draft', 'scheduled', 'active', 'ended');

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------

create table public.ctf_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.ctf_event_status not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctf_events_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ctf_events_name_len check (char_length(name) between 1 and 120),
  constraint ctf_events_description_len check (char_length(description) <= 4000),
  constraint ctf_events_window check (ends_at > starts_at)
);
create index ctf_events_status_starts_idx on public.ctf_events(status, starts_at);

alter table public.ctf_events enable row level security;
-- A published event (anything but draft) is readable by any signed-in user -- the event
-- list and detail are the competition surface. Drafts are visible only through the
-- platform-admin RPCs (which re-check is_platform_admin), never this policy.
create policy "ctf events published are readable by authenticated" on public.ctf_events
  for select to authenticated using (status <> 'draft');
revoke all on public.ctf_events from anon, authenticated;
grant select on public.ctf_events to authenticated;
grant select, insert, update, delete on public.ctf_events to service_role;

create table public.ctf_event_challenges (
  event_id uuid not null references public.ctf_events(id) on delete cascade,
  challenge_id text not null references public.ctf_challenges(id) on delete restrict,
  primary key (event_id, challenge_id)
);
create index ctf_event_challenges_challenge_idx on public.ctf_event_challenges(challenge_id);

alter table public.ctf_event_challenges enable row level security;
-- Readable when its parent event is readable (published). RLS on the parent already hides
-- draft events; this mirrors it so a draft event's challenge set is equally hidden.
create policy "ctf event challenges readable when event is published" on public.ctf_event_challenges
  for select to authenticated using (
    exists (select 1 from public.ctf_events e where e.id = event_id and e.status <> 'draft')
  );
revoke all on public.ctf_event_challenges from anon, authenticated;
grant select on public.ctf_event_challenges to authenticated;
grant select, insert, delete on public.ctf_event_challenges to service_role;

-- Attribution: one row per (event, researcher, challenge) captured at solve time, written
-- by submit_ctf_flag only while the event window is open. The unique PK makes the fan-out
-- idempotent (a researcher can only solve a challenge once anyway, but this is belt-and-
-- braces). points_awarded is copied from the challenge at solve time so the leaderboard
-- never re-reads (and never drifts if a challenge's points were ever changed later).
create table public.ctf_event_solves (
  event_id uuid not null references public.ctf_events(id) on delete cascade,
  researcher_id uuid not null references public.users(id) on delete restrict,
  challenge_id text not null references public.ctf_challenges(id) on delete restrict,
  points_awarded integer not null,
  solved_at timestamptz not null default now(),
  primary key (event_id, researcher_id, challenge_id)
);
create index ctf_event_solves_event_idx on public.ctf_event_solves(event_id);

alter table public.ctf_event_solves enable row level security;
-- A researcher reads only their own event attributions directly; the ranked leaderboard is
-- exposed through get_ctf_event_leaderboard (SECURITY DEFINER), the same way the global
-- reputation leaderboard exposes aggregates without a broad table read.
create policy "ctf event solves read own" on public.ctf_event_solves
  for select to authenticated using (researcher_id = auth.uid());
revoke all on public.ctf_event_solves from anon, authenticated;
grant select on public.ctf_event_solves to authenticated;
grant select, insert on public.ctf_event_solves to service_role;

-- ---------------------------------------------------------------------------
-- 3. Effective-status helper: the stored status combined with the clock. Draft stays draft;
--    otherwise the window decides upcoming/active/ended. Kept as a small immutable-ish SQL
--    helper so every read path computes it identically.
-- ---------------------------------------------------------------------------

create or replace function public.ctf_event_effective_status(p_status public.ctf_event_status, p_starts_at timestamptz, p_ends_at timestamptz)
returns text
language sql immutable
as $$
  select case
    when p_status = 'draft' then 'draft'
    when now() < p_starts_at then 'upcoming'
    when now() >= p_starts_at and now() < p_ends_at then 'active'
    else 'ended'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reads open to any authenticated user (published events only).
-- ---------------------------------------------------------------------------

-- The event list: published events, newest window first, each with its challenge count and
-- effective (clock-derived) status. Never returns drafts.
create or replace function public.list_ctf_events()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  effective_status text,
  challenge_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    e.id, e.slug, e.name, e.description, e.starts_at, e.ends_at,
    public.ctf_event_effective_status(e.status, e.starts_at, e.ends_at),
    (select count(*) from public.ctf_event_challenges c where c.event_id = e.id)
  from public.ctf_events e
  where e.status <> 'draft'
  order by e.starts_at desc;
$$;

revoke all on function public.list_ctf_events() from public;
grant execute on function public.list_ctf_events() to authenticated;

-- One event by slug, with its challenge set (id + points; never flag_hash), plus whether the
-- calling researcher has already solved each within this event. A draft event returns no
-- rows for a non-admin (RLS-equivalent: the where-clause excludes drafts), so the detail
-- page 404s exactly like an unknown slug.
create or replace function public.get_ctf_event_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  effective_status text,
  challenge_id text,
  points integer,
  solved_in_event boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    e.id, e.slug, e.name, e.description, e.starts_at, e.ends_at,
    public.ctf_event_effective_status(e.status, e.starts_at, e.ends_at),
    c.challenge_id,
    ch.points,
    exists (
      select 1 from public.ctf_event_solves s
      where s.event_id = e.id and s.challenge_id = c.challenge_id and s.researcher_id = auth.uid()
    )
  from public.ctf_events e
  join public.ctf_event_challenges c on c.event_id = e.id
  join public.ctf_challenges ch on ch.id = c.challenge_id
  where e.slug = p_slug and e.status <> 'draft'
  order by ch.points asc, c.challenge_id asc;
$$;

revoke all on function public.get_ctf_event_by_slug(text) from public;
grant execute on function public.get_ctf_event_by_slug(text) to authenticated;

-- The real, ranked per-event leaderboard: aggregate ctf_event_solves for the event. Highest
-- points first, then most challenges, then earliest last-solve (rewards finishing sooner),
-- then researcher id for a stable order. Exposes display_name/public_username the same,
-- narrow way get_public_leaderboard already does.
create or replace function public.get_ctf_event_leaderboard(p_event_id uuid, p_limit integer default 100)
returns table (
  rank bigint,
  researcher_id uuid,
  display_name text,
  public_username text,
  event_points bigint,
  challenges_solved bigint,
  last_solved_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    row_number() over (order by sum(s.points_awarded) desc, count(*) desc, max(s.solved_at) asc, s.researcher_id asc) as rank,
    s.researcher_id,
    u.display_name,
    u.public_username,
    sum(s.points_awarded)::bigint as event_points,
    count(*)::bigint as challenges_solved,
    max(s.solved_at) as last_solved_at
  from public.ctf_event_solves s
  join public.users u on u.id = s.researcher_id
  where s.event_id = p_event_id
  group by s.researcher_id, u.display_name, u.public_username
  order by rank
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.get_ctf_event_leaderboard(uuid, integer) from public;
grant execute on function public.get_ctf_event_leaderboard(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. submit_ctf_flag, REDEFINED (same signature, same return shape, same reputation fact)
--    with one appended step: on a first correct solve, fan out a ctf_event_solves row for
--    every event that (a) contains this challenge and (b) is open right now. Verification is
--    NOT duplicated -- this is the identical hash-compare + ctf_solves insert + reputation
--    fact as 202609050001, with the event attribution added after the solve is recorded.
-- ---------------------------------------------------------------------------

create or replace function public.submit_ctf_flag(p_challenge_id text, p_flag text)
returns table (correct boolean, points_awarded integer, already_solved boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  challenge public.ctf_challenges;
  existing public.ctf_solves;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into challenge from public.ctf_challenges where id = p_challenge_id;
  if challenge.id is null then raise exception 'CHALLENGE_NOT_FOUND: unknown challenge' using errcode = 'P0002'; end if;

  select * into existing from public.ctf_solves where researcher_id = actor and challenge_id = p_challenge_id;
  if existing.id is not null then
    correct := true; points_awarded := 0; already_solved := true; return next; return;
  end if;

  if p_flag is null or encode(extensions.digest(trim(p_flag), 'sha256'), 'hex') <> challenge.flag_hash then
    correct := false; points_awarded := 0; already_solved := false; return next; return;
  end if;

  insert into public.ctf_solves (researcher_id, challenge_id, points_awarded)
  values (actor, p_challenge_id, challenge.points);

  insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, source_event_id, event_type, schema_version, occurred_at)
  values (actor, null, null, null, 'ctf_challenge_solved', null, 'ctf.solved', 1, now());

  -- Event attribution: credit this solve to every OPEN event that includes the challenge.
  -- The window check (now() within [starts_at, ends_at)) is what makes attribution
  -- time-scoped; a solve outside every event's window simply inserts nothing here. Idempotent
  -- via ctf_event_solves' PK (on conflict do nothing) -- a challenge is only solvable once
  -- per researcher anyway, but this keeps a re-run/retry from ever raising.
  insert into public.ctf_event_solves (event_id, researcher_id, challenge_id, points_awarded, solved_at)
  select e.id, actor, p_challenge_id, challenge.points, now()
  from public.ctf_events e
  join public.ctf_event_challenges c on c.event_id = e.id and c.challenge_id = p_challenge_id
  where e.status <> 'draft' and now() >= e.starts_at and now() < e.ends_at
  on conflict (event_id, researcher_id, challenge_id) do nothing;

  correct := true; points_awarded := challenge.points; already_solved := false; return next;
end;
$$;

revoke all on function public.submit_ctf_flag(text, text) from public;
grant execute on function public.submit_ctf_flag(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Platform-admin CRUD. Every function independently re-checks private.is_platform_admin()
--    inside its own body (never trusts caller-side gating) and writes a platform.* audit_logs
--    row -- the exact conventions activate_program / suspend_organization already follow.
--    audit_logs.organization_id is null (a platform-wide action, not org-scoped), matching
--    grant_platform_admin's own null-org audit rows.
-- ---------------------------------------------------------------------------

create or replace function public.create_ctf_event(p_slug text, p_name text, p_description text, p_starts_at timestamptz, p_ends_at timestamptz, p_status public.ctf_event_status default 'scheduled')
returns public.ctf_events
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created public.ctf_events;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID_EVENT: slug must be lowercase words separated by hyphens' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'INVALID_EVENT: name is required' using errcode = '22023'; end if;
  if p_ends_at <= p_starts_at then raise exception 'INVALID_EVENT: end must be after start' using errcode = '22023'; end if;
  if exists (select 1 from public.ctf_events where slug = p_slug) then raise exception 'DUPLICATE_EVENT: an event with this slug already exists' using errcode = '23505'; end if;

  insert into public.ctf_events (slug, name, description, starts_at, ends_at, status, created_by)
  values (p_slug, trim(p_name), coalesce(trim(p_description), ''), p_starts_at, p_ends_at, coalesce(p_status, 'scheduled'), actor)
  returning * into created;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.ctf_event_created', 'ctf_event', created.id, jsonb_build_object('slug', created.slug, 'name', created.name));

  return created;
end;
$$;

revoke all on function public.create_ctf_event(text, text, text, timestamptz, timestamptz, public.ctf_event_status) from public, authenticated, anon;
grant execute on function public.create_ctf_event(text, text, text, timestamptz, timestamptz, public.ctf_event_status) to authenticated;

create or replace function public.update_ctf_event(p_event_id uuid, p_name text, p_description text, p_starts_at timestamptz, p_ends_at timestamptz, p_status public.ctf_event_status)
returns public.ctf_events
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  updated public.ctf_events;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'INVALID_EVENT: name is required' using errcode = '22023'; end if;
  if p_ends_at <= p_starts_at then raise exception 'INVALID_EVENT: end must be after start' using errcode = '22023'; end if;

  update public.ctf_events
    set name = trim(p_name), description = coalesce(trim(p_description), ''), starts_at = p_starts_at, ends_at = p_ends_at, status = p_status, updated_at = now()
    where id = p_event_id
    returning * into updated;
  if updated.id is null then raise exception 'EVENT_NOT_FOUND: event not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.ctf_event_updated', 'ctf_event', updated.id, jsonb_build_object('slug', updated.slug, 'status', updated.status));

  return updated;
end;
$$;

revoke all on function public.update_ctf_event(uuid, text, text, timestamptz, timestamptz, public.ctf_event_status) from public, authenticated, anon;
grant execute on function public.update_ctf_event(uuid, text, text, timestamptz, timestamptz, public.ctf_event_status) to authenticated;

-- Set an event's challenge set wholesale: replace the join rows with exactly p_challenge_ids.
-- Rejects unknown challenge ids (FK would anyway, but a clear message is better). Idempotent.
create or replace function public.set_ctf_event_challenges(p_event_id uuid, p_challenge_ids text[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  event public.ctf_events;
  bad_id text;
  inserted_count integer;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;

  select * into event from public.ctf_events where id = p_event_id;
  if event.id is null then raise exception 'EVENT_NOT_FOUND: event not found' using errcode = 'P0002'; end if;

  select cid into bad_id from unnest(coalesce(p_challenge_ids, array[]::text[])) as cid
    where not exists (select 1 from public.ctf_challenges ch where ch.id = cid) limit 1;
  if bad_id is not null then raise exception 'UNKNOWN_CHALLENGE: no such challenge %', bad_id using errcode = 'P0002'; end if;

  delete from public.ctf_event_challenges where event_id = p_event_id;
  insert into public.ctf_event_challenges (event_id, challenge_id)
    select p_event_id, cid from unnest(coalesce(p_challenge_ids, array[]::text[])) as cid
    on conflict do nothing;
  get diagnostics inserted_count = row_count;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.ctf_event_challenges_set', 'ctf_event', p_event_id, jsonb_build_object('count', inserted_count));

  return inserted_count;
end;
$$;

revoke all on function public.set_ctf_event_challenges(uuid, text[]) from public, authenticated, anon;
grant execute on function public.set_ctf_event_challenges(uuid, text[]) to authenticated;

-- The admin's own list -- includes drafts (unlike list_ctf_events). Same is_platform_admin
-- re-check + shape as the other "list X for admin" RPCs.
create or replace function public.list_ctf_events_for_admin()
returns table (
  id uuid,
  slug text,
  name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.ctf_event_status,
  effective_status text,
  challenge_count bigint,
  solver_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;

  return query
  select
    e.id, e.slug, e.name, e.starts_at, e.ends_at, e.status,
    public.ctf_event_effective_status(e.status, e.starts_at, e.ends_at),
    (select count(*) from public.ctf_event_challenges c where c.event_id = e.id),
    (select count(distinct s.researcher_id) from public.ctf_event_solves s where s.event_id = e.id)
  from public.ctf_events e
  order by e.starts_at desc;
end;
$$;

revoke all on function public.list_ctf_events_for_admin() from public, authenticated, anon;
grant execute on function public.list_ctf_events_for_admin() to authenticated;

-- One event's full config for the admin edit screen (includes its challenge id set and works
-- for drafts). Returns the event row fields plus an array of its challenge ids.
create or replace function public.get_ctf_event_for_admin(p_event_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.ctf_event_status,
  challenge_ids text[]
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;

  return query
  select
    e.id, e.slug, e.name, e.description, e.starts_at, e.ends_at, e.status,
    coalesce((select array_agg(c.challenge_id order by c.challenge_id) from public.ctf_event_challenges c where c.event_id = e.id), array[]::text[])
  from public.ctf_events e
  where e.id = p_event_id;
end;
$$;

revoke all on function public.get_ctf_event_for_admin(uuid) from public, authenticated, anon;
grant execute on function public.get_ctf_event_for_admin(uuid) to authenticated;
