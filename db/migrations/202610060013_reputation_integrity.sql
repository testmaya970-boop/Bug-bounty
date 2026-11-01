-- Reputation integrity and scoring, competitive-parity group 5.
--
-- Problems (audited 2026-10-06):
--  * One report could earn the same fact many times: nothing deduplicated (report_id,
--    fact_type). The E2E seed already produced a report with 38 report_resolved facts, and
--    the retest reopen (202610060011) makes resolve -> reopen -> resolve a real path.
--  * Provenance compared the report's CURRENT status, so a reopen before the worker ran
--    dead-lettered the fact for good.
--  * Severity didn't count; a $0 bounty earned +10; N/A cost nothing; the formula was
--    copied into three functions; badges read the live severity, and Prolific counted spam.
--  * get_my_leaderboard_position / get_public_researcher_profile ignored suspended and
--    deactivated accounts; get_researcher_reputation_score answered for anyone.
--  * The CTF event leaderboard showed every solver's real display name and id.
--
-- The ledger stays append-only (nothing is deleted or rewritten). Instead:
--  1. private.effective_reputation_facts: each (report, fact type) counts once -- its first
--     fact, with the severity frozen at that moment. CTF facts count individually.
--  2. private.reputation_fact_points: one scoring rule, used everywhere --
--       resolved: critical 50, high 35, medium 25, low 15, none 5 (unknown 25)
--       bounty finalized: 10 when the award is above zero, else 0
--       rejected -5, not applicable -2, duplicate 0, informative 0, CTF solve 2
--  3. The recorders return the existing fact for a report instead of adding another, and
--     check provenance against audit history (the report reached that outcome), not its
--     current status.
--  4. Leaderboard, position, profile and score agree, and exclude suspended/deactivated
--     accounts; the score is only answered for yourself or an opted-in public profile.
--  5. Badges count distinct reports and the frozen severity; Prolific counts valid
--     submissions only; new High Signal badge (share of decided reports that were valid).
--  6. CTF event leaderboard: names and ids only for opted-in researchers (or yourself).

-- ---------------------------------------------------------------------------
-- 1 + 2. One definition of what counts and how much
-- ---------------------------------------------------------------------------

create or replace function private.effective_reputation_facts()
returns setof public.reputation_ledger
language sql stable security definer set search_path = ''
as $$
  select distinct on (coalesce(l.report_id::text, l.id::text), l.fact_type) l.*
  from public.reputation_ledger l
  order by coalesce(l.report_id::text, l.id::text), l.fact_type, l.occurred_at, l.created_at, l.id;
$$;

