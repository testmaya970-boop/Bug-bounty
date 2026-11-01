-- Scope editing was locked to program.status = 'draft' since 202608260005 -- an org that
-- caught a scope mistake (wrong asset type, a typo'd domain, a target that needs adding or
-- retiring) after submitting for review, or after the program went active, had no way to
-- fix it at all. That lock is lifted here: add/update/remove_scope_entry no longer check
-- program lifecycle status. This is safe because reports already snapshot the scope they
-- matched at submission time (matched_scope_state/matched_target on public.reports, set by
-- link_report_to_scope_entry and report submission itself) -- editing scope after launch
-- never retroactively changes what an already-submitted report is recorded as having
-- matched. Target/asset_type immutability was already relaxed for update_scope_entry in
-- 202609090009 (confirmed with the user then); this migration only removes the separate
-- lifecycle gate, it does not touch that target-editing behavior.
--
-- remove_scope_entry on an active program needs its own care: a target a researcher is
-- actively relying on can be retired at any time by design (an org's authority over its
-- own scope doesn't pause once researchers show up), but this is intentionally NOT
-- announced to researchers by this migration -- no notification is wired here. That gap is
-- disclosed, not silently accepted: a future turn should add a notification when scope
-- narrows on an active program, the same way other program-state changes already notify.
--
-- While rewriting update_scope_entry for this migration, live-testing against a real
-- Postgres instance surfaced a genuine, pre-existing bug in 202609090009's version (still
-- live before this migration lands): its single UPDATE statement referenced `canon.*` in
-- a `case when target_changed then canon.x else x end` expression on every column, even
-- when target_input was omitted -- but Postgres evaluates every branch's column reference
-- for a record variable, so an untouched `canon` (never assigned when target_changed is
-- false) raised `record "canon" is not assigned yet` and failed the entire call. This
-- broke the plain "edit scope_state/description only" path -- the common case, and the
-- only one the UI's edit affordance drives today -- for every existing program, active or
-- draft, not just the post-launch case this migration is otherwise about. Fixed here by
-- branching into two separate UPDATE statements instead of one conditional-expression
-- statement, so the target_input-omitted path never references `canon` at all.

create or replace function public.add_scope_entry(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  target_input text,
  p_scope_state public.program_scope_state default 'in_scope',
  p_description text default null
)
returns public.program_scope_entries
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  canon record;
  trimmed_description text := nullif(trim(coalesce(p_description, '')), '');
  new_entry public.program_scope_entries;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage scope for this program' using errcode = '42501';
  end if;

  if trimmed_description is not null and char_length(trimmed_description) > 500 then
    raise exception 'INVALID_DESCRIPTION: Use 500 characters or fewer.' using errcode = '22023';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);

  begin
    insert into public.program_scope_entries (program_id, organization_id, asset_type, target, display_target, target_cidr, url_origin, url_path, scope_state, description, created_by)
    values (target_program_id, program.organization_id, p_asset_type, canon.canonical, canon.display, canon.cidr_value, canon.url_origin, canon.url_path, p_scope_state, trimmed_description, actor)
    returning * into new_entry;
  exception when unique_violation then
    raise exception 'DUPLICATE_TARGET: This target is already in scope for this program.' using errcode = '23505';
  end;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'scope.asset_added', 'program_scope_entry', new_entry.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical, 'scope_state', p_scope_state, 'program_status', program.status));

  return new_entry;
end;
$$;

create or replace function public.update_scope_entry(
  entry_id uuid,
  p_scope_state public.program_scope_state,
  p_description text default null,
  p_asset_type public.program_asset_type default null,
  target_input text default null
)
returns public.program_scope_entries
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  entry public.program_scope_entries;
  program public.programs;
  trimmed_description text := nullif(trim(coalesce(p_description, '')), '');
  canon record;
  effective_asset_type public.program_asset_type;
  target_changed boolean := false;
  updated public.program_scope_entries;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into entry from public.program_scope_entries where id = entry_id for update;
  if entry.id is null or entry.status = 'removed' then
    raise exception 'SCOPE_ENTRY_NOT_FOUND: scope entry not found' using errcode = 'P0002';
  end if;

  select * into program from public.programs where id = entry.program_id;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage scope for this program' using errcode = '42501';
  end if;

  if trimmed_description is not null and char_length(trimmed_description) > 500 then
    raise exception 'INVALID_DESCRIPTION: Use 500 characters or fewer.' using errcode = '22023';
  end if;

  if target_input is not null then
    effective_asset_type := coalesce(p_asset_type, entry.asset_type);
    select * into canon from private.canonicalize_scope_target(effective_asset_type, target_input);
    target_changed := true;
  end if;

  begin
    if target_changed then
      update public.program_scope_entries
        set
          scope_state = p_scope_state,
          description = trimmed_description,
          asset_type = effective_asset_type,
          target = canon.canonical,
          display_target = canon.display,
          target_cidr = canon.cidr_value,
          url_origin = canon.url_origin,
          url_path = canon.url_path,
          updated_at = now()
        where id = entry_id
        returning * into updated;
    else
      update public.program_scope_entries
        set scope_state = p_scope_state, description = trimmed_description, updated_at = now()
        where id = entry_id
        returning * into updated;
    end if;
  exception when unique_violation then
    raise exception 'DUPLICATE_TARGET: This target is already in scope for this program.' using errcode = '23505';
  end;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'scope.asset_updated', 'program_scope_entry', entry_id,
    jsonb_build_object(
      'program_id', program.id,
      'previous_scope_state', entry.scope_state, 'new_scope_state', p_scope_state,
      'previous_asset_type', entry.asset_type, 'new_asset_type', updated.asset_type,
      'previous_target', entry.target, 'new_target', updated.target,
      'program_status', program.status
    ));

  return updated;
end;
$$;

create or replace function public.remove_scope_entry(entry_id uuid)
returns public.program_scope_entries
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  entry public.program_scope_entries;
  program public.programs;
  updated public.program_scope_entries;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into entry from public.program_scope_entries where id = entry_id for update;
  if entry.id is null or entry.status = 'removed' then
    raise exception 'SCOPE_ENTRY_NOT_FOUND: scope entry not found' using errcode = 'P0002';
  end if;

  select * into program from public.programs where id = entry.program_id;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage scope for this program' using errcode = '42501';
  end if;

  update public.program_scope_entries
    set status = 'removed', removed_at = now(), removed_by = actor, updated_at = now()
    where id = entry_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'scope.asset_removed', 'program_scope_entry', entry_id,
    jsonb_build_object('program_id', program.id, 'asset_type', entry.asset_type, 'target', entry.target, 'program_status', program.status));

  return updated;
end;
$$;
