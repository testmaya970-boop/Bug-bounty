-- CTF hints, write-ups and track badges.
--
--  1. Hints: 1-3 progressive hints per challenge, each with a point cost. The text lives only
--     here and is returned only by take_ctf_hint / list_ctf_hints for a hint the caller has
--     taken. A taken hint lowers what a later solve awards (practice score and event score).
--  2. Write-ups: an official write-up per challenge, plus one short plain-text write-up per
--     solver. Both are readable only by researchers who solved the challenge.
--  3. Track badges: solving every challenge in a track stores a badge, once.
-- Content (hint text, official write-ups) is seeded in 202610220011.

-- ---------------------------------------------------------------------------
-- 1. Hints
-- ---------------------------------------------------------------------------

create table public.ctf_hints (
  challenge_id text not null references public.ctf_challenges(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  cost integer not null check (cost > 0),
  body text not null,
  primary key (challenge_id, position)
);
alter table public.ctf_hints enable row level security;
-- No client read at all: hint text is only handed out by the definer functions below.
revoke all on public.ctf_hints from anon, authenticated;
grant select, insert, update, delete on public.ctf_hints to service_role;

create table public.ctf_hint_unlocks (
  researcher_id uuid not null references public.users(id) on delete restrict,
  challenge_id text not null,
  position smallint not null,
  unlocked_at timestamptz not null default now(),
  primary key (researcher_id, challenge_id, position),
  foreign key (challenge_id, position) references public.ctf_hints(challenge_id, position) on delete cascade
);
alter table public.ctf_hint_unlocks enable row level security;
create policy "ctf hint unlocks read own" on public.ctf_hint_unlocks for select to authenticated using (researcher_id = auth.uid());
revoke all on public.ctf_hint_unlocks from anon, authenticated;
grant select on public.ctf_hint_unlocks to authenticated;
grant select, insert on public.ctf_hint_unlocks to service_role;

-- Every hint of a challenge with its cost; the text only for hints the caller has taken.
create or replace function public.list_ctf_hints(p_challenge_id text)
returns table (hint_position smallint, cost integer, taken boolean, body text)
language sql stable security definer set search_path = ''
as $$
  select h.position, h.cost, u.researcher_id is not null, case when u.researcher_id is not null then h.body end
  from public.ctf_hints h
  left join public.ctf_hint_unlocks u on u.challenge_id = h.challenge_id and u.position = h.position and u.researcher_id = auth.uid()
  where h.challenge_id = p_challenge_id and auth.uid() is not null
  order by h.position;
$$;
revoke all on function public.list_ctf_hints(text) from public;
grant execute on function public.list_ctf_hints(text) to authenticated;

-- Takes a hint (idempotent) and returns its text. Hints are progressive: every earlier hint
-- of the challenge must be taken first.
create or replace function public.take_ctf_hint(p_challenge_id text, p_position integer)
returns table (hint_position smallint, cost integer, body text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  hint public.ctf_hints;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.actor_is_active() or exists (select 1 from public.users u where u.id = actor and u.account_type = 'organization') then
    raise exception 'FORBIDDEN: this account cannot take part in CTF challenges' using errcode = '42501';
  end if;

  select * into hint from public.ctf_hints h where h.challenge_id = p_challenge_id and h.position = p_position;
  if hint.challenge_id is null then raise exception 'HINT_NOT_FOUND: unknown hint' using errcode = 'P0002'; end if;

  if exists (
    select 1 from public.ctf_hints h
    where h.challenge_id = p_challenge_id and h.position < p_position
      and not exists (select 1 from public.ctf_hint_unlocks u where u.researcher_id = actor and u.challenge_id = h.challenge_id and u.position = h.position)
  ) then
    raise exception 'HINT_LOCKED: take the earlier hints first' using errcode = '23514';
  end if;

  insert into public.ctf_hint_unlocks (researcher_id, challenge_id, position)
  values (actor, p_challenge_id, hint.position)
  on conflict do nothing;

  hint_position := hint.position; cost := hint.cost; body := hint.body;
  return next;
end;
$$;
revoke all on function public.take_ctf_hint(text, integer) from public;
grant execute on function public.take_ctf_hint(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Write-ups
-- ---------------------------------------------------------------------------

create table public.ctf_official_writeups (
  challenge_id text primary key references public.ctf_challenges(id) on delete cascade,
  body text not null
);
alter table public.ctf_official_writeups enable row level security;
revoke all on public.ctf_official_writeups from anon, authenticated;
grant select, insert, update, delete on public.ctf_official_writeups to service_role;

-- One write-up per solver and challenge. Plain text only: 40 to 2000 characters, no control
-- characters, nothing that looks like markup. Rendered as text, never as HTML or Markdown.
create table public.ctf_writeups (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null references public.ctf_challenges(id) on delete cascade,
  researcher_id uuid not null references public.users(id) on delete restrict,
  body text not null check (
    char_length(body) between 40 and 2000
    and body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
    and body !~ '<[A-Za-z!/?]'
  ),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, researcher_id)
);
alter table public.ctf_writeups enable row level security;
create policy "ctf writeups read own" on public.ctf_writeups for select to authenticated using (researcher_id = auth.uid());
revoke all on public.ctf_writeups from anon, authenticated;
grant select on public.ctf_writeups to authenticated;
grant select, insert, update, delete on public.ctf_writeups to service_role;

-- The official write-up first, then the caller's own, then other solvers' newest first.
-- Only for a caller who solved the challenge.
create or replace function public.get_ctf_writeups(p_challenge_id text)
returns table (writeup_id uuid, is_official boolean, author_name text, body text, published_at timestamptz, is_mine boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.ctf_solves s where s.researcher_id = actor and s.challenge_id = p_challenge_id) then
    raise exception 'NOT_SOLVED: solve this challenge to read its write-ups' using errcode = '42501';
  end if;

  return query
    select q.writeup_id, q.is_official, q.author_name, q.body, q.published_at, q.is_mine
    from (
      select null::uuid as writeup_id, true as is_official, 'Unpatched'::text as author_name, o.body, null::timestamptz as published_at, false as is_mine
      from public.ctf_official_writeups o where o.challenge_id = p_challenge_id
      union all
      select w.id, false, coalesce(u.public_username, u.display_name), w.body, w.updated_at, w.researcher_id = actor
      from public.ctf_writeups w join public.users u on u.id = w.researcher_id
      where w.challenge_id = p_challenge_id
        and (w.researcher_id = actor or (u.deactivated_at is null and not u.is_suspended))
    ) q
    order by q.is_official desc, q.is_mine desc, q.published_at desc;
end;
$$;
revoke all on function public.get_ctf_writeups(text) from public;
grant execute on function public.get_ctf_writeups(text) to authenticated;

-- Publishes or replaces the caller's own write-up for a challenge they solved.
create or replace function public.publish_ctf_writeup(p_challenge_id text, p_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean text := btrim(replace(coalesce(p_body, ''), E'\r\n', E'\n'));
  saved uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.actor_is_active() then raise exception 'FORBIDDEN: this account cannot publish write-ups' using errcode = '42501'; end if;
  if not exists (select 1 from public.ctf_solves s where s.researcher_id = actor and s.challenge_id = p_challenge_id) then
    raise exception 'NOT_SOLVED: solve this challenge before publishing a write-up' using errcode = '42501';
  end if;
  if char_length(clean) < 40 then raise exception 'WRITEUP_TOO_SHORT: write at least 40 characters' using errcode = '22023'; end if;
  if char_length(clean) > 2000 then raise exception 'WRITEUP_TOO_LONG: keep it under 2000 characters' using errcode = '22023'; end if;
  if clean ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' or clean ~ '<[A-Za-z!/?]' then
    raise exception 'WRITEUP_NOT_PLAIN_TEXT: write-ups are plain text -- remove HTML tags and control characters' using errcode = '22023';
  end if;

  insert into public.ctf_writeups (challenge_id, researcher_id, body)
  values (p_challenge_id, actor, clean)
  on conflict (challenge_id, researcher_id) do update set body = excluded.body, updated_at = now()
  returning id into saved;
  return saved;
end;
$$;
revoke all on function public.publish_ctf_writeup(text, text) from public;
grant execute on function public.publish_ctf_writeup(text, text) to authenticated;

create or replace function public.delete_my_ctf_writeup(p_challenge_id text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.ctf_writeups where challenge_id = p_challenge_id and researcher_id = auth.uid();
$$;
revoke all on function public.delete_my_ctf_writeup(text) from public;
grant execute on function public.delete_my_ctf_writeup(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tracks and track badges (track content mirrors lib/mock/ctf.ts; only live tracks)
-- ---------------------------------------------------------------------------

create table public.ctf_tracks (
  id text primary key,
  label text not null
);
create table public.ctf_track_challenges (
  track_id text not null references public.ctf_tracks(id) on delete cascade,
  challenge_id text not null references public.ctf_challenges(id) on delete restrict,
  primary key (track_id, challenge_id)
);
alter table public.ctf_tracks enable row level security;
alter table public.ctf_track_challenges enable row level security;
revoke all on public.ctf_tracks, public.ctf_track_challenges from anon, authenticated;
grant select, insert, update, delete on public.ctf_tracks, public.ctf_track_challenges to service_role;

insert into public.ctf_tracks (id, label) values
  ('trk-crypto-basics', 'Cryptography basics'),
  ('trk-reversing-intro', 'Intro to reverse engineering'),
  ('trk-network-basics', 'Network fundamentals');
insert into public.ctf_track_challenges (track_id, challenge_id) values
  ('trk-crypto-basics', 'c-crypto-1'), ('trk-crypto-basics', 'c-crypto-2'),
  ('trk-reversing-intro', 'c-re-1'), ('trk-reversing-intro', 'c-re-2'),
  ('trk-network-basics', 'c-network-1'), ('trk-network-basics', 'c-network-2');

create table public.ctf_track_badges (
  researcher_id uuid not null references public.users(id) on delete restrict,
  track_id text not null references public.ctf_tracks(id) on delete restrict,
  awarded_at timestamptz not null default now(),
  primary key (researcher_id, track_id)
);
alter table public.ctf_track_badges enable row level security;
create policy "ctf track badges read own" on public.ctf_track_badges for select to authenticated using (researcher_id = auth.uid());
revoke all on public.ctf_track_badges from anon, authenticated;
grant select on public.ctf_track_badges to authenticated;
grant select, insert on public.ctf_track_badges to service_role;

-- Researchers who already finished a track before badges existed.
insert into public.ctf_track_badges (researcher_id, track_id, awarded_at)
select s.researcher_id, tc.track_id, max(s.solved_at)
from public.ctf_track_challenges tc
join public.ctf_solves s on s.challenge_id = tc.challenge_id
group by s.researcher_id, tc.track_id
having count(*) = (select count(*) from public.ctf_track_challenges x where x.track_id = tc.track_id)
on conflict do nothing;

-- A researcher's track badges, under the same visibility rule as get_researcher_badges
-- (self, or an opted-in public profile).
create or replace function public.get_researcher_ctf_badges(p_researcher_id uuid)
returns table (track_id text, label text, awarded_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.track_id, t.label, b.awarded_at
  from public.ctf_track_badges b join public.ctf_tracks t on t.id = b.track_id
  where b.researcher_id = p_researcher_id and private.researcher_badges_visible(p_researcher_id)
  order by b.awarded_at, b.track_id;
$$;
revoke all on function public.get_researcher_ctf_badges(uuid) from public;
grant execute on function public.get_researcher_ctf_badges(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. submit_ctf_flag (from 202610130002): the award is the challenge's points minus the
--    cost of the hints taken so far, for the practice solve and any event credit; a correct
--    submission also stores any track badge it completes.
-- ---------------------------------------------------------------------------

create or replace function public.submit_ctf_flag(p_challenge_id text, p_flag text)
returns table (correct boolean, points_awarded integer, already_solved boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  challenge public.ctf_challenges;
  newly_solved boolean := false;
  event_credits integer := 0;
  hint_cost integer;
  award integer;
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

  select coalesce(sum(h.cost), 0) into hint_cost
  from public.ctf_hint_unlocks u
  join public.ctf_hints h on h.challenge_id = u.challenge_id and h.position = u.position
  where u.researcher_id = actor and u.challenge_id = p_challenge_id;
  award := greatest(challenge.points - hint_cost, 0);

  -- Practice score and reputation: once per researcher and challenge, ever.
  insert into public.ctf_solves (researcher_id, challenge_id, points_awarded)
  values (actor, p_challenge_id, award)
  on conflict (researcher_id, challenge_id) do nothing;
  if found then
    insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, source_event_id, event_type, schema_version, occurred_at)
    values (actor, null, null, null, 'ctf_challenge_solved', null, 'ctf.solved', 1, now());
    newly_solved := true;
  end if;

  -- Events: once per event, even for a challenge solved before the event opened.
  with credited as (
    insert into public.ctf_event_solves (event_id, researcher_id, challenge_id, points_awarded, solved_at)
    select e.id, actor, p_challenge_id, award, now()
    from public.ctf_events e
    join public.ctf_event_challenges c on c.event_id = e.id and c.challenge_id = p_challenge_id
    where e.status <> 'draft' and now() >= e.starts_at and now() < e.ends_at
    on conflict (event_id, researcher_id, challenge_id) do nothing
    returning 1
  )
  select count(*) into event_credits from credited;

  -- Track badges this solve completes (idempotent).
  insert into public.ctf_track_badges (researcher_id, track_id)
  select actor, tc.track_id
  from public.ctf_track_challenges tc
  where tc.track_id in (select x.track_id from public.ctf_track_challenges x where x.challenge_id = p_challenge_id)
  group by tc.track_id
  having bool_and(exists (select 1 from public.ctf_solves s where s.researcher_id = actor and s.challenge_id = tc.challenge_id))
  on conflict do nothing;

  correct := true;
  already_solved := not newly_solved and event_credits = 0;
  points_awarded := case when already_solved then 0 else award end;
  return next;
end;
$$;
