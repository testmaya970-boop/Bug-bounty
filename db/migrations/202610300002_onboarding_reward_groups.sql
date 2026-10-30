-- Onboarding gains "Choose your reward groups" (202610300001). The existing function is moved
-- aside unchanged (renamed, not copied, so its body can't drift) and wrapped: the wrapper adds
-- one key. Same authorization, since the original still runs first.
alter function public.get_organization_onboarding(uuid) rename to organization_onboarding_base;
alter function public.organization_onboarding_base(uuid) set schema private;
revoke all on function private.organization_onboarding_base(uuid) from public, anon;
grant execute on function private.organization_onboarding_base(uuid) to authenticated, service_role;

create or replace function public.get_organization_onboarding(target_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  return private.organization_onboarding_base(target_organization_id)
    || jsonb_build_object('reward_groups', exists (select 1 from public.reward_groups g where g.organization_id = target_organization_id and g.archived_at is null));
end;
$$;
revoke all on function public.get_organization_onboarding(uuid) from public, anon;
grant execute on function public.get_organization_onboarding(uuid) to authenticated;
