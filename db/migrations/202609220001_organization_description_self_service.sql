-- ---------------------------------------------------------------------------
-- Organization Settings self-service: `public.organizations` had no editable field
-- beyond name (set once at creation, never changeable) and no description at all --
-- confirmed live: the Settings page rendered three static paragraphs (identity, member
-- count, program count) with no real control an owner could act on. This adds the one
-- genuine self-service field the org identity is missing -- a free-text description,
-- the same "real, minimal self-service" scope researcher_profiles.biography already
-- established (202609010002) -- not a rename (the slug/URL-identity implications of
-- renaming are a separate, larger decision, deliberately out of scope here) and not a
-- logo/branding upload (same deferred-avatar-upload precedent as researcher profiles).
-- ---------------------------------------------------------------------------

alter table public.organizations add column description text;

-- ---------------------------------------------------------------------------
-- update_organization_description: owner/security_admin only, matching every other
-- organization-identity mutation's authorization tier (private.has_org_role, see
-- 202608260001) -- description is organization identity, the same class of fact as
-- membership/role, never a per-member preference. Audit-logged like every other real
-- organization mutation (change_member_role's own precedent).
-- ---------------------------------------------------------------------------

create or replace function public.update_organization_description(target_org_id uuid, p_description text)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_description text := nullif(trim(coalesce(p_description, '')), '');
  previous_description text;
  updated public.organizations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can edit organization settings' using errcode = '42501';
  end if;

  if trimmed_description is not null and char_length(trimmed_description) > 2000 then
    raise exception 'INVALID_DESCRIPTION: Use 2000 characters or fewer.' using errcode = '22023';
  end if;

  select description into previous_description from public.organizations where id = target_org_id;

  update public.organizations set description = trimmed_description, updated_at = now()
    where id = target_org_id
    returning * into updated;

  if updated.id is null then
    raise exception 'ORGANIZATION_NOT_FOUND: organization not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'organization.description_updated', 'organization', target_org_id,
    jsonb_build_object('previous_description', previous_description, 'new_description', trimmed_description));

  return updated;
end;
$$;

revoke all on function public.update_organization_description(uuid, text) from public;
grant execute on function public.update_organization_description(uuid, text) to authenticated;
