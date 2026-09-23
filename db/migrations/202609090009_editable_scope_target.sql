-- Turn: scope target editing. docs/decisions/0006-scope-asset-model.md's own "not built"
-- list (line 69) named this exact gap deliberately: "Editing a scope entry's underlying
-- target/type (only scope_state and description are editable after creation; changing the
-- target itself means removing and re-adding, keeping audit history unambiguous about what
-- target existed when)." That trade-off is a real, explicit product decision to override,
-- not an oversight to silently work around -- confirmed with the user directly. This
-- migration widens update_scope_entry to also accept asset_type + a new target, running
-- the SAME canonicalize_scope_target every add_scope_entry call already goes through, so
-- an edited target is validated and deduplicated identically to a newly-added one.
--
-- The audit-ambiguity risk 0006 named is real and is not eliminated here, only mitigated:
-- the audit_logs row this function writes now carries BOTH the previous and new
-- target/asset_type in its metadata, so a reader of that specific row can still recover
-- what the target was before this edit -- but nothing rewrites any EARLIER audit_logs row
-- (e.g. the original 'scope.asset_added' row still says 'target: test.com' even after this
-- edit changes it to 'test2.com'). That earlier ambiguity is the accepted, disclosed cost
-- of this change.

drop function if exists public.update_scope_entry(uuid, public.program_scope_state, text);

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

  if program.status <> 'draft' then
    raise exception 'SCOPE_LOCKED: scope can only be changed while the program is in draft' using errcode = '55000';
  end if;

  if trimmed_description is not null and char_length(trimmed_description) > 500 then
    raise exception 'INVALID_DESCRIPTION: Use 500 characters or fewer.' using errcode = '22023';
  end if;

  -- target_input is optional -- omitting it (the state/description-only edit path every
  -- existing caller still uses) leaves target/asset_type/display_target/target_cidr/
  -- url_origin/url_path completely untouched. p_asset_type defaults to the entry's own
  -- current type when target_input is provided but p_asset_type is not, so a caller
  -- editing only the target string doesn't also have to re-pass the unchanged type.
  if target_input is not null then
    effective_asset_type := coalesce(p_asset_type, entry.asset_type);
    select * into canon from private.canonicalize_scope_target(effective_asset_type, target_input);
    target_changed := true;
  end if;

  begin
    update public.program_scope_entries
      set
        scope_state = p_scope_state,
        description = trimmed_description,
        asset_type = case when target_changed then effective_asset_type else asset_type end,
        target = case when target_changed then canon.canonical else target end,
        display_target = case when target_changed then canon.display else display_target end,
        target_cidr = case when target_changed then canon.cidr_value else target_cidr end,
        url_origin = case when target_changed then canon.url_origin else url_origin end,
        url_path = case when target_changed then canon.url_path else url_path end,
        updated_at = now()
      where id = entry_id
      returning * into updated;
  exception when unique_violation then
    raise exception 'DUPLICATE_TARGET: This target is already in scope for this program.' using errcode = '23505';
  end;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'scope.asset_updated', 'program_scope_entry', entry_id,
    jsonb_build_object(
      'program_id', program.id,
      'previous_scope_state', entry.scope_state, 'new_scope_state', p_scope_state,
      'previous_asset_type', entry.asset_type, 'new_asset_type', updated.asset_type,
      'previous_target', entry.target, 'new_target', updated.target
    ));

  return updated;
end;
$$;

revoke all on function public.update_scope_entry(uuid, public.program_scope_state, text, public.program_asset_type, text) from public;
grant execute on function public.update_scope_entry(uuid, public.program_scope_state, text, public.program_asset_type, text) to authenticated;
