-- Professional triage, competitive-parity group 3.
--
-- 1. Per-report assignee. reports.assignee_id, set by assign_report (anyone who may triage
--    the report). Assignable people are exactly those who could triage it themselves: org
--    owners/security admins and the program's own team -- never the report's researcher or
--    a collaborator. Audited (report.assigned / report.unassigned) and notified. An assignee
--    who loses access (removed from the program team, role change, suspension) is unassigned
--    automatically, audited with no actor.
-- 2. list_assignable_staff: the eligible people for a program (or the whole organization),
--    for the assign control and for showing assignee names in queues.
-- 3. Retests and mediations are decided by the program's whole triage team (previously
--    managers only, though triagers could already read them), never by the report's own
--    researcher.
-- 4. Reopen, through the one defined path: a retest decided "still vulnerable" returns the
--    resolved report to accepted (report.reopened). There is no free-form reopen. The status
--    machine itself is unchanged -- resolved stays terminal for every other check -- and the
--    one exception is scoped to that transaction (app.reopening_report). A publicly
--    disclosed report must be unpublished first.
-- 5. Notifications for assignment, retest requested/decided, mediation resolved and reopen,
--    through the audit-log trigger + router from 202610060008.

-- ---------------------------------------------------------------------------
-- 1. Assignee
-- ---------------------------------------------------------------------------

alter table public.reports add column assignee_id uuid references public.users(id) on delete set null;
create index reports_assignee_submitted_idx on public.reports (assignee_id, submitted_at desc) where assignee_id is not null;

create or replace function private.can_be_assigned(target_report_id uuid, candidate uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.id = target_report_id
      and r.researcher_id <> candidate
      and not exists (select 1 from public.report_collaborators c where c.report_id = r.id and c.researcher_id = candidate)
      and (
        exists (select 1 from public.organization_members m
                where m.organization_id = r.organization_id and m.user_id = candidate and m.status = 'active' and m.role in ('owner', 'security_admin'))
        or exists (select 1 from public.program_members pm
                   join public.organization_members m on m.organization_id = r.organization_id and m.user_id = pm.user_id and m.status = 'active'
                   where pm.program_id = r.program_id and pm.user_id = candidate)
      )
  );
$$;

create or replace function public.assign_report(target_report_id uuid, p_assignee_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);
  if p_assignee_id is not null and not private.can_be_assigned(report.id, p_assignee_id) then
    raise exception 'INVALID_ASSIGNEE: that person cannot triage this report' using errcode = '22023';
  end if;
  if report.assignee_id is not distinct from p_assignee_id then
    return report;
  end if;

  update public.reports set assignee_id = p_assignee_id, updated_at = now() where id = report.id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, case when p_assignee_id is null then 'report.unassigned' else 'report.assigned' end, 'report', report.id,
    jsonb_build_object('assignee_id', p_assignee_id, 'previous_assignee_id', report.assignee_id));
  return updated;
end;
$$;

