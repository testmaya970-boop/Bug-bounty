-- Reputation scoring, public leaderboard, and public researcher profiles. Design
-- decisions recorded in docs/decisions/0065-reputation-scoring-leaderboard-and-public-
-- profile.md, which formally supersedes 0016's "no score, ranking, badge, or leaderboard
-- exists" clause and 0038/0039/0049's prior rejection of a public profile/directory.
--
-- The reputation_ledger table itself (202608290003) is completely untouched by this
-- migration -- no new column, no new fact_type, no change to its append-only trigger or
-- its RLS. Every new object below is a read-side aggregation over that same, unchanged
-- table, exactly as 0016 itself anticipated ("a future scoring algorithm can change its
-- weighting of these same facts without any migration to the underlying history").

-- ---------------------------------------------------------------------------
-- 1. A real, chosen, collision-checked public username -- 0049 section F's named
--    prerequisite for any public-profile discussion. Nullable: choosing one is an
--    explicit researcher action, not automatic. A partial unique index on lower(username)
--    gives case-insensitive collision detection without adding the citext extension this
--    codebase does not otherwise depend on.
-- ---------------------------------------------------------------------------

alter table public.users add column public_username text check (public_username ~ '^[a-z0-9-]{3,30}$');
create unique index users_public_username_lower_idx on public.users (lower(public_username)) where public_username is not null;

create or replace function public.set_my_public_username(p_username text)
returns public.users
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized text := lower(trim(coalesce(p_username, '')));
  updated public.users;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if normalized = '' then
    -- Explicit clear: a researcher may remove their public username, which also removes
    -- their public profile (get_public_researcher_profile below returns nothing for a
    -- username no one holds).
    update public.users set public_username = null, updated_at = now() where id = actor returning * into updated;
    return updated;
  end if;

  if normalized !~ '^[a-z0-9-]{3,30}$' then
    raise exception 'INVALID_USERNAME: Use 3-30 lowercase letters, numbers, or hyphens.' using errcode = '22023';
  end if;

  if exists (select 1 from public.users where lower(public_username) = normalized and id <> actor) then
    raise exception 'USERNAME_TAKEN: That username is already in use.' using errcode = '23505';
  end if;

  update public.users set public_username = normalized, updated_at = now() where id = actor returning * into updated;
  return updated;
end;
$$;

revoke all on function public.set_my_public_username(text) from public;
grant execute on function public.set_my_public_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The score formula, computed read-side. `stable` (not `volatile`) since it only
--    reads; `security definer` so it can read reputation_ledger rows belonging to any
--    researcher (RLS on that table would otherwise only admit the owning researcher or
--    their report's own organization) -- the one deliberate, explicit widening of
--    reputation_ledger's read surface this migration makes, and it exposes only the
--    computed aggregate, never a raw row.
--
--    resolved x 25, bounty_finalized x 10, rejected x -5. duplicate/informative/
--    not_applicable are weighted zero -- a direct continuation of 0016's own reasoning
--    that those outcomes are not evidence of researcher quality either way. See 0065 for
--    the full rationale.
-- ---------------------------------------------------------------------------

create or replace function public.get_researcher_reputation_score(p_researcher_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(
    case fact_type
      when 'report_resolved' then 25
      when 'bounty_finalized' then 10
      when 'report_rejected' then -5
      else 0
    end
  ), 0)
  from public.reputation_ledger
  where researcher_id = p_researcher_id;
$$;

revoke all on function public.get_researcher_reputation_score(uuid) from public;
grant execute on function public.get_researcher_reputation_score(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. The public leaderboard. Only researchers with at least one reputation_ledger fact
--    appear -- a researcher with zero history is absent, never shown at score 0 alongside
--    people with real verified outcomes. Ties broken by resolved_count desc, then
--    researcher_id -- a stable, deterministic order, never an arbitrary row order that
--    could silently reshuffle between reads.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_leaderboard(p_limit integer default 50)
returns table (
  researcher_id uuid,
  display_name text,
  public_username text,
  score bigint,
  resolved_count bigint,
  bounty_finalized_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id,
    u.display_name,
    u.public_username,
    coalesce(sum(case r.fact_type when 'report_resolved' then 25 when 'bounty_finalized' then 10 when 'report_rejected' then -5 else 0 end), 0) as score,
    count(*) filter (where r.fact_type = 'report_resolved') as resolved_count,
    count(*) filter (where r.fact_type = 'bounty_finalized') as bounty_finalized_count
  from public.reputation_ledger r
  join public.users u on u.id = r.researcher_id
  group by u.id, u.display_name, u.public_username
  order by score desc, resolved_count desc, u.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.get_public_leaderboard(integer) from public;
grant execute on function public.get_public_leaderboard(integer) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. A researcher's own rank -- computed via a window function over the exact same
--    aggregation the public leaderboard uses (a CTE identical in shape to
--    get_public_leaderboard's own query, not a second, potentially-divergent formula), so
--    a researcher's own reported rank can never disagree with where they would actually
--    appear on the public page. Self-only (auth.uid(), no parameter).
-- ---------------------------------------------------------------------------

create or replace function public.get_my_leaderboard_position()
returns table (rank bigint, score bigint, total_researchers bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
  with ranked as (
    select
      r.researcher_id,
      coalesce(sum(case r.fact_type when 'report_resolved' then 25 when 'bounty_finalized' then 10 when 'report_rejected' then -5 else 0 end), 0) as score,
      count(*) filter (where r.fact_type = 'report_resolved') as resolved_count,
      row_number() over (order by
        coalesce(sum(case r.fact_type when 'report_resolved' then 25 when 'bounty_finalized' then 10 when 'report_rejected' then -5 else 0 end), 0) desc,
        count(*) filter (where r.fact_type = 'report_resolved') desc,
        r.researcher_id asc
      ) as rank
    from public.reputation_ledger r
    group by r.researcher_id
  )
  select ranked.rank, ranked.score, (select count(*) from ranked) as total_researchers
  from ranked
  where ranked.researcher_id = actor;
end;
$$;

revoke all on function public.get_my_leaderboard_position() from public;
grant execute on function public.get_my_leaderboard_position() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The public researcher profile read. Composes display name, biography, stated
--    interests/focus (already public-read on researcher_profiles per 0051), and the new
--    score -- explicitly excludes personal details, KYC, payout, and external handles
--    (see 0065's own "one field this document does NOT restore" section). Returns no row
--    at all for a username no one holds or a researcher who never set one -- never
--    distinguishing "doesn't exist" from "exists but has no public profile."
-- ---------------------------------------------------------------------------

create or replace function public.get_public_researcher_profile(p_username text)
returns table (
  researcher_id uuid,
  display_name text,
  public_username text,
  biography text,
  hacking_interests public.researcher_focus_area[],
  security_focus public.researcher_security_focus[],
  score bigint,
  resolved_count bigint,
  bounty_finalized_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id,
    u.display_name,
    u.public_username,
    rp.biography,
    coalesce(rp.hacking_interests, '{}'),
    coalesce(rp.security_focus, '{}'),
    coalesce((select public.get_researcher_reputation_score(u.id)), 0),
    (select count(*) from public.reputation_ledger r where r.researcher_id = u.id and r.fact_type = 'report_resolved'),
    (select count(*) from public.reputation_ledger r where r.researcher_id = u.id and r.fact_type = 'bounty_finalized')
  from public.users u
  left join public.researcher_profiles rp on rp.user_id = u.id
  where lower(u.public_username) = lower(trim(p_username));
$$;

revoke all on function public.get_public_researcher_profile(text) from public;
grant execute on function public.get_public_researcher_profile(text) to authenticated, anon;
