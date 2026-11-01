-- Re-engagement emails: "a new program matches your focus" to researchers who haven't been
-- around lately, the way large bug bounty platforms bring hunters back when a program they
-- would care about launches. Through the same audit_logs -> outbox -> worker -> router ->
-- notification -> email pipeline as every other notice, so the recipient is re-checked at
-- send time and every email is idempotent per delivery.
--
-- Who gets one, when a program becomes active AND public (launched public, or an active
-- program made public):
--   * a researcher account: email verified, not suspended, not deactivated, not platform staff;
--   * inactive: no use of the app for engagement_email_settings.inactive_after_days (14);
--   * the program's focus areas overlap the researcher's own hacking interests (Settings > Skills);
--     no interests set = no match, so nobody gets mail about things they never said they hunt;
--   * not already taking part in the program;
--   * hasn't had one in the last min_days_between days (7) -- one email a week at most;
--   * hasn't turned the category off (Settings > Notifications; on by default, every email
--     says how to turn it off).
-- Capped at 1000 recipients per program launch (ponytail: raise or batch if the researcher
-- base outgrows it). Platform admins can pause it and tune both thresholds.

-- When was this account last used? Sessions are refreshed every 5 minutes of use
-- (202610050004) but deleted at sign-out, so keep the latest on the user.
alter table public.users add column if not exists last_active_at timestamptz;
update public.users u set last_active_at = s.last_seen
from (select user_id, max(greatest(updated_at, created_at)) as last_seen from public.sessions group by user_id) s
where s.user_id = u.id and (u.last_active_at is null or u.last_active_at < s.last_seen);

create or replace function private.sessions_touch_last_active()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- At most one write per user per hour, so a busy session doesn't add an update per request.
  update public.users set last_active_at = now()
  where id = new.user_id and (last_active_at is null or last_active_at < now() - interval '1 hour');
  return new;
end;
$$;
revoke all on function private.sessions_touch_last_active() from public, anon;
grant execute on function private.sessions_touch_last_active() to service_role;
create trigger sessions_touch_last_active after insert or update of updated_at on public.sessions
  for each row execute function private.sessions_touch_last_active();

-- Platform admin settings (one row).
create table public.engagement_email_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  inactive_after_days integer not null default 14 check (inactive_after_days between 1 and 365),
  min_days_between integer not null default 7 check (min_days_between between 1 and 90),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);
insert into public.engagement_email_settings (id) values (true) on conflict do nothing;
alter table public.engagement_email_settings enable row level security;
grant select on public.engagement_email_settings to service_role;

create or replace function public.get_engagement_email_settings()
returns public.engagement_email_settings
language plpgsql stable security definer set search_path = ''
as $$
declare
  result public.engagement_email_settings;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  select * into result from public.engagement_email_settings where id;
  return result;
end;
$$;
revoke all on function public.get_engagement_email_settings() from public, anon;
grant execute on function public.get_engagement_email_settings() to authenticated;

create or replace function public.update_engagement_email_settings(p_enabled boolean, p_inactive_after_days integer, p_min_days_between integer)
returns public.engagement_email_settings
language plpgsql security definer set search_path = ''
as $$
declare
  result public.engagement_email_settings;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  if p_inactive_after_days is null or p_inactive_after_days not between 1 and 365 then
    raise exception 'INVALID_INACTIVE_DAYS: choose between 1 and 365 days' using errcode = '22023';
  end if;
  if p_min_days_between is null or p_min_days_between not between 1 and 90 then
    raise exception 'INVALID_FREQUENCY: choose between 1 and 90 days' using errcode = '22023';
  end if;
  update public.engagement_email_settings
  set enabled = coalesce(p_enabled, enabled), inactive_after_days = p_inactive_after_days, min_days_between = p_min_days_between,
      updated_by = auth.uid(), updated_at = now()
  where id returning * into result;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform.engagement_emails_updated', 'engagement_email_settings', null,
    jsonb_build_object('enabled', result.enabled, 'inactive_after_days', result.inactive_after_days, 'min_days_between', result.min_days_between));
  return result;
end;
$$;
revoke all on function public.update_engagement_email_settings(boolean, integer, integer) from public, anon;
grant execute on function public.update_engagement_email_settings(boolean, integer, integer) to authenticated;

