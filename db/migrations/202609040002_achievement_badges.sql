-- Achievement badges (docs/decisions/0071) -- five badge families, four tiers each,
-- entirely computed read-side from already-true facts (report count, reputation_ledger
-- fact counts, distinct program breadth). No new table, no stored/mutable badge state --
-- a badge tier can never desync from the underlying data because there is nothing to
-- keep in sync; it is recomputed fresh on every call, exactly like
-- get_researcher_reputation_score (202609040001) already does for the score itself.
--
-- Four families are outcome-based (reputation_ledger, unchanged, append-only, matching
-- 0016's own discipline). One family, "Prolific Researcher", is a deliberate, explicitly
-- scoped exception: it counts raw report submissions (any status) rather than confirmed
-- outcomes, mirroring Bugcrowd's own "Submission Shogun" volume badge on explicit
-- direction. It is namespaced as a badge only -- it never feeds get_researcher_reputation_score
-- or get_public_leaderboard, both of which stay outcome-only, unchanged.

create or replace function public.get_researcher_badges(p_researcher_id uuid)
returns table (badge_key text, tier text, current_value bigint, next_threshold bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  prolific_count bigint;
  resolver_count bigint;
  critical_count bigint;
  bounty_count bigint;
  breadth_count bigint;
begin
  select count(*) into prolific_count from public.reports where researcher_id = p_researcher_id;
  select count(*) into resolver_count from public.reputation_ledger where researcher_id = p_researcher_id and fact_type = 'report_resolved';
  select count(*) into critical_count from public.reputation_ledger r join public.reports rep on rep.id = r.report_id
    where r.researcher_id = p_researcher_id and r.fact_type = 'report_resolved' and rep.confirmed_severity = 'critical';
  select count(*) into bounty_count from public.reputation_ledger where researcher_id = p_researcher_id and fact_type = 'bounty_finalized';
  select count(distinct program_id) into breadth_count from public.reputation_ledger where researcher_id = p_researcher_id and fact_type = 'report_resolved';

  -- Prolific Researcher: 1 / 10 / 50 / 200
  if prolific_count >= 200 then
    badge_key := 'prolific_researcher'; tier := 'platinum'; current_value := prolific_count; next_threshold := null; return next;
  elsif prolific_count >= 50 then
    badge_key := 'prolific_researcher'; tier := 'gold'; current_value := prolific_count; next_threshold := 200; return next;
  elsif prolific_count >= 10 then
    badge_key := 'prolific_researcher'; tier := 'silver'; current_value := prolific_count; next_threshold := 50; return next;
  elsif prolific_count >= 1 then
    badge_key := 'prolific_researcher'; tier := 'bronze'; current_value := prolific_count; next_threshold := 10; return next;
  end if;

  -- Resolver: 1 / 5 / 25 / 100
  if resolver_count >= 100 then
    badge_key := 'resolver'; tier := 'platinum'; current_value := resolver_count; next_threshold := null; return next;
  elsif resolver_count >= 25 then
    badge_key := 'resolver'; tier := 'gold'; current_value := resolver_count; next_threshold := 100; return next;
  elsif resolver_count >= 5 then
    badge_key := 'resolver'; tier := 'silver'; current_value := resolver_count; next_threshold := 25; return next;
  elsif resolver_count >= 1 then
    badge_key := 'resolver'; tier := 'bronze'; current_value := resolver_count; next_threshold := 5; return next;
  end if;

  -- Critical Finder: 1 / 5 / 15 / 50
  if critical_count >= 50 then
    badge_key := 'critical_finder'; tier := 'platinum'; current_value := critical_count; next_threshold := null; return next;
  elsif critical_count >= 15 then
    badge_key := 'critical_finder'; tier := 'gold'; current_value := critical_count; next_threshold := 50; return next;
  elsif critical_count >= 5 then
    badge_key := 'critical_finder'; tier := 'silver'; current_value := critical_count; next_threshold := 15; return next;
  elsif critical_count >= 1 then
    badge_key := 'critical_finder'; tier := 'bronze'; current_value := critical_count; next_threshold := 5; return next;
  end if;

  -- Bounty Earner: 1 / 5 / 20 / 75
  if bounty_count >= 75 then
    badge_key := 'bounty_earner'; tier := 'platinum'; current_value := bounty_count; next_threshold := null; return next;
  elsif bounty_count >= 20 then
    badge_key := 'bounty_earner'; tier := 'gold'; current_value := bounty_count; next_threshold := 75; return next;
  elsif bounty_count >= 5 then
    badge_key := 'bounty_earner'; tier := 'silver'; current_value := bounty_count; next_threshold := 20; return next;
  elsif bounty_count >= 1 then
    badge_key := 'bounty_earner'; tier := 'bronze'; current_value := bounty_count; next_threshold := 5; return next;
  end if;

  -- Program Breadth: 2 / 5 / 10 / 25
  if breadth_count >= 25 then
    badge_key := 'program_breadth'; tier := 'platinum'; current_value := breadth_count; next_threshold := null; return next;
  elsif breadth_count >= 10 then
    badge_key := 'program_breadth'; tier := 'gold'; current_value := breadth_count; next_threshold := 25; return next;
  elsif breadth_count >= 5 then
    badge_key := 'program_breadth'; tier := 'silver'; current_value := breadth_count; next_threshold := 10; return next;
  elsif breadth_count >= 2 then
    badge_key := 'program_breadth'; tier := 'bronze'; current_value := breadth_count; next_threshold := 5; return next;
  end if;
end;
$$;

revoke all on function public.get_researcher_badges(uuid) from public;
grant execute on function public.get_researcher_badges(uuid) to authenticated, anon;