create or replace function private.reputation_fact_points(p_fact_type text, p_severity public.report_severity, p_report_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case p_fact_type
    when 'report_resolved' then case p_severity
      when 'critical' then 50 when 'high' then 35 when 'medium' then 25 when 'low' then 15 when 'none' then 5 else 25 end
    when 'bounty_finalized' then case when exists (
      select 1 from public.report_bounty_decisions d where d.report_id = p_report_id and d.state = 'finalized' and d.final_amount_minor_units > 0
    ) then 10 else 0 end
    when 'report_rejected' then -5
    when 'report_not_applicable' then -2
    when 'ctf_challenge_solved' then 2
    else 0
  end;
$$;

-- Per active researcher: score, distinct resolved reports, distinct bounty awards.
create or replace function private.researcher_reputation_totals()
returns table (researcher_id uuid, score bigint, resolved_count bigint, bounty_finalized_count bigint)
language sql stable security definer set search_path = ''
as $$
  select f.researcher_id,
    coalesce(sum(private.reputation_fact_points(f.fact_type, f.confirmed_severity, f.report_id)), 0)::bigint,
    count(*) filter (where f.fact_type = 'report_resolved'),
    count(*) filter (where f.fact_type = 'bounty_finalized')
  from private.effective_reputation_facts() f
  join public.users u on u.id = f.researcher_id
  where u.deactivated_at is null and not u.is_suspended
  group by f.researcher_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recording: once per report and outcome; provenance from audit history
-- ---------------------------------------------------------------------------

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
    values (report.researcher_id, report.organization_id, report.program_id, report.id, p_fact_type, report.confirmed_severity,
      case when p_fact_type = 'report_duplicate' then report.duplicate_of_report_id end,
      p_source_event_id, 'report.' || replace(p_fact_type, 'report_', ''), 1, p_occurred_at)
    returning * into inserted;
  exception when unique_violation then
    select * into inserted from public.reputation_ledger where source_event_id = p_source_event_id;
  end;
  return inserted;
end;
$$;

create or replace function public.record_bounty_finalized_reputation_fact(p_source_event_id uuid, p_report_id uuid, p_occurred_at timestamptz)
returns public.reputation_ledger
language plpgsql set search_path = ''
as $$
declare
  report public.reports;
  existing public.reputation_ledger;
  inserted public.reputation_ledger;
begin
  select * into existing from public.reputation_ledger where source_event_id = p_source_event_id;
  if existing.id is not null then return existing; end if;

  select * into report from public.reports where id = p_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.report_bounty_decisions d where d.report_id = p_report_id and d.state = 'finalized') then
    raise exception 'PROVENANCE_MISMATCH: this report has no finalized bounty decision' using errcode = '23514';
  end if;

  select * into existing from public.reputation_ledger where report_id = report.id and fact_type = 'bounty_finalized' order by occurred_at limit 1;
  if existing.id is not null then return existing; end if;

  begin
    insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, confirmed_severity, duplicate_of_report_id, source_event_id, event_type, schema_version, occurred_at)
    values (report.researcher_id, report.organization_id, report.program_id, report.id, 'bounty_finalized', report.confirmed_severity, null, p_source_event_id, 'bounty.finalized', 1, p_occurred_at)
    returning * into inserted;
  exception when unique_violation then
    select * into inserted from public.reputation_ledger where source_event_id = p_source_event_id;
  end;
  return inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reads that agree with each other
-- ---------------------------------------------------------------------------

create or replace function public.get_researcher_reputation_score(p_researcher_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce((select t.score from private.researcher_reputation_totals() t where t.researcher_id = p_researcher_id), 0)
  where p_researcher_id = auth.uid()
     or exists (select 1 from public.users u where u.id = p_researcher_id and u.public_username is not null and u.deactivated_at is null and not u.is_suspended);
$$;

create or replace function public.get_public_leaderboard(p_limit integer default 50)
returns table (researcher_id uuid, display_name text, public_username text, score bigint, resolved_count bigint, bounty_finalized_count bigint)
language sql stable security definer set search_path = ''
as $$
  select
    case when u.public_username is not null or u.id = auth.uid() then u.id end,
    case when u.public_username is not null or u.id = auth.uid() then u.display_name else 'Anonymous researcher' end,
    u.public_username,
    t.score, t.resolved_count, t.bounty_finalized_count
  from private.researcher_reputation_totals() t
  join public.users u on u.id = t.researcher_id
  order by t.score desc, t.resolved_count desc, u.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

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
    select t.researcher_id, t.score,
      row_number() over (order by t.score desc, t.resolved_count desc, t.researcher_id asc) as rank
    from private.researcher_reputation_totals() t
  )
  select ranked.rank, ranked.score, (select count(*) from ranked)
  from ranked where ranked.researcher_id = actor;
end;
$$;

create or replace function public.get_public_researcher_profile(p_username text)
returns table (researcher_id uuid, display_name text, public_username text, biography text, hacking_interests public.researcher_focus_area[], security_focus public.researcher_security_focus[], score bigint, resolved_count bigint, bounty_finalized_count bigint)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.display_name, u.public_username, rp.biography,
    coalesce(rp.hacking_interests, '{}'), coalesce(rp.security_focus, '{}'),
    coalesce(t.score, 0), coalesce(t.resolved_count, 0), coalesce(t.bounty_finalized_count, 0)
  from public.users u
  left join public.researcher_profiles rp on rp.user_id = u.id
  left join private.researcher_reputation_totals() t on t.researcher_id = u.id
  where lower(u.public_username) = lower(trim(p_username)) and u.deactivated_at is null and not u.is_suspended;