-- Notification vocabulary: a new category and type.
alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category = any (array['report_activity', 'bounty_activity', 'platform_activity', 'billing_activity', 'program_activity', 'program_recommendations']));

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable',
  'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted', 'report_message_posted', 'program_suspended',
  'program_reinstated', 'organization_suspended', 'organization_reinstated', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded',
  'payment_failed', 'payment_cancelled', 'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided',
  'report_mediation_resolved', 'report_reopened', 'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined',
  'report_disclosure_unpublished', 'deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued',
  'program_launch_approved', 'program_launch_rejected', 'program_paused', 'program_resumed', 'program_closed', 'program_scope_changed',
  'program_recommended']));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array['report_created', 'report_needs_information', 'report_resolved', 'report_duplicate',
    'report_informative', 'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted',
    'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened',
    'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined', 'report_disclosure_unpublished']))
  or (category = 'bounty_activity' and notification_type = any (array['bounty_finalized', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled']))
  or (category = 'platform_activity' and notification_type = any (array['program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated', 'program_launch_approved', 'program_launch_rejected']))
  or (category = 'billing_activity' and notification_type = any (array['deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued']))
  or (category = 'program_activity' and notification_type = any (array['program_paused', 'program_resumed', 'program_closed', 'program_scope_changed']))
  or (category = 'program_recommendations' and notification_type = 'program_recommended')
);

alter table public.notifications drop constraint notifications_subject_shape_check;
alter table public.notifications add constraint notifications_subject_shape_check check (
  (category not in ('platform_activity', 'billing_activity', 'program_activity', 'program_recommendations') and report_id is not null and program_id is not null)
  or (category = 'platform_activity' and report_id is null
      and (notification_type = any (array['program_suspended', 'program_reinstated', 'program_launch_approved', 'program_launch_rejected'])) = (program_id is not null))
  or (category = 'billing_activity' and report_id is null and program_id is null)
  or (category in ('program_activity', 'program_recommendations') and report_id is null and program_id is not null)
);

-- Preferences: the new category can be turned off.
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('report_activity', 'program_recommendations'));

CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
 RETURNS TABLE(category text, email_enabled boolean, is_mandatory boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    )
    union all
    -- Researchers only (202610210005).
    select 'program_recommendations'::text, coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = actor and np.category = 'program_recommendations'), true), false
    where exists (select 1 from public.users u where u.id = actor and u.account_type = 'researcher');
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_notification_preference(p_category text, p_email_enabled boolean)
 RETURNS notification_preferences
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  result public.notification_preferences;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000';
  end if;

  if p_category not in ('report_activity', 'program_recommendations') then
    raise exception 'CATEGORY_NOT_CONFIGURABLE: % cannot be disabled -- it is a mandatory notification category', p_category using errcode = '22023';
  end if;

  insert into public.notification_preferences (user_id, category, email_enabled, updated_at)
  values (actor, p_category, p_email_enabled, now())
  on conflict (user_id, category) do update set email_enabled = excluded.email_enabled, updated_at = now()
  returning * into result;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'notification_preference.updated', 'notification_preference', null, jsonb_build_object('category', p_category, 'email_enabled', p_email_enabled));

  return result;
end;
$function$;

-- A program becoming active + public is recorded once, which starts the pipeline.
create or replace function private.programs_record_published()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' and new.visibility = 'public'
     and not (coalesce(old.status::text, '') = 'active' and coalesce(old.visibility::text, '') = 'public') then
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), new.organization_id, 'program.published', 'program', new.id, jsonb_build_object('program_name', new.name));
  end if;
  return new;
end;
$$;
revoke all on function private.programs_record_published() from public, anon;
grant execute on function private.programs_record_published() to service_role;
create trigger programs_record_published after update of status, visibility on public.programs
  for each row execute function private.programs_record_published();

-- audit_logs -> outbox: reuses enqueue_program_event (entity_id is the program).
create trigger audit_logs_enqueue_program_published
  after insert on public.audit_logs
  for each row when (new.action = 'program.published')
  execute function private.enqueue_program_event();

-- outbox -> notifications.
create or replace function public.route_program_recommendations(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  prog public.programs;
  cfg public.engagement_email_settings;
begin
  if p_notification_type <> 'program_recommended' then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a recommendation type', p_notification_type using errcode = '22023';
  end if;
  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.audit_logs al where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = 'program.published') then
    raise exception 'PROVENANCE_MISMATCH: no matching program record in audit_logs' using errcode = '23514';
  end if;
  select * into cfg from public.engagement_email_settings where id;
  select * into prog from public.programs where id = (ev.payload ->> 'program_id')::uuid;
  -- Paused or turned private again before the worker got to it: nothing to recommend.
  if not coalesce(cfg.enabled, false) or prog.id is null or prog.status <> 'active' or prog.visibility <> 'public' or coalesce(cardinality(prog.focus_areas), 0) = 0 then
    return;
  end if;

  insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
  select u.id, prog.organization_id, prog.id, null, 'program_recommendations', 'program_recommended', ev.id, ev.occurred_at
  from public.users u
  join public.researcher_profiles rp on rp.user_id = u.id
  where u.account_type = 'researcher' and u.email_verified_at is not null and not u.is_suspended and u.deactivated_at is null
    and not exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
    and coalesce(u.last_active_at, u.created_at) < now() - make_interval(days => cfg.inactive_after_days)
    and rp.hacking_interests && prog.focus_areas
    and not exists (select 1 from public.program_researchers pr where pr.program_id = prog.id and pr.user_id = u.id)
    and coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = u.id and np.category = 'program_recommendations'), true)
    and not exists (select 1 from public.notifications n where n.recipient_id = u.id and n.notification_type = 'program_recommended'
                    and n.created_at > now() - make_interval(days => cfg.min_days_between))
  order by coalesce(u.last_active_at, u.created_at) desc
  limit 1000
  on conflict (source_event_id, recipient_id) do nothing;

  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;
