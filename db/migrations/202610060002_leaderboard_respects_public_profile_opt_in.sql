-- Audit REP-2 (P1, live-verified: 3 of 4 leaderboard rows had no public username).
-- get_public_leaderboard is callable by `anon` (and served at /api/v1/leaderboard) and
-- returned every researcher's user id and display name, although a public profile is an
-- explicit opt-in (set_my_public_username). Deactivated and suspended accounts were listed
-- too.
--
-- Now: rows for researchers who have not opted in stay in the ranking (so "your position"
-- still agrees with the list) but appear as "Anonymous researcher" with no id -- except to
-- that researcher themself. Deactivated and suspended accounts are left out.
-- get_researcher_badges (also anon-callable) answers only for opted-in researchers or self.

create or replace function public.get_public_leaderboard(p_limit integer default 50)
returns table (researcher_id uuid, display_name text, public_username text, score bigint, resolved_count bigint, bounty_finalized_count bigint)
language sql stable security definer set search_path = ''
as $$
  select
    case when u.public_username is not null or u.id = auth.uid() then u.id end,
    case when u.public_username is not null or u.id = auth.uid() then u.display_name else 'Anonymous researcher' end,
    u.public_username,
    coalesce(sum(case r.fact_type when 'report_resolved' then 25 when 'bounty_finalized' then 10 when 'report_rejected' then -5 when 'ctf_challenge_solved' then 2 else 0 end), 0) as score,
    count(*) filter (where r.fact_type = 'report_resolved') as resolved_count,
    count(*) filter (where r.fact_type = 'bounty_finalized') as bounty_finalized_count
  from public.reputation_ledger r
  join public.users u on u.id = r.researcher_id
  where u.deactivated_at is null and not u.is_suspended
  group by u.id, u.display_name, u.public_username
  order by score desc, resolved_count desc, u.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function private.researcher_badges_visible(p_researcher_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_researcher_id = auth.uid() or exists (
    select 1 from public.users u
    where u.id = p_researcher_id and u.public_username is not null and u.deactivated_at is null and not u.is_suspended
  );
$$;

revoke all on function private.researcher_badges_visible(uuid) from public;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_researcher_badges';
  -- Add the visibility check as the function's first statement, leaving the badge rules as
  -- they are.
  definition := replace(definition, E'begin\n  select count(*) into prolific_count',
    E'begin\n  if not private.researcher_badges_visible(p_researcher_id) then return; end if;\n  select count(*) into prolific_count');
  if position('researcher_badges_visible' in definition) = 0 then
    raise exception 'get_researcher_badges body did not match the expected shape';
  end if;
  execute definition;
end;
$$;