$$;

-- ---------------------------------------------------------------------------
-- 5. Badges
-- ---------------------------------------------------------------------------

create or replace function public.get_researcher_badges(p_researcher_id uuid)
returns table (badge_key text, tier text, current_value bigint, next_threshold bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  valid_count bigint;
  resolver_count bigint;
  critical_count bigint;
  bounty_count bigint;
  breadth_count bigint;
  invalid_count bigint;
  signal_pct bigint;
  thresholds bigint[];
  names text[] := array['bronze', 'silver', 'gold', 'platinum'];
  i integer;
  v bigint;
  k text;
begin
  if not private.researcher_badges_visible(p_researcher_id) then return; end if;

  select count(*) into valid_count from public.reports
    where researcher_id = p_researcher_id and status not in ('rejected', 'not_applicable', 'duplicate');
  select count(*) filter (where fact_type = 'report_resolved'),
         count(*) filter (where fact_type = 'report_resolved' and confirmed_severity = 'critical'),
         count(*) filter (where fact_type = 'bounty_finalized' and private.reputation_fact_points(fact_type, confirmed_severity, report_id) > 0),
         count(distinct program_id) filter (where fact_type = 'report_resolved'),
         count(*) filter (where fact_type in ('report_rejected', 'report_not_applicable'))
    into resolver_count, critical_count, bounty_count, breadth_count, invalid_count
    from private.effective_reputation_facts() where researcher_id = p_researcher_id;
  -- Share of decided reports that were valid; only meaningful after 5 decisions.
  signal_pct := case when resolver_count + invalid_count >= 5 then (100 * resolver_count) / (resolver_count + invalid_count) end;

  foreach k in array array['prolific_researcher', 'resolver', 'critical_finder', 'bounty_earner', 'program_breadth', 'high_signal'] loop
    thresholds := case k
      when 'prolific_researcher' then array[1, 10, 50, 200]
      when 'resolver' then array[1, 5, 25, 100]
      when 'critical_finder' then array[1, 5, 15, 50]
      when 'bounty_earner' then array[1, 5, 20, 75]
      when 'program_breadth' then array[2, 5, 10, 25]
      when 'high_signal' then array[50, 70, 85, 95]
    end;
    v := case k
      when 'prolific_researcher' then valid_count when 'resolver' then resolver_count when 'critical_finder' then critical_count
      when 'bounty_earner' then bounty_count when 'program_breadth' then breadth_count when 'high_signal' then signal_pct
    end;
    continue when v is null;
    for i in reverse 4..1 loop
      if v >= thresholds[i] then
        badge_key := k; tier := names[i]; current_value := v; next_threshold := case when i < 4 then thresholds[i + 1] end;
        return next;
        exit;
      end if;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. CTF event leaderboard privacy
-- ---------------------------------------------------------------------------

create or replace function public.get_ctf_event_leaderboard(p_event_id uuid, p_limit integer default 100)
returns table (rank bigint, researcher_id uuid, display_name text, public_username text, event_points bigint, challenges_solved bigint, last_solved_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select
    row_number() over (order by sum(s.points_awarded) desc, count(*) desc, max(s.solved_at) asc, s.researcher_id asc),
    case when u.public_username is not null or u.id = auth.uid() then s.researcher_id end,
    case when u.public_username is not null or u.id = auth.uid() then u.display_name else 'Anonymous researcher' end,
    u.public_username,
    sum(s.points_awarded)::bigint,
    count(*)::bigint,
    max(s.solved_at)
  from public.ctf_event_solves s
  join public.users u on u.id = s.researcher_id
  where s.event_id = p_event_id and u.deactivated_at is null and not u.is_suspended
  group by s.researcher_id, u.id, u.display_name, u.public_username
  order by 1
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function private.effective_reputation_facts() from public;
revoke all on function private.reputation_fact_points(text, public.report_severity, uuid) from public;
revoke all on function private.researcher_reputation_totals() from public;
