-- Core workflow (Big Four axis "Core workflow & triage"):
--
-- 1. Duplicate suggestions. Marking a duplicate used to mean finding the original by hand in
--    the program's first page of reports. suggest_duplicate_reports ranks every report in the
--    program by how alike it is (title + description trigram similarity, same target first),
--    so triage starts from the likely original. Program staff only.
-- 2. Request to join. A public program can be "open" (anyone may join, as today) or "by
--    request": researchers ask, staff approve or decline. Approved researchers join with
--    source 'request' (exempt from the track-record gate: staff chose them).

-- 1. Duplicate suggestions ---------------------------------------------------------------------
create or replace function public.suggest_duplicate_reports(target_report_id uuid, p_limit integer default 8)
returns table (id uuid, title text, display_target text, status public.report_status, submitted_at timestamptz, similarity real, same_target boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  base public.reports;
begin
  select * into base from public.reports r where r.id = target_report_id;
  if base.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(base.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(base.program_id) or private.is_program_triager(base.program_id)
  ) then
    raise exception 'FORBIDDEN: only program staff can look for duplicates' using errcode = '42501';
  end if;
  return query
  select r.id, r.title, r.display_target, r.status, r.submitted_at,
    extensions.similarity(r.title || ' ' || coalesce(r.description, ''), base.title || ' ' || coalesce(base.description, '')) as sim,
    r.target = base.target
  from public.reports r
  where r.program_id = base.program_id and r.id <> base.id
    -- An original is never itself a duplicate; offering one would chain duplicates.
    and r.status <> 'duplicate'
    and r.submitted_at <= coalesce(base.submitted_at, now())
  order by (r.target = base.target) desc, sim desc, r.submitted_at
  limit least(greatest(coalesce(p_limit, 8), 1), 25);
end;
$$;
revoke all on function public.suggest_duplicate_reports(uuid, integer) from public, anon;
grant execute on function public.suggest_duplicate_reports(uuid, integer) to authenticated;

-- 2. Request to join ---------------------------------------------------------------------------
alter table public.programs add column if not exists join_mode text not null default 'open' check (join_mode in ('open', 'request'));

create table public.program_access_requests (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  created_at timestamptz not null default now()
);
create unique index program_access_requests_one_pending on public.program_access_requests (program_id, user_id) where status = 'pending';
alter table public.program_access_requests enable row level security;
create policy "access requests own read" on public.program_access_requests for select to authenticated using (user_id = auth.uid());
grant select on public.program_access_requests to authenticated;
grant select, insert, update on public.program_access_requests to service_role;

-- A "by request" program can't be joined directly; approval inserts with source 'request'.
create or replace function private.program_researchers_require_approval()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.source = 'public' and exists (select 1 from public.programs p where p.id = new.program_id and p.join_mode = 'request') then
    raise exception 'APPROVAL_REQUIRED: this program reviews who joins -- send a request to join instead' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.program_researchers_require_approval() from public, anon;
grant execute on function private.program_researchers_require_approval() to service_role;
create trigger program_researchers_require_approval before insert on public.program_researchers
  for each row execute function private.program_researchers_require_approval();

create or replace function public.set_program_join_mode(target_program_id uuid, p_join_mode text)
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
  if p_join_mode not in ('open', 'request') then
    raise exception 'INVALID_JOIN_MODE: choose open or request' using errcode = '22023';
  end if;
  update public.programs set join_mode = p_join_mode, updated_at = now() where id = target_program_id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.join_mode_set', 'program', target_program_id, jsonb_build_object('join_mode', p_join_mode));
  return updated;
end;
$$;
revoke all on function public.set_program_join_mode(uuid, text) from public, anon;
grant execute on function public.set_program_join_mode(uuid, text) to authenticated;

create or replace function public.request_program_access(target_program_id uuid, p_note text)
returns public.program_access_requests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  created public.program_access_requests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.users u where u.id = actor and u.account_type = 'researcher' and not u.is_suspended and u.deactivated_at is null)
     or exists (select 1 from public.platform_admins pa where pa.user_id = actor) then
    raise exception 'FORBIDDEN: only researcher accounts can ask to join programs' using errcode = '42501';
  end if;
  select * into program from public.programs where id = target_program_id;
  if program.id is null or program.visibility <> 'public' or program.status not in ('active', 'paused') then
    raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002';
  end if;
  if program.join_mode <> 'request' then
    raise exception 'OPEN_PROGRAM: this program is open -- join it directly' using errcode = '22023';
  end if;
  if exists (select 1 from public.program_researchers pr where pr.program_id = program.id and pr.user_id = actor) then
    raise exception 'ALREADY_PARTICIPATING: you already have access to this program, or it was removed' using errcode = '22023';
  end if;
  if exists (select 1 from public.program_access_requests r where r.program_id = program.id and r.user_id = actor and r.status = 'declined' and r.decided_at > now() - interval '30 days') then
    raise exception 'RECENTLY_DECLINED: this program declined your request in the last 30 days' using errcode = '22023';
  end if;
  insert into public.program_access_requests (program_id, organization_id, user_id, note)
  values (program.id, program.organization_id, actor, nullif(left(trim(coalesce(p_note, '')), 1000), ''))
  returning * into created;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.access_requested', 'program', program.id, jsonb_build_object('request_id', created.id));
  return created;
