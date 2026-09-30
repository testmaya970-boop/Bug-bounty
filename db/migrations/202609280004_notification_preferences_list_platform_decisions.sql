-- List platform decisions among a person's notification preferences -- to the people who
-- actually receive them (2026-09-28).
--
-- 202609250007 added the mandatory 'platform_activity' category (the platform suspended
-- or reinstated your organization or one of its programs), routed to an organization's
-- active owners and security admins, but get_my_notification_preferences still listed only
-- report and bounty activity, so Settings never showed it to anyone. It is listed now,
-- always on, exactly for the recipients route_platform_notifications would pick.
-- Unchanged otherwise; the UI shows each account type only the categories that reach it.

create or replace function public.get_my_notification_preferences()
returns table (category text, email_enabled boolean, is_mandatory boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000';
  end if;

  return query
    select 'report_activity'::text, coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = actor and np.category = 'report_activity'), true), false
    union all
    select 'bounty_activity'::text, true, true
    union all
    select 'platform_activity'::text, true, true
    where exists (
      select 1 from public.organization_members m
      where m.user_id = actor and m.status = 'active' and m.role in ('owner', 'security_admin')
    );
end;
$$;
