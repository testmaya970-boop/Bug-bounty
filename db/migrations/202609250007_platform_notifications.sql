-- Notify an organization when the platform suspends or reinstates it, or one of its
-- programs. Until now a suspended org only found out by noticing its program page.
--
-- 1. notifications gains a third category, 'platform_activity', for notices about an
--    organization or program rather than a report: report_id (and, for org-level
--    notices, program_id) are null for these rows. Mandatory, like bounty_activity --
--    an account-affecting platform decision is not an opt-out marketing message.
-- 2. Events come from a trigger on audit_logs, not from edits to the four suspend/
--    reinstate RPCs: each already writes exactly one platform.* audit row inside its own
--    transaction, so enqueuing the outbox event from that row keeps the transactional-
--    outbox guarantee (event exists iff the change committed) without copying any RPC.
-- 3. route_platform_notifications (worker-only) routes to the org's active owners and
--    security admins, re-verifying provenance against audit_logs like the report router.
-- 4. prepare_notification_email re-checks a platform notice's recipient is still an
--    active owner/security_admin (the report path's can_currently_read_report does not
--    apply -- there is no report).

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.notifications alter column report_id drop not null;
alter table public.notifications alter column program_id drop not null;

-- The composite FK to reports is not checked when report_id is null (MATCH SIMPLE), so
-- program- and org-level rows get their own integrity instead.
alter table public.notifications drop constraint if exists notifications_program_id_organization_id_fkey;
alter table public.notifications add constraint notifications_program_id_organization_id_fkey
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_organization_id_fkey;
alter table public.notifications add constraint notifications_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
  'report_not_applicable', 'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted',
  'report_message_posted',
  'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated'
]));

alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category = any (array['report_activity', 'bounty_activity', 'platform_activity']));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array[
    'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
    'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted'
  ]))
  or (category = 'bounty_activity' and notification_type = 'bounty_finalized')
  or (category = 'platform_activity' and notification_type = any (array[
    'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated'
  ]))
);

-- Report/bounty notices always point at a report; platform notices never do, and a
-- program notice always names its program.
alter table public.notifications add constraint notifications_subject_shape_check check (
  (category <> 'platform_activity' and report_id is not null and program_id is not null)
  or (category = 'platform_activity' and report_id is null
      and (notification_type in ('program_suspended', 'program_reinstated')) = (program_id is not null))
);

-- ---------------------------------------------------------------------------
-- 2. audit_logs -> outbox
-- ---------------------------------------------------------------------------

create or replace function private.enqueue_platform_decision_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  is_program boolean := new.entity_type = 'program';
begin
  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload, occurred_at)
  values (
    -- 'platform.program_suspended' -> 'program.suspended', etc.
    replace(substr(new.action, length('platform.') + 1), '_', '.'),
    1,
    new.entity_type,
    new.entity_id,
    new.organization_id,
    jsonb_build_object(
      'audit_log_id', new.id,
      'organization_id', new.organization_id,
      'program_id', case when is_program then new.entity_id end,
      'reason', new.metadata ->> 'reason',
      'actor_id', new.actor_id
    ),
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists audit_logs_enqueue_platform_decision on public.audit_logs;
create trigger audit_logs_enqueue_platform_decision
  after insert on public.audit_logs
  for each row
  when (new.action in ('platform.program_suspended', 'platform.program_reinstated', 'platform.organization_suspended', 'platform.organization_reinstated'))
  execute function private.enqueue_platform_decision_event();

-- ---------------------------------------------------------------------------
-- 3. Routing
-- ---------------------------------------------------------------------------

create or replace function public.route_platform_notifications(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  v_program_id uuid;
  expected_action text;
begin
  if p_notification_type not in ('program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated') then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a platform notification type', p_notification_type using errcode = '22023';
  end if;

  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then
    raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002';
  end if;

  -- Provenance: the event's own audit row must exist and say exactly this.
  expected_action := 'platform.' || p_notification_type;
  if not exists (
    select 1 from public.audit_logs al
    where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = expected_action and al.entity_id = ev.aggregate_id
  ) then
    raise exception 'PROVENANCE_MISMATCH: no matching platform decision in audit_logs' using errcode = '23514';
  end if;

  v_program_id := case when p_notification_type like 'program_%' then ev.aggregate_id end;

  insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
  select m.user_id, ev.organization_id, v_program_id, null, 'platform_activity', p_notification_type, ev.id, ev.occurred_at
  from public.organization_members m
  where m.organization_id = ev.organization_id and m.status = 'active' and m.role in ('owner', 'security_admin')
  on conflict (source_event_id, recipient_id) do nothing;

  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;

revoke all on function public.route_platform_notifications(uuid, text) from public, authenticated, anon;
grant execute on function public.route_platform_notifications(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Email preparation: same signature and return shape, one new branch
-- ---------------------------------------------------------------------------

create or replace function public.prepare_notification_email(p_delivery_id uuid)
returns table (
  deliverable boolean,
  reason text,
  recipient_email text,
  recipient_display_name text,
  report_title text,
  program_name text,
  organization_name text,
  notification_type text,
  occurred_at timestamptz
)
language plpgsql set search_path = ''
as $$
declare
  delivery public.notification_deliveries;
  notif public.notifications;
  authorized boolean;
begin
  select * into delivery from public.notification_deliveries where id = p_delivery_id;
  if delivery.id is null then
    return query select false, 'DELIVERY_NOT_FOUND'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if delivery.state in ('delivered', 'permanent_failure') then
    return query select false, 'ALREADY_TERMINAL'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into notif from public.notifications where id = delivery.notification_id;

  if notif.category = 'platform_activity' then
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
$$;