revoke all on function public.route_program_recommendations(uuid, text) from public, authenticated, anon;
grant execute on function public.route_program_recommendations(uuid, text) to service_role;

-- Email authorization at send time. Same function as 202610160005 plus one branch: a
-- recommendation still goes out only if the program is still active + public, the recipient
-- still hasn't turned the category off, and the account is still a usable researcher.
CREATE OR REPLACE FUNCTION public.prepare_notification_email(p_delivery_id uuid)
 RETURNS TABLE(deliverable boolean, reason text, recipient_email text, recipient_display_name text, report_title text, program_name text, organization_name text, notification_type text, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  delivery public.notification_deliveries;
  notif public.notifications;
  authorized boolean;
begin
  select * into delivery from public.notification_deliveries where id = p_delivery_id for update;
  if delivery.id is null then
    return query select false, 'DELIVERY_NOT_FOUND'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if delivery.state in ('delivered', 'permanent_failure') then
    return query select false, 'ALREADY_TERMINAL'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Another worker claimed it moments ago (lease reclaim, retry): let that one finish. A
  -- 'processing' row older than 5 minutes is a worker that died mid-send, so it is retried.
  if delivery.state = 'processing' and delivery.updated_at > now() - interval '5 minutes' then
    return query select false, 'IN_PROGRESS'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into notif from public.notifications where id = delivery.notification_id;

  if notif.category = 'billing_activity' then
    authorized := case when notif.notification_type = 'deposit_reported'
      then exists (select 1 from public.platform_admins pa where pa.user_id = notif.recipient_id)
      else exists (select 1 from public.organization_members m where m.organization_id = notif.organization_id and m.user_id = notif.recipient_id
        and m.status = 'active' and m.role in ('owner', 'security_admin', 'billing_admin')) end;
  elsif notif.category = 'program_activity' then
    -- Still taking part in the program the notice is about (202610160005).
    authorized := exists (
      select 1 from public.program_researchers pr
      where pr.program_id = notif.program_id and pr.user_id = notif.recipient_id and pr.status = 'active'
    );
  elsif notif.category = 'program_recommendations' then
    -- 202610210005: still public and active, still wanted, still a usable researcher account.
    authorized := exists (select 1 from public.programs p where p.id = notif.program_id and p.status = 'active' and p.visibility = 'public')
      and exists (select 1 from public.users u where u.id = notif.recipient_id and u.account_type = 'researcher' and not u.is_suspended and u.deactivated_at is null)
      and coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = notif.recipient_id and np.category = 'program_recommendations'), true);
  elsif notif.category = 'platform_activity' then
    -- Still an active owner/security_admin of the organization the notice is about.
    authorized := exists (
      select 1 from public.organization_members m
      where m.organization_id = notif.organization_id and m.user_id = notif.recipient_id
        and m.status = 'active' and m.role in ('owner', 'security_admin')
    );
  else
    authorized := private.can_currently_read_report(notif.report_id, notif.recipient_id);
  end if;

  if not authorized then
    update public.notification_deliveries
      set state = 'permanent_failure', last_error = 'RECIPIENT_NO_LONGER_AUTHORIZED', updated_at = now()
      where id = p_delivery_id;
    return query select false, 'RECIPIENT_NO_LONGER_AUTHORIZED'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  update public.notification_deliveries set state = 'processing', updated_at = now() where id = p_delivery_id;

  return query
    select true, null::text, u.email, u.display_name, rp.title, prog.name, org.name, notif.notification_type, notif.occurred_at
    from public.notifications n
    join public.users u on u.id = n.recipient_id
    left join public.reports rp on rp.id = n.report_id
    left join public.programs prog on prog.id = n.program_id
    join public.organizations org on org.id = n.organization_id
    where n.id = notif.id;
end;
$function$;
