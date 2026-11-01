-- route_and_create_notifications' provenance check compared the notification type being
-- processed against the report's CURRENT live status. That is correct only when the
-- outbox worker processes events strictly in order and catches up before the report moves
-- again -- neither is guaranteed. A report triaged, accepted, and resolved within minutes
-- (a real, unremarkable org workflow, not an edge case) races the worker: by the time it
-- gets to the earlier 'report_triage_started'/'report_accepted' events, report.status has
-- already moved on to 'resolved', so the check raised PROVENANCE_MISMATCH and the handler
-- dead-lettered both events permanently (PermanentHandlerError, no retry) -- the researcher
-- never received the triage-started or accepted notification/email, only the final one.
-- Confirmed live: report bd8c561e-1610-479f-9633-a3d9c85c31dd moved triaging (08:18) ->
-- accepted (08:25) -> resolved (08:32) on 2026-09-23, and both intermediate events are
-- sitting in dead_letter with exactly this error.
--
-- Fixed by checking audit_logs instead of the report's current status: every one of these
-- transition RPCs (start_triage, accept_report, and every other status-changing RPC this
-- function already handles) writes an audit_logs row whose `action` is the exact same fact
-- as the notification type, just dot-separated instead of underscore-separated
-- ('report.triage_started' vs 'report_triage_started' -- already true for every existing
-- action string, confirmed by grepping every report-transition audit_logs insert in this
-- migration set). "Did this report ever reach this state" is a real, permanent historical
-- fact recorded at the exact moment the transition happened -- unlike report.status, it
-- cannot be raced by a later transition. report_created and report_message_posted are
-- unaffected (they never had this check in the first place -- see the migration this one
-- supersedes).

create or replace function public.route_and_create_notifications(
  p_source_event_id uuid, p_notification_type text, p_report_id uuid, p_occurred_at timestamptz,
  p_actor_id uuid default null
)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  report public.reports;
  v_category text;
  expected_action text;
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

  if p_notification_type = 'bounty_finalized' then
    if not exists (select 1 from public.report_bounty_decisions d where d.report_id = p_report_id and d.state = 'finalized') then
      raise exception 'PROVENANCE_MISMATCH: this report has no finalized bounty decision' using errcode = '23514';
    end if;
  elsif p_notification_type not in ('report_created', 'report_message_posted') then
    -- NOT a mechanical string transform (a naive '_' -> '.' swap was tried and confirmed
    -- live to be wrong: report_duplicate/report_informative/report_not_applicable's real
    -- audit_logs action strings are 'report.marked_duplicate'/'report.marked_informative'/
    -- 'report.marked_not_applicable' -- see mark_report_duplicate/informative/not_applicable
    -- in db/migrations/202608270002_report_triage_foundation.sql and
    -- 202608290003_reputation_ledger_foundation.sql -- an explicit mapping per type, exactly
    -- mirroring the original expected_status case expression this replaces, is the only
    -- safe approach here.
    expected_action := case p_notification_type
      when 'report_needs_information' then 'report.information_requested'
      when 'report_resolved' then 'report.resolved'
      when 'report_duplicate' then 'report.marked_duplicate'
      when 'report_informative' then 'report.marked_informative'
      when 'report_not_applicable' then 'report.marked_not_applicable'
      when 'report_rejected' then 'report.rejected'
      when 'report_triage_started' then 'report.triage_started'
      when 'report_accepted' then 'report.accepted'
    end;
    if not exists (
      select 1 from public.audit_logs al
      where al.entity_type = 'report' and al.entity_id = p_report_id and al.action = expected_action
    ) then
      raise exception 'PROVENANCE_MISMATCH: report never reached the state this notification claims' using errcode = '23514';
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
      for recipient in select * from private.resolve_report_organization_recipients(p_report_id) loop
        effective_enabled := coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true);
        if effective_enabled then
          insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
          values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, p_source_event_id, p_occurred_at)
          on conflict (source_event_id, recipient_id) do nothing;
        end if;
      end loop;
    else
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
