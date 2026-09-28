-- Platform program oversight, part 2: a platform admin can see every program across every
-- organization (counts by status + searchable list) and suspend/reinstate a single program.
--
-- Why a status, not a flag: every researcher-facing read (list_public_programs,
-- get_public_program, join_public_program, list_recommended_programs) already allow-lists
-- status in ('active'[, 'paused']), so 'suspended' drops out of discovery and joining with no
-- redefinition. The one blocklist gate is submit_report's `status in ('paused', 'closed')`
-- -- instead of re-copying that large function body, a BEFORE INSERT trigger on reports
-- blocks intake on a suspended program for every write path at once.
--
-- The organization cannot leave 'suspended': private.program_status_transitions has no row
-- from it, so pause/resume/close all reject. Only reinstate_program (platform admin) does,
-- restoring the status recorded at suspension time.
--
-- Existing reports stay workable (triage, messages, bounties) -- suspension stops new
-- intake, it does not freeze in-flight work. Same single-admin, no-dual-control limitation
-- 202609050017 discloses for organization suspension.

alter table public.programs add column if not exists pre_suspension_status public.program_status;

-- ---------------------------------------------------------------------------
-- Intake gate
-- ---------------------------------------------------------------------------

create or replace function private.block_reports_on_suspended_program()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.programs p where p.id = new.program_id and p.status = 'suspended') then
    raise exception 'SUBMISSIONS_CLOSED: this program is not currently accepting reports' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_block_suspended_program on public.reports;
create trigger reports_block_suspended_program
  before insert on public.reports
  for each row execute function private.block_reports_on_suspended_program();

-- ---------------------------------------------------------------------------
-- Suspend / reinstate
-- ---------------------------------------------------------------------------

create or replace function public.suspend_program(target_program_id uuid, p_reason text)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  program public.programs;
  updated public.programs;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to suspend a program' using errcode = '42501';
  end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if program.status = 'suspended' then
    raise exception 'ALREADY_SUSPENDED: this program is already suspended' using errcode = '23514';
  end if;
  -- Only a live program has anything to stop. Draft/review never took reports (review has
  -- its own reject path); closed is already permanent.
  if program.status not in ('active', 'paused') then
    raise exception 'INVALID_PROGRAM_TRANSITION: only an active or paused program can be suspended' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_SUSPENSION: explain why this program is being suspended' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_SUSPENSION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.programs
    set status = 'suspended', pre_suspension_status = program.status, updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'platform.program_suspended', 'program', target_program_id,
          jsonb_build_object('reason', trimmed_reason, 'previous_status', program.status));

  return updated;
end;
$$;

revoke all on function public.suspend_program(uuid, text) from public;
grant execute on function public.suspend_program(uuid, text) to authenticated;

create or replace function public.reinstate_program(target_program_id uuid, p_reason text)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  program public.programs;
  updated public.programs;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to reinstate a program' using errcode = '42501';
  end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if program.status <> 'suspended' then
    raise exception 'NOT_SUSPENDED: this program is not suspended' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_REINSTATEMENT: explain why this program is being reinstated' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REINSTATEMENT: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.programs
    set status = coalesce(program.pre_suspension_status, 'paused'), pre_suspension_status = null, updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'platform.program_reinstated', 'program', target_program_id,
          jsonb_build_object('reason', trimmed_reason, 'restored_status', updated.status));

  return updated;
end;
$$;

revoke all on function public.reinstate_program(uuid, text) from public;
grant execute on function public.reinstate_program(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Oversight reads
-- ---------------------------------------------------------------------------

create or replace function public.get_platform_program_status_counts()
returns table (status public.program_status, program_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query select p.status, count(*) from public.programs p group by p.status;
end;
$$;

revoke all on function public.get_platform_program_status_counts() from public;
grant execute on function public.get_platform_program_status_counts() to authenticated;

-- ponytail: capped at 200 rows, no pagination -- add a keyset cursor when the platform
-- carries more programs than an admin can scan after filtering.
create or replace function public.list_programs_for_admin(p_search text default null, p_status public.program_status default null)
returns table (
  id uuid,
  name text,
  status public.program_status,
  visibility public.program_visibility,
  program_type public.program_type,
  engagement_type public.engagement_type,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  report_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  pattern text := '%' || nullif(trim(coalesce(p_search, '')), '') || '%';
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.status, p.visibility, p.program_type, p.engagement_type,
         o.id, o.name, o.slug,
         (select count(*) from public.reports r where r.program_id = p.id),
         p.created_at, p.updated_at
  from public.programs p
  join public.organizations o on o.id = p.organization_id
  where (p_status is null or p.status = p_status)
    and (pattern is null or p.name ilike pattern or o.name ilike pattern or o.slug ilike pattern)
  order by p.updated_at desc
  limit 200;
end;
$$;

revoke all on function public.list_programs_for_admin(text, public.program_status) from public;
grant execute on function public.list_programs_for_admin(text, public.program_status) to authenticated;
