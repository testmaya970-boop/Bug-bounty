-- Program-launch review gate. Closes 0026's own single highest-leverage platform-tier
-- item: "Submit for review -> Platform approval? -> Publish -> Researcher discovery" was
-- four consecutive broken/self-certified arrows (0026 Section H). This migration fixes
-- exactly the second arrow: activate_program (review -> active) now requires REAL
-- platform-admin authority, not the organization's own owner/security_admin -- an
-- organization can no longer self-certify its own program launch.
--
-- submit_program_for_review (draft -> review) is UNCHANGED -- an organization still
-- decides when it believes a program is ready; the platform now decides whether it
-- actually goes live. This is the same two-step shape HackerOne/Intigriti's own launch
-- process uses (org prepares -> platform reviews), per 0026's own causal reasoning
-- (Section C).
--
-- A rejected review needs a real path back to 'draft' (to fix and resubmit) -- 'review'
-- currently only has one outgoing edge (to 'active') in private.program_status_transitions,
-- so a new review->draft edge is added. This is the one new transition-table row this
-- migration introduces; every other edge is unchanged.

insert into private.program_status_transitions (from_status, to_status) values ('review', 'draft')
  on conflict (from_status, to_status) do nothing;

-- ---------------------------------------------------------------------------
-- activate_program, redefined: identical shape to the original (still asserts
-- program.status = 'review' specifically, still validates against the shared transition
-- table, still one hardcoded target status) except its authorization is now
-- private.is_platform_admin() instead of the org's own has_org_role/is_program_member --
-- the org can no longer activate its own program launch. Locking still happens first
-- (this function does its own SELECT ... FOR UPDATE rather than calling
-- private.lock_and_authorize_program_for_lifecycle, since that helper's own authorization
-- check is exactly what must NOT apply here).
-- ---------------------------------------------------------------------------

create or replace function public.activate_program(target_program_id uuid)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to approve a program launch' using errcode = '42501';
  end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if program.status <> 'review' or not private.is_valid_program_transition(program.status, 'active') then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program cannot be activated from its current state' using errcode = '23514';
  end if;

  update public.programs set status = 'active', updated_at = now() where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'platform.program_launch_approved', 'program', target_program_id, jsonb_build_object());

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_program_launch: the platform-admin-only sibling for the other real outcome of a
-- review -- reverts to 'draft' (via the new transition-table row above) with a required
-- reason, so the organization sees exactly why and can fix and resubmit.
-- ---------------------------------------------------------------------------

create or replace function public.reject_program_launch(target_program_id uuid, p_reason text)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  trimmed_reason text := trim(coalesce(p_reason, ''));
  updated public.programs;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to reject a program launch' using errcode = '42501';
  end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if program.status <> 'review' then
    raise exception 'INVALID_PROGRAM_TRANSITION: this program is not currently awaiting review' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_REJECTION: explain why this program launch was rejected' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REJECTION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.programs set status = 'draft', updated_at = now() where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'platform.program_launch_rejected', 'program', target_program_id, jsonb_build_object('reason', trimmed_reason));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_programs_pending_review_for_admin: the queue a platform admin actually works from.
-- Same shape as list_needs_recovery_*/list_escalated_*_for_admin -- independently
-- re-checks is_platform_admin() inside its own body.
-- ---------------------------------------------------------------------------

create or replace function public.list_programs_pending_review_for_admin()
returns table (
  id uuid,
  name text,
  description text,
  organization_id uuid,
  organization_name text,
  submitted_at timestamptz,
  program_type public.program_type,
  engagement_type public.engagement_type,
  visibility public.program_visibility,
  requires_kyc boolean,
  focus_areas public.researcher_focus_area[],
  scope_entry_count bigint
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.name, p.description, p.organization_id, o.name, p.updated_at,
    p.program_type, p.engagement_type, p.visibility, p.requires_kyc, p.focus_areas,
    (select count(*) from public.program_scope_entries s where s.program_id = p.id and s.status = 'active')
  from public.programs p
  join public.organizations o on o.id = p.organization_id
  where p.status = 'review'
  order by p.updated_at asc;
end;
$$;

revoke all on function public.list_programs_pending_review_for_admin() from public;
grant execute on function public.list_programs_pending_review_for_admin() to authenticated;

revoke all on function public.reject_program_launch(uuid, text) from public;
grant execute on function public.reject_program_launch(uuid, text) to authenticated;
