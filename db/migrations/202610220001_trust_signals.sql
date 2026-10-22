-- Trust and anti-abuse, round two (Big Four axis "Trust & anti-abuse"), on top of the
-- submission signal of 202610210001:
--
-- 1. Programs can require a track record to join publicly: a minimum signal and/or number
--    of valid reports. Invited researchers are exempt (the organization chose them).
-- 2. Cross-program blasting: the same near-identical text sent to 3+ different programs in
--    24 hours is refused. (Same-program near-duplicates were already refused.)
-- 3. Collusion signals: a hashed history of sign-in networks per account, and an admin view
--    of researchers who share one with a member of an organization that awarded them --
--    the pattern behind self-dealing through a sock-puppet researcher account.

-- 1. Track-record requirement --------------------------------------------------------------
alter table public.programs
  add column if not exists min_signal numeric(3, 2) check (min_signal between -1 and 1),
  add column if not exists min_valid_reports integer check (min_valid_reports between 0 and 1000);

create or replace function private.program_researchers_check_track_record()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  prog public.programs;
  st record;
begin
  if new.source <> 'public' then return new; end if;
  select * into prog from public.programs where id = new.program_id;
  if prog.min_signal is null and coalesce(prog.min_valid_reports, 0) = 0 then return new; end if;
  select * into st from private.submission_standing(new.user_id);
  if (prog.min_signal is not null and st.signal < prog.min_signal) or st.valid_count < coalesce(prog.min_valid_reports, 0) then
    raise exception 'TRACK_RECORD_REQUIRED: this program asks for %', concat_ws(' and ',
      case when prog.min_valid_reports > 0 then prog.min_valid_reports || ' valid reports (you have ' || st.valid_count || ')' end,
      case when prog.min_signal is not null then 'a signal of ' || to_char(prog.min_signal, 'SG0.00') || ' or better (yours is ' || to_char(st.signal, 'SG0.00') || ')' end)
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.program_researchers_check_track_record() from public, anon;
grant execute on function private.program_researchers_check_track_record() to service_role;
create trigger program_researchers_check_track_record before insert on public.program_researchers
  for each row execute function private.program_researchers_check_track_record();

create or replace function public.set_program_track_record_requirement(target_program_id uuid, p_min_signal numeric, p_min_valid_reports integer)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  if not (private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(target_program_id)) then
    raise exception 'FORBIDDEN: actor cannot manage this program' using errcode = '42501';
  end if;
  if p_min_signal is not null and p_min_signal not between -1 and 1 then
    raise exception 'INVALID_SIGNAL: choose a signal between -1.00 and 1.00' using errcode = '22023';
  end if;
  if p_min_valid_reports is not null and p_min_valid_reports not between 0 and 1000 then
    raise exception 'INVALID_COUNT: choose between 0 and 1000 valid reports' using errcode = '22023';
  end if;
  update public.programs set min_signal = p_min_signal, min_valid_reports = nullif(p_min_valid_reports, 0), updated_at = now()
  where id = target_program_id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.track_record_requirement_set', 'program', target_program_id,
    jsonb_build_object('min_signal', p_min_signal, 'min_valid_reports', p_min_valid_reports));
  return updated;
end;
$$;
revoke all on function public.set_program_track_record_requirement(uuid, numeric, integer) from public, anon;
grant execute on function public.set_program_track_record_requirement(uuid, numeric, integer) to authenticated;

-- 2. Cross-program blasting (adds one check to 202610210001's enforcer) ---------------------
create or replace function private.enforce_submission_standing(p_user uuid, p_program uuid, p_title text, p_description text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  st record;
  twin record;
  blasted integer;
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
  select count(distinct r.program_id) into blasted from public.reports r
  where r.researcher_id = p_user and r.program_id <> p_program and r.submitted_at > now() - interval '24 hours'
    and extensions.similarity(r.title || ' ' || r.description, p_title || ' ' || p_description) >= 0.85;
  if blasted >= 2 then
    raise exception 'NEAR_DUPLICATE_BLAST: you sent this same report to % other programs today -- write each report for the program it is about', blasted using errcode = '23505';
  end if;
end;
$$;

-- 3. Collusion signals ----------------------------------------------------------------------
-- Hashes only: the raw IP stays on the session (deleted at sign-out); this keeps a salted
-- digest of the network an account signed in from, so two accounts can be compared later.
create table public.sign_in_fingerprints (
  user_id uuid not null references public.users(id) on delete cascade,
  network_hash text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  sign_ins integer not null default 1,
  primary key (user_id, network_hash)
);
create index sign_in_fingerprints_network_idx on public.sign_in_fingerprints (network_hash);
alter table public.sign_in_fingerprints enable row level security; -- no policies, no grants: admin RPC only
grant select, insert, update on public.sign_in_fingerprints to service_role;

create or replace function private.sessions_record_fingerprint()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.ip is null or new.ip::text = '' then return new; end if;
  insert into public.sign_in_fingerprints (user_id, network_hash)
  values (new.user_id, encode(extensions.digest('unpatched-net:' || new.ip::text, 'sha256'), 'hex'))
  on conflict (user_id, network_hash) do update set last_seen = now(), sign_ins = public.sign_in_fingerprints.sign_ins + 1;
  return new;
end;
$$;
revoke all on function private.sessions_record_fingerprint() from public, anon;
grant execute on function private.sessions_record_fingerprint() to service_role;
create trigger sessions_record_fingerprint after insert on public.sessions
  for each row execute function private.sessions_record_fingerprint();

-- Researchers who signed in from the same network as an active member of an organization
-- that awarded them a bounty, in the last 180 days.
create or replace function public.list_collusion_signals_for_admin()
returns table (researcher_id uuid, researcher_name text, researcher_email text, organization_id uuid, organization_name text,
               shared_networks integer, last_shared timestamptz, awards integer, awarded_minor_units bigint, currency text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  return query
  with shared as (
    select r.user_id as researcher, m.organization_id as org, count(distinct r.network_hash)::int as nets, max(least(r.last_seen, s.last_seen)) as last_shared
    from public.sign_in_fingerprints r
    join public.sign_in_fingerprints s on s.network_hash = r.network_hash and s.user_id <> r.user_id
    join public.organization_members m on m.user_id = s.user_id and m.status = 'active'
    join public.users ru on ru.id = r.user_id and ru.account_type = 'researcher'
    where r.last_seen > now() - interval '180 days' and s.last_seen > now() - interval '180 days'
    group by 1, 2
  ), awards as (
    select o.researcher_id as researcher, o.organization_id as org, count(*)::int as n, sum(o.amount_minor_units)::bigint as total, min(o.currency) as currency
    from public.payment_obligations o where o.status <> 'cancelled'
    group by 1, 2
  )
  select sh.researcher, u.display_name, u.email, sh.org, org.name, sh.nets, sh.last_shared, a.n, a.total, a.currency
  from shared sh
  join awards a on a.researcher = sh.researcher and a.org = sh.org
  join public.users u on u.id = sh.researcher
  join public.organizations org on org.id = sh.org
  order by sh.last_shared desc
  limit 200;
end;
$$;
revoke all on function public.list_collusion_signals_for_admin() from public, anon;
grant execute on function public.list_collusion_signals_for_admin() to authenticated;
