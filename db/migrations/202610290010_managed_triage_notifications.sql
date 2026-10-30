-- Managed Triage notices (follow-up to 202610290008). A request reaches Unpatched's platform
-- admins, who activate it; the organization hears when it is activated, declined, or paused
-- because a renewal wasn't paid. Same billing-notice path as a reported deposit: an audit row,
-- an outbox event, route_billing_notifications, and the email re-check.

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable',
  'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted', 'report_message_posted', 'program_suspended',
  'program_reinstated', 'organization_suspended', 'organization_reinstated', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded',
  'payment_failed', 'payment_cancelled', 'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided',
  'report_mediation_resolved', 'report_reopened', 'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined',
  'report_disclosure_unpublished', 'deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued',
  'program_launch_approved', 'program_launch_rejected', 'program_paused', 'program_resumed', 'program_closed', 'program_scope_changed',
  'program_recommended', 'report_triage_escalated', 'report_escalation_answered',
  'managed_triage_requested', 'managed_triage_activated', 'managed_triage_declined', 'managed_triage_past_due']));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array['report_created', 'report_needs_information', 'report_resolved', 'report_duplicate',
    'report_informative', 'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted',
    'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened',
    'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined', 'report_disclosure_unpublished',
    'report_triage_escalated', 'report_escalation_answered']))
  or (category = 'bounty_activity' and notification_type = any (array['bounty_finalized', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled']))
  or (category = 'platform_activity' and notification_type = any (array['program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated', 'program_launch_approved', 'program_launch_rejected']))
  or (category = 'billing_activity' and notification_type = any (array['deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued',
    'managed_triage_requested', 'managed_triage_activated', 'managed_triage_declined', 'managed_triage_past_due']))
  or (category = 'program_activity' and notification_type = any (array['program_paused', 'program_resumed', 'program_closed', 'program_scope_changed']))
  or (category = 'program_recommendations' and notification_type = 'program_recommended')
);

drop trigger audit_logs_enqueue_billing_event on public.audit_logs;
create trigger audit_logs_enqueue_billing_event
  after insert on public.audit_logs
  for each row
  when (new.action in ('billing.deposit_reported', 'billing.deposit_confirmed', 'billing.deposit_rejected', 'billing.balance_low', 'billing.invoice_issued',
                       'managed_triage.requested', 'managed_triage.activated', 'managed_triage.declined', 'managed_triage.past_due'))
  execute function private.enqueue_billing_event();

create or replace function public.route_billing_notifications(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  expected_action text;
begin
  expected_action := case
    when p_notification_type in ('deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued') then 'billing.' || p_notification_type
    when p_notification_type in ('managed_triage_requested', 'managed_triage_activated', 'managed_triage_declined', 'managed_triage_past_due')
      then 'managed_triage.' || substr(p_notification_type, 16)
  end;
  if expected_action is null then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a billing notification type', p_notification_type using errcode = '22023';
  end if;
  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.audit_logs al where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = expected_action) then
    raise exception 'PROVENANCE_MISMATCH: no matching billing record in audit_logs' using errcode = '23514';
  end if;

  if p_notification_type in ('deposit_reported', 'managed_triage_requested') then
    -- Unpatched's own staff act on these (confirm the deposit, activate the service).
    insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
    select pa.user_id, ev.organization_id, null, null, 'billing_activity', p_notification_type, ev.id, ev.occurred_at
    from public.platform_admins pa join public.users u on u.id = pa.user_id
    where u.deactivated_at is null
    on conflict (source_event_id, recipient_id) do nothing;
  else
    insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
    select m.user_id, ev.organization_id, null, null, 'billing_activity', p_notification_type, ev.id, ev.occurred_at
    from public.organization_members m
    where m.organization_id = ev.organization_id and m.status = 'active' and m.role in ('owner', 'security_admin', 'billing_admin')
    on conflict (source_event_id, recipient_id) do nothing;
  end if;
  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;
revoke all on function public.route_billing_notifications(uuid, text) from public, authenticated, anon;
grant execute on function public.route_billing_notifications(uuid, text) to service_role;

-- Email re-check: a Managed Triage request goes to platform admins, like a reported deposit.
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
    authorized := case when notif.notification_type in ('deposit_reported', 'managed_triage_requested')
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
