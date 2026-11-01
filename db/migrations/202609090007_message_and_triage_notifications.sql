-- Turn 8: closes the notification gap the Turn 5 outbox trace found -- report.message_posted
-- and the start_triage/accept_report state transitions never reached the outbox in any
-- configuration (audit_logs only). All three now emit a real outbox event and route through
-- the existing notification pipeline (route_and_create_notifications ->
-- ensure_email_delivery -> prepare_notification_email -> provider .send()), reusing every
-- piece of that pipeline unchanged -- no new delivery mechanism, no new email template
-- system, just three more real facts feeding the one that already exists.
--
-- Three new notification_type values: report_triage_started, report_accepted (both single-
-- recipient = the report's own researcher, identical shape to report_resolved etc. already
-- handled below), and report_message_posted (actor-aware: whoever did NOT post the message
-- is the recipient -- the researcher posting notifies the org side via
-- resolve_report_organization_recipients, the org posting notifies the researcher, and an
-- 'internal' visibility message from the org notifies nobody, since the researcher can't
-- even read it under report_messages' own RLS policy). This is the concrete
-- "actor-scoped, sender never notified of their own action" rule from the turn spec.

-- ---------------------------------------------------------------------------------------
-- 1. Widen the check constraints and route_and_create_notifications for the 3 new types.
-- ---------------------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate',
    'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized',
    'report_triage_started', 'report_accepted', 'report_message_posted'
  ]));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check
  check (
    (category = 'report_activity' and notification_type = any (array[
      'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate',
      'report_informative', 'report_not_applicable', 'report_rejected',
      'report_triage_started', 'report_accepted', 'report_message_posted'
    ]))
    or (category = 'bounty_activity' and notification_type = 'bounty_finalized')
  );

create or replace function public.route_and_create_notifications(
  p_source_event_id uuid, p_notification_type text, p_report_id uuid, p_occurred_at timestamptz,
  -- Only meaningful for report_message_posted -- the user who posted the message, so this
  -- function can route to "everyone else," not the poster. Null for every other type
  -- (ignored there): those all route to a fixed recipient set that doesn't depend on who
  -- triggered the underlying transition.
  p_actor_id uuid default null
)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  report public.reports;
  v_category text;
  expected_status public.report_status;
  recipient uuid;
  effective_enabled boolean;
begin
  if p_notification_type not in (
    'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate',
    'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized',
    'report_triage_started', 'report_accepted', 'report_message_posted'
  ) then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a recognized notification type', p_notification_type using errcode = '22023';
  end if;

  select * into report from public.reports where id = p_report_id;
  if report.id is null then
    raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002';
  end if;

  v_category := case when p_notification_type = 'bounty_finalized' then 'bounty_activity' else 'report_activity' end;

  -- report_message_posted deliberately has no status-provenance check (unlike every other
  -- non-report_created type below) -- a message can be posted from several different
  -- report statuses (triaging, needs_information, accepted...), so "the report's current
  -- status must match" has no single correct value to check against here. The message
  -- itself (audit_logs' own message_id) is the real provenance record.
  if p_notification_type = 'bounty_finalized' then
    if not exists (select 1 from public.report_bounty_decisions d where d.report_id = p_report_id and d.state = 'finalized') then
      raise exception 'PROVENANCE_MISMATCH: this report has no finalized bounty decision' using errcode = '23514';
    end if;
  elsif p_notification_type not in ('report_created', 'report_message_posted') then
    expected_status := case p_notification_type
      when 'report_needs_information' then 'needs_information'::public.report_status
      when 'report_resolved' then 'resolved'::public.report_status
      when 'report_duplicate' then 'duplicate'::public.report_status
      when 'report_informative' then 'informative'::public.report_status
      when 'report_not_applicable' then 'not_applicable'::public.report_status
      when 'report_rejected' then 'rejected'::public.report_status
      when 'report_triage_started' then 'triaging'::public.report_status
      when 'report_accepted' then 'accepted'::public.report_status
    end;
    if report.status <> expected_status then
      raise exception 'PROVENANCE_MISMATCH: report''s current status does not match the claimed notification type' using errcode = '23514';
    end if;
  end if;

  if p_notification_type = 'report_created' then
    for recipient in select * from private.resolve_report_organization_recipients(p_report_id) loop
      effective_enabled := coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true);
      if effective_enabled then
        insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
        values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, p_source_event_id, p_occurred_at)
        on conflict (source_event_id, recipient_id) do nothing;
      end if;
    end loop;
  elsif p_notification_type = 'report_message_posted' then
    if p_actor_id is null then
      raise exception 'INVALID_NOTIFICATION_TYPE: report_message_posted requires an actor id' using errcode = '22023';
    end if;
    if p_actor_id = report.researcher_id then
      -- The researcher posted -- notify the org side, never the poster.
      for recipient in select * from private.resolve_report_organization_recipients(p_report_id) loop
        effective_enabled := coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true);
        if effective_enabled then
          insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
          values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, p_source_event_id, p_occurred_at)
          on conflict (source_event_id, recipient_id) do nothing;
        end if;
      end loop;
    else
      -- The org posted -- notify the researcher, but ONLY if this specific message is one
      -- the researcher can actually see (researcher_visible). An 'internal' message from
      -- the org notifies nobody -- there is no recipient to route to, so this simply emits
      -- zero notification rows rather than notifying someone about a message they have no
      -- RLS access to read at all.
      if exists (
        select 1 from public.outbox_events oe
        where oe.id = p_source_event_id and (oe.payload ->> 'visibility') = 'researcher_visible'
      ) then
        recipient := report.researcher_id;
        effective_enabled := coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true);
        if effective_enabled then
          insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
          values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, p_source_event_id, p_occurred_at)
          on conflict (source_event_id, recipient_id) do nothing;
        end if;
      end if;
    end if;
  else
    recipient := report.researcher_id;
    effective_enabled := true;
    if v_category = 'report_activity' then
      effective_enabled := coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true);
    end if;
    if effective_enabled then
      insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
      values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, p_source_event_id, p_occurred_at)
      on conflict (source_event_id, recipient_id) do nothing;
    end if;
  end if;

  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;

