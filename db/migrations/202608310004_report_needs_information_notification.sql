-- ---------------------------------------------------------------------------
-- docs/decisions/0042-researcher-product-completion.md
--
-- Real, genuine gap found during researcher-journey verification, not a cosmetic
-- addition: request_information (202608270002) moves a report to needs_information --
-- the single moment a researcher most needs to know something happened -- but never wrote
-- an outbox event, so route_and_create_notifications (202608290004) never had a
-- 'report_needs_information' type to route in the first place. The report detail page's
-- own "Action required" banner (this slice) already tells a researcher who is already on
-- the page; this closes the other half -- a real, existing notification-center row that
-- gets them there, on the exact same delivery/preference/RLS machinery every other report
-- notification already uses. No second notification system, no new table.
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type in (
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
  'report_not_applicable', 'report_rejected', 'bounty_finalized'
));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type in ('report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected'))
  or (category = 'bounty_activity' and notification_type = 'bounty_finalized')
);

create or replace function public.route_and_create_notifications(
  p_source_event_id uuid,
  p_notification_type text,
  p_report_id uuid,
  p_occurred_at timestamptz
)
returns setof public.notifications
language plpgsql set search_path = ''
as $$
declare
  report public.reports;
  v_category text;
  expected_status public.report_status;
  recipient uuid;
  effective_enabled boolean;
begin
  if p_notification_type not in ('report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized') then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a recognized notification type', p_notification_type using errcode = '22023';
  end if;

  select * into report from public.reports where id = p_report_id;
  if report.id is null then
    raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002';
  end if;

  v_category := case when p_notification_type = 'bounty_finalized' then 'bounty_activity' else 'report_activity' end;

  if p_notification_type = 'bounty_finalized' then
    if not exists (select 1 from public.report_bounty_decisions d where d.report_id = p_report_id and d.state = 'finalized') then
      raise exception 'PROVENANCE_MISMATCH: this report has no finalized bounty decision' using errcode = '23514';
    end if;
  elsif p_notification_type <> 'report_created' then
    expected_status := case p_notification_type
      when 'report_needs_information' then 'needs_information'::public.report_status
      when 'report_resolved' then 'resolved'::public.report_status
      when 'report_duplicate' then 'duplicate'::public.report_status
      when 'report_informative' then 'informative'::public.report_status
      when 'report_not_applicable' then 'not_applicable'::public.report_status
      when 'report_rejected' then 'rejected'::public.report_status
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

revoke all on function public.route_and_create_notifications(uuid, text, uuid, timestamptz) from public, authenticated, anon;
grant execute on function public.route_and_create_notifications(uuid, text, uuid, timestamptz) to service_role;

-- request_information's CURRENT definition (redefined by 202608270003/docs/decisions/0010
-- to post the reason as a real report_messages row via private.insert_report_message,
-- once reports.information_request_reason itself was dropped) redefined only to add the
-- outbox event -- every other line is copied verbatim, unchanged.
create or replace function public.request_information(target_report_id uuid, p_reason text)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'needs_information') then
    raise exception 'INVALID_TRANSITION: this report cannot move to needs information from its current state' using errcode = '23514';
  end if;

  perform private.insert_report_message(report, 'organization', 'researcher_visible', p_reason);

  update public.reports set status = 'needs_information', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.information_requested', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('report.needs_information', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$$;

revoke all on function public.request_information(uuid, text) from public;
grant execute on function public.request_information(uuid, text) to authenticated;
