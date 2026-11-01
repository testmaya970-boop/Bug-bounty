-- The leaderboard shows every researcher's name and @username, with an opt-out (2026-10-30,
-- user decision; supersedes the "anonymous unless a public profile is published" rule from
-- 202610060013). The @username is the one chosen at sign-up, which every researcher has; the
-- optional public_username still decides whether a public profile page exists.
--
-- 1. users.hide_from_leaderboard: a researcher can step off the public leaderboard; they then
--    show as "Anonymous researcher" to everyone but themselves.
-- 2. get_public_leaderboard returns username as well.
-- 3. Organizations can invite by that @username, not only by a public_username.

alter table public.users add column if not exists hide_from_leaderboard boolean not null default false;

drop function public.get_public_leaderboard(integer);
create function public.get_public_leaderboard(p_limit integer default 50)
returns table (researcher_id uuid, display_name text, public_username text, username text, score bigint, resolved_count bigint, bounty_finalized_count bigint)
language sql stable security definer set search_path = ''
as $$
  select
    case when v.shown then u.id end,
    case when v.shown then u.display_name else 'Anonymous researcher' end,
    case when v.shown then u.public_username end,
    case when v.shown then u.username end,
    t.score, t.resolved_count, t.bounty_finalized_count
  from private.researcher_reputation_totals() t
  join public.users u on u.id = t.researcher_id
  cross join lateral (select (not u.hide_from_leaderboard or u.id = auth.uid()) as shown) v
  order by t.score desc, t.resolved_count desc, u.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.get_public_leaderboard(integer) from public;
grant execute on function public.get_public_leaderboard(integer) to authenticated, anon;

create or replace function public.get_my_leaderboard_visibility()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select not u.hide_from_leaderboard from public.users u where u.id = auth.uid()), true);
$$;
revoke all on function public.get_my_leaderboard_visibility() from public, anon;
grant execute on function public.get_my_leaderboard_visibility() to authenticated;

create or replace function public.set_my_leaderboard_visibility(p_visible boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  update public.users set hide_from_leaderboard = not coalesce(p_visible, true), updated_at = now()
  where id = actor and account_type = 'researcher';
  if not found then raise exception 'FORBIDDEN: only researchers appear on the leaderboard' using errcode = '42501'; end if;
  return coalesce(p_visible, true);
end;
$$;
revoke all on function public.set_my_leaderboard_visibility(boolean) from public, anon;
grant execute on function public.set_my_leaderboard_visibility(boolean) to authenticated;

-- Invite by the @username the organization now sees. Patched in place (the function is long and
-- otherwise unchanged); fails loudly if the lookup it rewrites has moved.
-- ponytail: usernames are unique case-sensitively, so "Bob" and "bob" could both match a
-- lowercase handle and the first row wins; add a lower(username) unique index if that ever bites.
do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.invite_researcher_by_username(uuid, text, text, text)'::regprocedure) into definition;
  patched := replace(definition, 'where lower(u.public_username) = handle and', 'where (lower(u.public_username) = handle or lower(u.username) = handle) and');
  if patched = definition then
    raise exception 'invite_researcher_by_username: the public_username lookup was not found';
  end if;
  execute patched;
end;
$$;