revoke all on function public.route_and_create_notifications(uuid, text, uuid, timestamptz, uuid) from public;
grant execute on function public.route_and_create_notifications(uuid, text, uuid, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------------------
-- 2. start_triage / accept_report now emit a real outbox event -- identical shape to
--    request_information's own event (the exact template this migration follows).
-- ---------------------------------------------------------------------------------------

create or replace function public.start_triage(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'triaging') then
    raise exception 'INVALID_TRANSITION: this report cannot move to triaging from its current state' using errcode = '23514';
  end if;

  update public.reports set status = 'triaging', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.triage_started', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.triage_started', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$$;

create or replace function public.accept_report(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'accepted') then
    raise exception 'INVALID_TRANSITION: this report cannot be accepted from its current state' using errcode = '23514';
  end if;

  update public.reports set status = 'accepted', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.accepted', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.accepted', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 3. post_organization_message / post_researcher_message now emit a real outbox event.
--    The payload's own actor_id/visibility fields are what route_and_create_notifications
--    reads above to decide direction -- researcher_id is included for parity with every
--    other event's payload shape, even though this handler resolves the researcher via
--    the report row rather than the payload.
-- ---------------------------------------------------------------------------------------

create or replace function public.post_organization_message(target_report_id uuid, p_body text, p_visibility public.report_visibility)
returns public.report_messages
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  new_message public.report_messages;
begin
  report := private.authorize_report_for_communication(target_report_id);

  new_message := private.insert_report_message(report, 'organization', p_visibility, p_body);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.message_posted', 'report', target_report_id, jsonb_build_object('message_id', new_message.id, 'author_context', 'organization', 'visibility', p_visibility));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.message_posted', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id,
      'researcher_id', report.researcher_id, 'actor_id', actor, 'message_id', new_message.id, 'visibility', p_visibility));

  return new_message;
end;
$$;

create or replace function public.post_researcher_message(target_report_id uuid, p_body text)
returns public.report_messages
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  new_message public.report_messages;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can post to this report' using errcode = '42501';
  end if;
  if not private.is_researcher_authorized_for_program(report.program_id) then
    raise exception 'FORBIDDEN: your access to this program is not currently active' using errcode = '42501';
  end if;

  new_message := private.insert_report_message(report, 'researcher', 'researcher_visible', p_body);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.message_posted', 'report', target_report_id, jsonb_build_object('message_id', new_message.id, 'author_context', 'researcher', 'visibility', 'researcher_visible'));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.message_posted', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id,
      'researcher_id', report.researcher_id, 'actor_id', actor, 'message_id', new_message.id, 'visibility', 'researcher_visible'));

  return new_message;
end;
$$;
