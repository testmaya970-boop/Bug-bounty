-- Anti-abuse for report submission (Big Four audit gap 3). Until now the only guard was a flat
-- 30 reports per hour per account, the same for a first-day account and a veteran, so a
-- spammer could flood any program with machine-written reports. The category answer
-- (signal-gated limits, credits, auto-suspension for invalid runs) adapted here:
--
--   * Signal: the average outcome of a researcher's last 30 closed reports, from -1 to 1.
--     accepted / resolved = +1, duplicate / informative = 0, not_applicable / rejected = -1.
--     Explainable on purpose: the researcher can see exactly why they are in a tier.
--   * Tier and daily cap (rolling 24 hours, across all programs):
--       new       fewer than 3 closed reports      5 a day
--       limited   signal below -0.2 (5+ closed)    2 a day
--       trusted   signal 0.5 or more (3+ valid)   30 a day
--       standard  everyone else                   15 a day
--   * Cooldown: when a report closes invalid and the researcher's last 5 closed reports are
--     all invalid, submissions pause for 7 days (automatic restriction, audited).
--   * Near-duplicate block: the same researcher re-sending an almost identical report
--     (pg_trgm similarity >= 0.85 on title + description) to the same program within 30 days.
--   * Platform admins can see, add and lift restrictions.
--
-- The hourly limit stays as a burst guard underneath the daily cap.

-- A per-account daily cap that replaces the tier cap (restrictions still apply). Set only by
-- the server (no grant): today by the E2E seed, whose suite submits ~15 reports a run.
alter table public.users add column if not exists submission_daily_cap_override integer check (submission_daily_cap_override between 1 and 10000);

create table public.submission_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  source text not null check (source in ('automatic', 'platform_admin')),
  restricted_until timestamptz not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.users(id)
);
create index submission_restrictions_active_idx on public.submission_restrictions (user_id, restricted_until) where lifted_at is null;
alter table public.submission_restrictions enable row level security;
-- Researchers read their own; everything else goes through the definer functions below.
create policy "submission restrictions own read" on public.submission_restrictions for select to authenticated using (user_id = auth.uid());
grant select on public.submission_restrictions to authenticated;

-- Researcher signal and tier. Pure read; callers decide who may ask about whom.
create or replace function private.submission_standing(p_user uuid)
returns table (tier text, signal numeric, closed_count integer, valid_count integer, invalid_count integer, daily_cap integer, used_today integer, restricted_until timestamptz, restriction_reason text)
language sql stable security definer set search_path = ''
as $$
  with recent as (
    select case when r.status in ('accepted', 'resolved') then 1 when r.status in ('not_applicable', 'rejected') then -1 else 0 end as score
    from public.reports r
    where r.researcher_id = p_user and r.status in ('accepted', 'resolved', 'duplicate', 'informative', 'not_applicable', 'rejected')
    order by r.updated_at desc
    limit 30
  ), s as (
    select count(*)::int as closed, count(*) filter (where score = 1)::int as valid, count(*) filter (where score = -1)::int as invalid,
      coalesce(round(avg(score), 2), 0) as signal
    from recent
  ), t as (
    select s.*, case
      when s.closed < 3 then 'new'
      when s.closed >= 5 and s.signal < -0.2 then 'limited'
      when s.valid >= 3 and s.signal >= 0.5 then 'trusted'
      else 'standard' end as tier
    from s
  ), r as (
    select sr.restricted_until, sr.reason from public.submission_restrictions sr
    where sr.user_id = p_user and sr.lifted_at is null and sr.restricted_until > now()
    order by sr.restricted_until desc limit 1
  )
  select t.tier, t.signal, t.closed, t.valid, t.invalid,
    coalesce((select u.submission_daily_cap_override from public.users u where u.id = p_user),
      case t.tier when 'new' then 5 when 'limited' then 2 when 'trusted' then 30 else 15 end),
    (select count(*)::int from public.reports x where x.researcher_id = p_user and x.submitted_at > now() - interval '24 hours'),
    (select restricted_until from r), (select reason from r)
  from t;
$$;
revoke all on function private.submission_standing(uuid) from public, anon;
grant execute on function private.submission_standing(uuid) to service_role;

