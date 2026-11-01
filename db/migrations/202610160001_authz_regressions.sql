-- Audit P0-1 and P0-2 (Oct 15 system design audit): two live authorization gaps.
--
-- 1. list_researchers_for_organization regressed to "any active member". 202610060004 scoped
--    it to owner / security_admin / program_manager, but 202610130001 re-created it from an
--    older body that still called private.authorize_organization_analytics_read, so a triager
--    or billing admin could call it directly and read the org's researcher list (the UI never
--    offers that page to them). Re-scoped here, and the old helper now fails closed: a future
--    copy of an old body breaks loudly instead of silently widening access again. It was the
--    only remaining caller (checked against the live catalog).
--
-- 2. researcher_profiles had "profiles public read" using (true): every signed-in account,
--    organization accounts included, could read any researcher's resume_url, linkedin_url and
--    external handles, ignoring the public-profile opt-in and deactivation. The table is now
--    own-row only. The one cross-user read in the app (the biography an organization sees
--    beside a report) goes through get_researcher_biography; public profiles already go
--    through get_public_researcher_profile (SECURITY DEFINER, opt-in aware).

do $$
declare
  definition text;
  rewritten text;
begin
  select pg_get_functiondef('public.list_researchers_for_organization'::regproc) into definition;
  rewritten := replace(definition,
    'private.authorize_organization_analytics_read(target_organization_id)',
    'private.authorize_organization_read(target_organization_id, array[''owner'', ''security_admin'', ''program_manager'']::public.organization_member_role[])');
  if rewritten = definition then
    raise exception 'list_researchers_for_organization does not call authorize_organization_analytics_read(target_organization_id) as expected';
  end if;
  execute rewritten;
end;
$$;

create or replace function private.authorize_organization_analytics_read(target_organization_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  raise exception 'FORBIDDEN: authorize_organization_analytics_read is retired -- use private.authorize_organization_read with the roles that may see this' using errcode = '42501';
end;
$$;

drop policy "profiles public read" on public.researcher_profiles;
create policy "profiles own read" on public.researcher_profiles for select to authenticated using (user_id = auth.uid());

create or replace function public.get_researcher_biography(p_user_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select rp.biography
  from public.researcher_profiles rp
  join public.users u on u.id = rp.user_id
  where rp.user_id = p_user_id and u.deactivated_at is null and auth.uid() is not null;
$$;
revoke all on function public.get_researcher_biography(uuid) from public, anon;
grant execute on function public.get_researcher_biography(uuid) to authenticated;