create or replace function public.list_assignable_staff(target_organization_id uuid, target_program_id uuid default null)
returns table (user_id uuid, display_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (
    private.has_org_role(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or (target_program_id is not null and private.is_program_triager(target_program_id))
    or (target_program_id is null and exists (
          select 1 from public.program_members pm join public.programs p on p.id = pm.program_id
          where p.organization_id = target_organization_id and pm.user_id = auth.uid()))
  ) then
    raise exception 'FORBIDDEN: only the organization''s triage staff can list assignees' using errcode = '42501';
  end if;

  return query
    select distinct u.id, u.display_name
    from public.organization_members m
    join public.users u on u.id = m.user_id
    where m.organization_id = target_organization_id and m.status = 'active'
      and (
        m.role in ('owner', 'security_admin')
        or exists (
          select 1 from public.program_members pm join public.programs p on p.id = pm.program_id
          where pm.user_id = m.user_id and p.organization_id = target_organization_id
            and (target_program_id is null or pm.program_id = target_program_id)
        )
      )
    order by u.display_name;
end;
$$;

-- An assignee who can no longer triage the report is unassigned (audited, no actor).
create or replace function private.release_ineligible_assignments(target_user_id uuid, target_organization_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  released record;
begin
  for released in
    update public.reports r set assignee_id = null, updated_at = now()
    where r.assignee_id = target_user_id and r.organization_id = target_organization_id and not private.can_be_assigned(r.id, target_user_id)
    returning r.id, r.organization_id
  loop
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (null, released.organization_id, 'report.unassigned', 'report', released.id,
      jsonb_build_object('assignee_id', null, 'previous_assignee_id', target_user_id, 'reason', 'access_lost'));
  end loop;
end;
$$;

create or replace function private.release_assignments_on_program_member_removed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.release_ineligible_assignments(old.user_id, (select p.organization_id from public.programs p where p.id = old.program_id));
  return old;
end;
$$;
create trigger program_members_release_assignments
  after delete on public.program_members
  for each row execute function private.release_assignments_on_program_member_removed();

create or replace function private.release_assignments_on_membership_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.release_ineligible_assignments(new.user_id, new.organization_id);
  return new;
end;
$$;
create trigger organization_members_release_assignments
  after update of status, role on public.organization_members
  for each row execute function private.release_assignments_on_membership_change();

-- ---------------------------------------------------------------------------
-- 3 + 4. Retests and mediations decided by the triage team; still vulnerable reopens
-- ---------------------------------------------------------------------------

create or replace function private.enforce_report_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  original public.reports;
begin
  if new.status is distinct from old.status and not private.is_valid_report_transition(old.status, new.status)
     -- The single reopen path: decide_report_retest(still_vulnerable), in this transaction only.
     and not (old.status = 'resolved' and new.status = 'accepted' and current_setting('app.reopening_report', true) = new.id::text) then
    raise exception 'INVALID_TRANSITION: a report cannot move from % to %', old.status, new.status using errcode = '23514';
  end if;

  if new.duplicate_of_report_id is not null and new.duplicate_of_report_id is distinct from old.duplicate_of_report_id then
    select * into original from public.reports where id = new.duplicate_of_report_id;
    if original.id is null or original.program_id <> new.program_id then
      raise exception 'INVALID_DUPLICATE: the original report must be in the same program' using errcode = '22023';
    end if;
    if original.submitted_at > new.submitted_at then
      raise exception 'INVALID_DUPLICATE: a report can only duplicate one submitted before it' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.decide_report_retest(target_retest_id uuid, p_outcome public.report_retest_status, p_decision_notes text default null)
returns public.report_retests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  retest public.report_retests;
  trimmed_notes text := nullif(trim(coalesce(p_decision_notes, '')), '');
  updated public.report_retests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into retest from public.report_retests where id = target_retest_id for update;
  if retest.id is null then raise exception 'RETEST_NOT_FOUND: retest request not found' using errcode = 'P0002'; end if;

  -- Same authority as every other triage action on the report (incl. self-dealing refusal).
  perform private.lock_and_authorize_report_for_triage(retest.report_id);

  if retest.status <> 'requested' then
    raise exception 'RETEST_ALREADY_DECIDED: this retest request already has an outcome' using errcode = '23514';
  end if;
  if p_outcome not in ('confirmed_fixed', 'still_vulnerable') then
    raise exception 'INVALID_RETEST_OUTCOME: outcome must be confirmed_fixed or still_vulnerable' using errcode = '22023';
  end if;
  if trimmed_notes is not null and char_length(trimmed_notes) > 2000 then
    raise exception 'INVALID_RETEST_OUTCOME: notes must be 2000 characters or fewer' using errcode = '22023';
  end if;
  if p_outcome = 'still_vulnerable' and exists (select 1 from public.report_disclosures d where d.report_id = retest.report_id and d.status = 'approved') then
    raise exception 'REPORT_PUBLICLY_DISCLOSED: unpublish this report''s disclosure before reopening it' using errcode = '23514';
  end if;

  update public.report_retests set status = p_outcome, decided_by = actor, decided_at = now(), decision_notes = trimmed_notes
    where id = target_retest_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, retest.organization_id, 'report.retest_decided', 'report', retest.report_id, jsonb_build_object('retest_id', retest.id, 'outcome', p_outcome));

  if p_outcome = 'still_vulnerable' then
    perform set_config('app.reopening_report', retest.report_id::text, true);
    update public.reports set status = 'accepted', updated_at = now() where id = retest.report_id;
    perform set_config('app.reopening_report', '', true);
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, retest.organization_id, 'report.reopened', 'report', retest.report_id, jsonb_build_object('retest_id', retest.id, 'from_status', 'resolved', 'to_status', 'accepted'));
  end if;

  return updated;
end;
$$;

create or replace function public.resolve_report_mediation(target_mediation_id uuid, p_outcome public.report_mediation_status, p_resolution_notes text)
returns public.report_mediations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  mediation public.report_mediations;
  trimmed_notes text := trim(coalesce(p_resolution_notes, ''));
  updated public.report_mediations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into mediation from public.report_mediations where id = target_mediation_id for update;
  if mediation.id is null then raise exception 'MEDIATION_NOT_FOUND: mediation request not found' using errcode = 'P0002'; end if;

  perform private.lock_and_authorize_report_for_triage(mediation.report_id);

  if mediation.status <> 'open' then
    raise exception 'MEDIATION_ALREADY_DECIDED: this mediation request already has an outcome' using errcode = '23514';
  end if;
  if p_outcome not in ('resolved', 'declined') then
    raise exception 'INVALID_MEDIATION_OUTCOME: outcome must be resolved or declined' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) = 0 then
    raise exception 'INVALID_MEDIATION_OUTCOME: explain the resolution' using errcode = '22023';
  end if;
  if char_length(trimmed_notes) > 3000 then
    raise exception 'INVALID_MEDIATION_OUTCOME: resolution notes must be 3000 characters or fewer' using errcode = '22023';
  end if;

  update public.report_mediations set status = p_outcome, resolved_by = actor, resolved_at = now(), resolution_notes = trimmed_notes
    where id = target_mediation_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, mediation.organization_id, 'report.mediation_resolved', 'report', mediation.report_id, jsonb_build_object('mediation_id', mediation.id, 'outcome', p_outcome));
  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Notifications
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
  'report_not_applicable', 'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted',
  'report_message_posted',
  'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated',
  'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled', 'report_mediation_opened',
  'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened'
]));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array[
    'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
    'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted',
    'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened'
  ]))
  or (category = 'bounty_activity' and notification_type = any (array[
    'bounty_finalized', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled'
  ]))
  or (category = 'platform_activity' and notification_type = any (array[
    'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated'
  ]))
);

