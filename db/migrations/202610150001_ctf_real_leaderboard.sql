-- The CTF leaderboard and per-challenge solve counts were mock figures with a "Mock data"
-- caption. These read the real ctf_solves ledger instead. Public aggregates only: a display
-- name or public username, points and counts; deactivated, suspended and platform-staff
-- accounts are left out, the same people every other public ranking leaves out.

create or replace function public.get_ctf_leaderboard(p_limit integer default 100)
returns table (rank bigint, researcher_id uuid, display_name text, public_username text, points bigint, challenges_solved bigint)
language sql stable security definer set search_path = ''
as $$
  with totals as (
    select s.researcher_id, sum(s.points_awarded)::bigint as points, count(*)::bigint as challenges_solved, max(s.solved_at) as last_solved_at
    from public.ctf_solves s
    join public.users u on u.id = s.researcher_id
    where u.deactivated_at is null and not u.is_suspended
      and not exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
    group by s.researcher_id
  )
  select rank() over (order by t.points desc, t.last_solved_at asc), t.researcher_id, u.display_name, u.public_username, t.points, t.challenges_solved
  from totals t join public.users u on u.id = t.researcher_id
  order by t.points desc, t.last_solved_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;
revoke all on function public.get_ctf_leaderboard(integer) from public;
grant execute on function public.get_ctf_leaderboard(integer) to anon, authenticated;

create or replace function public.get_ctf_solve_counts()
returns table (challenge_id text, solves bigint)
language sql stable security definer set search_path = ''
as $$
  select s.challenge_id, count(*)::bigint
  from public.ctf_solves s join public.users u on u.id = s.researcher_id
  where u.deactivated_at is null
  group by s.challenge_id;
$$;
revoke all on function public.get_ctf_solve_counts() from public;
grant execute on function public.get_ctf_solve_counts() to anon, authenticated;
