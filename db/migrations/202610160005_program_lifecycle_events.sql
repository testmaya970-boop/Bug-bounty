-- Audit P1-4 (Oct 15 system design audit): program lifecycle and scope changes were audited but
-- never reached the outbox, so nobody was told. A researcher hunting on a program never learned
-- it was paused, closed or that its scope narrowed (202609230001 disclosed that gap), and an
-- organization was never told its launch was approved or rejected.
--
-- Now, through the same audit_logs -> outbox -> worker -> router pipeline as everything else:
--   program.paused / program.resumed / program.closed      -> program_activity, to the program's active researchers
--   scope.asset_added / _updated / _removed (live programs) -> program_scope_changed, same recipients,
--                                                              at most one per researcher per program per hour
--                                                              (a 50-row scope import is one notice, not 50)
--   platform.program_launch_approved / _rejected           -> platform_activity, to the org's owners and security admins

-- Notification vocabulary --------------------------------------------------------------
alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category = any (array['report_activity', 'bounty_activity', 'platform_activity', 'billing_activity', 'program_activity']));

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable',
  'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted', 'report_message_posted', 'program_suspended',
  'program_reinstated', 'organization_suspended', 'organization_reinstated', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded',
  'payment_failed', 'payment_cancelled', 'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided',
  'report_mediation_resolved', 'report_reopened', 'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined',
  'report_disclosure_unpublished', 'deposit_reported', 'deposit_confirmed', 'deposit_rejected', 'balance_low', 'invoice_issued',
  'program_launch_approved', 'program_launch_rejected', 'program_paused', 'program_resumed', 'program_closed', 'program_scope_changed']));

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
);

alter table public.notifications drop constraint notifications_subject_shape_check;
alter table public.notifications add constraint notifications_subject_shape_check check (
  (category not in ('platform_activity', 'billing_activity', 'program_activity') and report_id is not null and program_id is not null)
  or (category = 'platform_activity' and report_id is null
      and (notification_type = any (array['program_suspended', 'program_reinstated', 'program_launch_approved', 'program_launch_rejected'])) = (program_id is not null))
  or (category = 'billing_activity' and report_id is null and program_id is null)
  or (category = 'program_activity' and report_id is null and program_id is not null)
);

-- audit_logs -> outbox -----------------------------------------------------------------
create or replace function private.enqueue_program_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_program uuid;
  summary text;
begin
  if new.action like 'scope.%' then
    -- Draft and in-review scope edits concern nobody outside the organization yet.
    if coalesce(new.metadata ->> 'program_status', '') not in ('active', 'paused') then return new; end if;
    target_program := (new.metadata ->> 'program_id')::uuid;
    summary := case new.action
      when 'scope.asset_added' then 'Added to scope: '
      when 'scope.asset_removed' then 'Removed from scope: '
      else 'Scope entry changed: ' end || coalesce(new.metadata ->> 'target', 'an asset');
  else
    target_program := new.entity_id;
    summary := new.metadata ->> 'reason';
  end if;
  if target_program is null then return new; end if;

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload, occurred_at)
  values (new.action, 1, 'program', target_program, new.organization_id,
    jsonb_build_object('audit_log_id', new.id, 'program_id', target_program, 'organization_id', new.organization_id, 'reason', summary, 'actor_id', new.actor_id),
    new.created_at);
  return new;
end;
$$;

create trigger audit_logs_enqueue_program_event
  after insert on public.audit_logs
  for each row
  when (new.action in ('program.paused', 'program.resumed', 'program.closed', 'scope.asset_added', 'scope.asset_updated', 'scope.asset_removed',
                       'platform.program_launch_approved', 'platform.program_launch_rejected'))
  execute function private.enqueue_program_event();

-- outbox -> notifications --------------------------------------------------------------
create or replace function public.route_program_notifications(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  v_program uuid;
  allowed_actions text[];
begin
  allowed_actions := case p_notification_type
    when 'program_paused' then array['program.paused']
    when 'program_resumed' then array['program.resumed']
    when 'program_closed' then array['program.closed']
    when 'program_scope_changed' then array['scope.asset_added', 'scope.asset_updated', 'scope.asset_removed']
    when 'program_launch_approved' then array['platform.program_launch_approved']
    when 'program_launch_rejected' then array['platform.program_launch_rejected']
  end;
  if allowed_actions is null then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a program notification type', p_notification_type using errcode = '22023';
  end if;

  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.audit_logs al where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = any (allowed_actions)) then
    raise exception 'PROVENANCE_MISMATCH: no matching program record in audit_logs' using errcode = '23514';
  end if;
  v_program := (ev.payload ->> 'program_id')::uuid;

  if p_notification_type in ('program_launch_approved', 'program_launch_rejected') then
    insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
    select m.user_id, ev.organization_id, v_program, null, 'platform_activity', p_notification_type, ev.id, ev.occurred_at
    from public.organization_members m
    where m.organization_id = ev.organization_id and m.status = 'active' and m.role in ('owner', 'security_admin')
    on conflict (source_event_id, recipient_id) do nothing;
  else
    insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
    select pr.user_id, ev.organization_id, v_program, null, 'program_activity', p_notification_type, ev.id, ev.occurred_at
    from public.program_researchers pr
    join public.users u on u.id = pr.user_id and u.deactivated_at is null
    where pr.program_id = v_program and pr.status = 'active'
      and (p_notification_type <> 'program_scope_changed' or not exists (
        select 1 from public.notifications n
        where n.recipient_id = pr.user_id and n.program_id = v_program
          and n.notification_type = 'program_scope_changed' and n.created_at > now() - interval '1 hour'))
    on conflict (source_event_id, recipient_id) do nothing;
  end if;
  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;
revoke all on function public.route_program_notifications(uuid, text) from public, authenticated, anon;
grant execute on function public.route_program_notifications(uuid, text) to service_role;

-- Email authorization for program_activity: the recipient must still be an active researcher
-- on the program when the email is sent.
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
