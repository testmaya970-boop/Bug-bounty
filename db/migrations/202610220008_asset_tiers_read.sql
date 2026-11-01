-- Asset tiers for the inventory page (202610220006), without redefining list_organization_assets:
-- the tier of every asset the caller can see in that organization, plus whether they may change it.
create or replace function public.list_asset_tiers(target_org_id uuid)
returns table (asset_id uuid, tier smallint, can_edit boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  can_edit boolean;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m where m.organization_id = target_org_id and m.user_id = auth.uid() and m.status = 'active' and m.role <> 'billing_admin'
  ) or not private.actor_is_active() then
    raise exception 'FORBIDDEN: not a member of this organization' using errcode = '42501';
  end if;
  can_edit := private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]);
  return query select a.id, a.tier, can_edit from public.assets a where a.organization_id = target_org_id;
end;
$$;
revoke all on function public.list_asset_tiers(uuid) from public, anon;
grant execute on function public.list_asset_tiers(uuid) to authenticated;
