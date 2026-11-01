-- Numbers for Platform > Engagement emails (202610210005): how many went out lately, to how
-- many people, and how many researchers turned them off.
create or replace function public.get_engagement_email_stats()
returns table (notified_30d integer, emailed_30d integer, opted_out integer, last_sent_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  return query
  select
    (select count(*)::int from public.notifications n where n.notification_type = 'program_recommended' and n.created_at > now() - interval '30 days'),
    (select count(*)::int from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
       where n.notification_type = 'program_recommended' and d.state = 'delivered' and d.updated_at > now() - interval '30 days'),
    (select count(*)::int from public.notification_preferences np where np.category = 'program_recommendations' and not np.email_enabled),
    (select max(n.created_at) from public.notifications n where n.notification_type = 'program_recommended');
end;
$$;
revoke all on function public.get_engagement_email_stats() from public, anon;
grant execute on function public.get_engagement_email_stats() to authenticated;