-- The researcher's own standing, shown on the report form and in Settings > Reputation.
create or replace function public.get_my_submission_standing()
returns table (tier text, signal numeric, closed_count integer, valid_count integer, invalid_count integer, daily_cap integer, used_today integer, restricted_until timestamptz, restriction_reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  return query select * from private.submission_standing(auth.uid());
end;
$$;
revoke all on function public.get_my_submission_standing() from public, anon;
grant execute on function public.get_my_submission_standing() to authenticated;

-- The check submit_report runs before anything else touches the database.
create or replace function private.enforce_submission_standing(p_user uuid, p_program uuid, p_title text, p_description text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  st record;
  twin record;
begin
  select * into st from private.submission_standing(p_user);
  if st.restricted_until is not null then
    raise exception 'SUBMISSIONS_PAUSED: you can submit reports again on % UTC -- %', to_char(st.restricted_until at time zone 'UTC', 'DD Mon YYYY HH24:MI'), st.restriction_reason using errcode = '42501';
  end if;
  if st.used_today >= st.daily_cap then
    raise exception 'DAILY_LIMIT: you have used all % reports for today (% researcher) -- valid reports raise your limit', st.daily_cap, st.tier using errcode = '53400';
  end if;
  select r.id, r.submitted_at into twin from public.reports r
  where r.researcher_id = p_user and r.program_id = p_program and r.submitted_at > now() - interval '30 days'
    and extensions.similarity(r.title || ' ' || r.description, p_title || ' ' || p_description) >= 0.85
  limit 1;
  if twin.id is not null then
    raise exception 'NEAR_DUPLICATE: you sent an almost identical report to this program on % -- add new details to that report instead', to_char(twin.submitted_at, 'DD Mon YYYY') using errcode = '23505';
  end if;
end;
$$;
revoke all on function private.enforce_submission_standing(uuid, uuid, text, text) from public, anon;
grant execute on function private.enforce_submission_standing(uuid, uuid, text, text) to service_role;

-- Enforced on insert rather than by redefining submit_report: copying that function's body
-- forward is exactly how the P0-1 regression happened. Only a signed-in researcher's insert
-- is checked; service-role imports and seeds have no actor.
create or replace function private.reports_enforce_submission_standing()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and new.researcher_id = auth.uid() then
    perform private.enforce_submission_standing(new.researcher_id, new.program_id, new.title, new.description);
  end if;
  return new;
end;
$$;
revoke all on function private.reports_enforce_submission_standing() from public, anon;
grant execute on function private.reports_enforce_submission_standing() to service_role;
create trigger reports_enforce_submission_standing before insert on public.reports
  for each row execute function private.reports_enforce_submission_standing();

-- Cooldown: five invalid closes in a row pause submissions for 7 days.
create or replace function private.reports_invalid_run_cooldown()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  last_five text[];
begin
  if new.status not in ('not_applicable', 'rejected') or old.status = new.status then return new; end if;
  select array_agg(status::text) into last_five from (
    select r.status from public.reports r
    where r.researcher_id = new.researcher_id and r.status in ('accepted', 'resolved', 'duplicate', 'informative', 'not_applicable', 'rejected')
    order by r.updated_at desc limit 5
  ) x;
  if coalesce(array_length(last_five, 1), 0) = 5 and last_five <@ array['not_applicable', 'rejected']
     and not exists (select 1 from public.submission_restrictions s where s.user_id = new.researcher_id and s.lifted_at is null and s.restricted_until > now()) then
    insert into public.submission_restrictions (user_id, reason, source, restricted_until)
    values (new.researcher_id, 'Your last 5 reports were closed as not applicable or rejected. Read each program''s scope and rules before submitting again.', 'automatic', now() + interval '7 days');
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (null, new.organization_id, 'researcher.submissions_paused', 'user', new.researcher_id, jsonb_build_object('source', 'automatic', 'trigger_report_id', new.id, 'days', 7));
  end if;
  return new;
end;
$$;
revoke all on function private.reports_invalid_run_cooldown() from public, anon;
grant execute on function private.reports_invalid_run_cooldown() to service_role;
create trigger reports_invalid_run_cooldown after update of status on public.reports
  for each row execute function private.reports_invalid_run_cooldown();

-- Platform admin: everyone currently paused, with their standing.
create or replace function public.list_submission_restrictions_for_admin(p_limit integer default 100)
returns table (id uuid, user_id uuid, username text, display_name text, email text, reason text, source text, restricted_until timestamptz, created_at timestamptz, tier text, signal numeric, invalid_count integer, closed_count integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  return query
  select s.id, s.user_id, u.username, u.display_name, u.email, s.reason, s.source, s.restricted_until, s.created_at,
    st.tier, st.signal, st.invalid_count, st.closed_count
  from public.submission_restrictions s
  join public.users u on u.id = s.user_id
  cross join lateral private.submission_standing(s.user_id) st
  where s.lifted_at is null and s.restricted_until > now()
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;
revoke all on function public.list_submission_restrictions_for_admin(integer) from public, anon;
grant execute on function public.list_submission_restrictions_for_admin(integer) to authenticated;

create or replace function public.pause_researcher_submissions(target_email text, p_days integer, p_reason text)
returns public.submission_restrictions
language plpgsql security definer set search_path = ''
as $$
declare
  target public.users;
  created public.submission_restrictions;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  select * into target from public.users where lower(email) = lower(trim(target_email));
  if target.id is null or target.account_type <> 'researcher' then
    raise exception 'NOT_FOUND: no researcher account has that email' using errcode = 'P0002';
  end if;
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'INVALID_DAYS: choose between 1 and 90 days' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'INVALID_REASON: tell the researcher why' using errcode = '22023';
  end if;
  insert into public.submission_restrictions (user_id, reason, source, restricted_until, created_by)
  values (target.id, left(trim(p_reason), 500), 'platform_admin', now() + make_interval(days => p_days), auth.uid())
  returning * into created;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform.researcher_submissions_paused', 'user', target.id, jsonb_build_object('days', p_days, 'restriction_id', created.id));
  return created;
end;
$$;
revoke all on function public.pause_researcher_submissions(text, integer, text) from public, anon;
grant execute on function public.pause_researcher_submissions(text, integer, text) to authenticated;

create or replace function public.lift_submission_restriction(target_restriction_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lifted public.submission_restrictions;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  update public.submission_restrictions set lifted_at = now(), lifted_by = auth.uid()
  where id = target_restriction_id and lifted_at is null
  returning * into lifted;
  if lifted.id is null then
    raise exception 'NOT_FOUND: that restriction is already lifted or does not exist' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform.researcher_submissions_resumed', 'user', lifted.user_id, jsonb_build_object('restriction_id', lifted.id));
end;
$$;
revoke all on function public.lift_submission_restriction(uuid) from public, anon;
grant execute on function public.lift_submission_restriction(uuid) to authenticated;