-- The recipient is fixed when the event is enqueued, from the audit row itself.
create or replace function private.enqueue_payment_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  recipient uuid;
begin
  if new.action like 'payment.%' then
    select o.researcher_id into recipient from public.payment_obligations o where o.id = (new.metadata ->> 'obligation_id')::uuid;
  elsif new.action in ('bounty.adjusted', 'report.retest_decided', 'report.mediation_resolved', 'report.reopened') then
    select r.researcher_id into recipient from public.reports r where r.id = new.entity_id;
  elsif new.action = 'report.assigned' then
    -- Assigning yourself notifies nobody.
    recipient := nullif((new.metadata ->> 'assignee_id')::uuid, new.actor_id);
  end if;

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload, occurred_at)
  values (
    new.action, 1, 'report', new.entity_id, new.organization_id,
    jsonb_build_object('audit_log_id', new.id, 'report_id', new.entity_id, 'recipient_id', recipient),
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists audit_logs_enqueue_payment_event on public.audit_logs;
create trigger audit_logs_enqueue_payment_event
  after insert on public.audit_logs
  for each row
  when (new.action in ('payment.obligation_created', 'payment.succeeded', 'payment.failed', 'payment.cancelled', 'bounty.adjusted',
                       'report.mediation_opened', 'report.mediation_resolved', 'report.assigned', 'report.retest_requested',
                       'report.retest_decided', 'report.reopened'))
  execute function private.enqueue_payment_event();

-- Worker-only router for every audit-row-driven report notice (payments since 202610060008,
-- triage events since this migration). Provenance: the event's own audit row must exist.
create or replace function public.route_payment_notifications(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  report public.reports;
  expected_action text;
  v_category text;
  recipient uuid;
begin
  expected_action := case p_notification_type
    when 'payment_scheduled' then 'payment.obligation_created'
    when 'payment_succeeded' then 'payment.succeeded'
    when 'payment_failed' then 'payment.failed'
    when 'payment_cancelled' then 'payment.cancelled'
    when 'bounty_adjusted' then 'bounty.adjusted'
    when 'report_mediation_opened' then 'report.mediation_opened'
    when 'report_mediation_resolved' then 'report.mediation_resolved'
    when 'report_assigned' then 'report.assigned'
    when 'report_retest_requested' then 'report.retest_requested'
    when 'report_retest_decided' then 'report.retest_decided'
    when 'report_reopened' then 'report.reopened'
  end;
  if expected_action is null then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a routed report notification type', p_notification_type using errcode = '22023';
  end if;

  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.audit_logs al
    where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = expected_action and al.entity_id = ev.aggregate_id
  ) then
    raise exception 'PROVENANCE_MISMATCH: no matching audit record for this notification' using errcode = '23514';
  end if;

  select * into report from public.reports where id = ev.aggregate_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002'; end if;

  v_category := case when p_notification_type in ('bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled')
                     then 'bounty_activity' else 'report_activity' end;

  if p_notification_type in ('report_mediation_opened', 'report_retest_requested') then
    -- The researcher asked the organization for something: its triage team is told.
    for recipient in select * from private.resolve_report_organization_recipients(report.id) loop
      if coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true) then
        insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
        values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, ev.id, ev.occurred_at)
        on conflict (source_event_id, recipient_id) do nothing;
      end if;
    end loop;
  else
    recipient := (ev.payload ->> 'recipient_id')::uuid;
    -- Money owed is never opt-out (like bounty_finalized); report activity honours preferences.
    if recipient is not null and (v_category = 'bounty_activity'
        or coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true)) then
      insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
      values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, ev.id, ev.occurred_at)
      on conflict (source_event_id, recipient_id) do nothing;
    end if;
  end if;

  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.can_be_assigned(uuid, uuid) from public;
revoke all on function private.release_ineligible_assignments(uuid, uuid) from public;
revoke all on function private.release_assignments_on_program_member_removed() from public;
revoke all on function private.release_assignments_on_membership_change() from public;
revoke all on function public.assign_report(uuid, uuid) from public, anon;
revoke all on function public.list_assignable_staff(uuid, uuid) from public, anon;
grant execute on function public.assign_report(uuid, uuid) to authenticated;
grant execute on function public.list_assignable_staff(uuid, uuid) to authenticated;