exception when unique_violation then
  raise exception 'REQUEST_PENDING: you already asked to join this program' using errcode = '23505';
end;
$$;
revoke all on function public.request_program_access(uuid, text) from public, anon;
grant execute on function public.request_program_access(uuid, text) to authenticated;

create or replace function public.withdraw_program_access_request(target_request_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  update public.program_access_requests set status = 'withdrawn', decided_at = now()
  where id = target_request_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'NOT_FOUND: no pending request to withdraw' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.withdraw_program_access_request(uuid) from public, anon;
grant execute on function public.withdraw_program_access_request(uuid) to authenticated;

create or replace function public.list_program_access_requests(target_program_id uuid)
returns table (id uuid, user_id uuid, display_name text, username text, note text, created_at timestamptz,
               signal numeric, valid_count integer, closed_count integer, tier text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  program public.programs;
begin
  select * into program from public.programs where id = target_program_id;
  if program.id is null or not (private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(target_program_id)) then
    raise exception 'FORBIDDEN: actor cannot manage this program' using errcode = '42501';
  end if;
  return query
  select r.id, r.user_id, u.display_name, coalesce(u.public_username, u.username), r.note, r.created_at, st.signal, st.valid_count, st.closed_count, st.tier
  from public.program_access_requests r
  join public.users u on u.id = r.user_id
  cross join lateral private.submission_standing(r.user_id) st
  where r.program_id = target_program_id and r.status = 'pending'
  order by r.created_at
  limit 200;
end;
$$;
revoke all on function public.list_program_access_requests(uuid) from public, anon;
grant execute on function public.list_program_access_requests(uuid) to authenticated;

create or replace function public.decide_program_access_request(target_request_id uuid, p_approve boolean, p_note text)
returns public.program_access_requests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  req public.program_access_requests;
  program public.programs;
  decided public.program_access_requests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into req from public.program_access_requests where id = target_request_id for update;
  if req.id is null then raise exception 'NOT_FOUND: request not found' using errcode = 'P0002'; end if;
  select * into program from public.programs where id = req.program_id;
  if not (private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(program.id)) then
    raise exception 'FORBIDDEN: actor cannot manage this program' using errcode = '42501';
  end if;
  if req.status <> 'pending' then raise exception 'ALREADY_DECIDED: this request was already decided or withdrawn' using errcode = '22023'; end if;
  update public.program_access_requests
  set status = case when p_approve then 'approved' else 'declined' end, decided_by = actor, decided_at = now(),
      decision_note = nullif(left(trim(coalesce(p_note, '')), 1000), '')
  where id = req.id returning * into decided;
  if p_approve then
    insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by, joined_at, updated_at)
    values (program.id, program.organization_id, req.user_id, 'active', 'request', actor, now(), now());
  end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, case when p_approve then 'program.access_approved' else 'program.access_declined' end, 'program', program.id,
    jsonb_build_object('request_id', req.id, 'researcher_id', req.user_id));
  return decided;
end;
$$;
revoke all on function public.decide_program_access_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_program_access_request(uuid, boolean, text) to authenticated;
