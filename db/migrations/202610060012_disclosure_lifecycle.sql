-- Report disclosure lifecycle, competitive-parity group 4. Extends report_disclosures
-- (202609030001) instead of replacing it.
--
-- Before: requested -> approved published the report's title and resolution summary the
-- moment it was approved, for ANY terminal report (rejected and not-applicable included),
-- ignored the program's disclosure policy, could never be taken down, notified nobody, and
-- the anon-readable rows exposed requester/decider user ids.
--
-- Now:
--  * Only RESOLVED reports can be disclosed, and only if the policy the report was submitted
--    under (or, for older reports, the program's current one) allows it: 'none' refuses,
--    'coordinated' schedules publication <disclosure_days> after resolution, 'full' (or no
--    policy) publishes on approval.
--  * A draft public write-up (draft_title / draft_summary): proposed by the researcher with
--    the request, editable (redacted) by the program's triage staff, and by the researcher
--    while still requested. Approval snapshots the draft and the severity; the public never
--    sees the live report.
--  * published_at may be in the future: an approved disclosure goes public when that time
--    arrives (no job needed -- every public read filters on it).
--  * Unpublish (owners, security admins, the program manager) with a recorded reason; the
--    researcher may request again afterwards.
--  * Approve/decline/unpublish refuse the report's own researcher or collaborators.
--  * Public reads only through list_public_disclosures / get_public_disclosure, which expose
--    no user ids; the researcher is credited only if they opted into a public profile.
--  * Notifications: requested -> the triage team; approved / declined / unpublished -> the
--    researcher.

alter type public.report_disclosure_status add value if not exists 'unpublished';

alter table public.report_disclosures
  add column draft_title text check (draft_title is null or char_length(draft_title) between 1 and 200),
  add column draft_summary text check (draft_summary is null or char_length(draft_summary) <= 20000),
  add column published_severity public.report_severity,
  add column unpublished_at timestamptz,
  add column unpublished_by uuid references public.users(id) on delete set null,
  add column unpublish_reason text check (unpublish_reason is null or char_length(unpublish_reason) <= 2000);

-- Existing approvals keep their published snapshot; seed the draft from it.
update public.report_disclosures d set
  draft_title = coalesce(d.published_title, r.title),
  draft_summary = coalesce(d.published_summary, r.resolution_summary),
  published_severity = case when d.status = 'approved' then r.confirmed_severity end
from public.reports r where r.id = d.report_id;

-- ---------------------------------------------------------------------------
-- Visibility: no more direct anon reads (they exposed user ids). Staff and the
-- researcher read rows through the reports table's own RLS; the public uses the RPCs.
-- ---------------------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'report_disclosures' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.report_disclosures', pol.policyname);
  end loop;
end;
$$;
create policy "report disclosures read with the report" on public.report_disclosures
  for select to authenticated using (exists (select 1 from public.reports r where r.id = report_id));
revoke select on public.report_disclosures from anon;

-- ---------------------------------------------------------------------------
-- Policy-driven eligibility
-- ---------------------------------------------------------------------------

-- The disclosure policy that governs a report: the version it was submitted under, else the
-- program's current one; null mode means no policy (org approval alone decides).
create or replace function private.report_disclosure_terms(target_report_id uuid)
returns table (disclosure_mode public.program_disclosure_mode, disclosure_days integer, resolved_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select v.disclosure_mode, v.disclosure_days,
    (select min(al.created_at) from public.audit_logs al
      where al.entity_type = 'report' and al.entity_id = r.id and al.action = 'report.resolved')
  from public.reports r
  left join public.program_policy_versions v
    on v.id = coalesce(r.policy_version_id,
                       (select e.id from public.program_policy_versions e where e.program_id = r.program_id and e.superseded_at is null))
  where r.id = target_report_id;
$$;

create or replace function private.get_disclosable_report(target_report_id uuid)
returns public.reports
language plpgsql stable security definer set search_path = ''
as $$
declare
  report public.reports;
  terms record;
begin
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if report.status <> 'resolved' then
    raise exception 'NOT_DISCLOSABLE: only a resolved report can be publicly disclosed' using errcode = '55000';
  end if;
  select * into terms from private.report_disclosure_terms(report.id);
  if terms.disclosure_mode = 'none' then
    raise exception 'DISCLOSURE_NOT_PERMITTED: this program''s policy does not allow public disclosure' using errcode = '55000';
  end if;
  return report;
end;
$$;

create or replace function private.authorize_disclosure_decision(report public.reports)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(report.program_id)
  ) then
    raise exception 'FORBIDDEN: only an owner, security admin or the program manager can decide disclosure' using errcode = '42501';
  end if;
  perform private.forbid_self_dealing(report.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

drop function public.request_report_disclosure(uuid);
create function public.request_report_disclosure(target_report_id uuid, p_title text default null, p_summary text default null)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
  title text;
  summary text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  report := private.get_disclosable_report(target_report_id);
  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the researcher who submitted this report can request disclosure' using errcode = '42501';
  end if;
  title := coalesce(nullif(trim(coalesce(p_title, '')), ''), report.title);
  summary := nullif(trim(coalesce(p_summary, '')), '');
  if char_length(title) > 200 or char_length(coalesce(summary, '')) > 20000 then
    raise exception 'INVALID_DISCLOSURE: the title must be 200 characters or fewer and the write-up 20000 or fewer' using errcode = '22023';
  end if;

  select * into existing from public.report_disclosures where report_id = target_report_id for update;
  if existing.id is not null then
    if existing.status in ('requested', 'approved') then
      raise exception 'ALREADY_REQUESTED: this report already has an open or approved disclosure' using errcode = '55000';
    end if;
    update public.report_disclosures set status = 'requested', requested_at = now(), decided_by = null, decided_at = null, decline_reason = null,
      draft_title = title, draft_summary = coalesce(summary, report.resolution_summary),
      published_title = null, published_summary = null, published_severity = null, published_at = null,
      unpublished_at = null, unpublished_by = null, unpublish_reason = null
      where id = existing.id returning * into updated;
  else
    insert into public.report_disclosures (report_id, organization_id, requested_by, draft_title, draft_summary)
    values (target_report_id, report.organization_id, actor, title, coalesce(summary, report.resolution_summary))
    returning * into updated;
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.requested', 'report', target_report_id, '{}'::jsonb);
  return updated;
end;
$$;

-- Redaction: the triage team edits the public write-up; the researcher may while it's requested.
create or replace function public.update_report_disclosure_draft(target_report_id uuid, p_title text, p_summary text)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
  title text := trim(coalesce(p_title, ''));
  summary text := nullif(trim(coalesce(p_summary, '')), '');
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  select * into existing from public.report_disclosures where report_id = target_report_id for update;
  if existing.id is null or existing.status <> 'requested' then
    raise exception 'INVALID_STATE: only a pending disclosure request can be edited' using errcode = '55000';
  end if;
  if report.researcher_id <> actor then
    perform private.lock_and_authorize_report_for_triage(target_report_id);
  end if;
  if char_length(title) = 0 or char_length(title) > 200 or char_length(coalesce(summary, '')) > 20000 then
    raise exception 'INVALID_DISCLOSURE: a title of 1-200 characters and a write-up of 20000 or fewer' using errcode = '22023';
  end if;

  update public.report_disclosures set draft_title = title, draft_summary = summary where id = existing.id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.draft_updated', 'report', target_report_id,
    jsonb_build_object('by', case when report.researcher_id = actor then 'researcher' else 'organization' end));
  return updated;
end;
$$;

create or replace function public.approve_report_disclosure(target_report_id uuid)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
  terms record;
  goes_public timestamptz;
begin
  report := private.get_disclosable_report(target_report_id);
  perform private.authorize_disclosure_decision(report);

  select * into existing from public.report_disclosures where report_id = target_report_id for update;
  if existing.id is null or existing.status <> 'requested' then
    raise exception 'INVALID_STATE: this report has no pending disclosure request' using errcode = '55000';
  end if;

  select * into terms from private.report_disclosure_terms(report.id);
  goes_public := greatest(now(), case when terms.disclosure_mode = 'coordinated'
                                      then coalesce(terms.resolved_at, now()) + make_interval(days => terms.disclosure_days) end);

  update public.report_disclosures set status = 'approved', decided_by = actor, decided_at = now(),
    published_title = coalesce(existing.draft_title, report.title),
    published_summary = existing.draft_summary,
    published_severity = report.confirmed_severity,
    published_at = goes_public
    where id = existing.id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.approved', 'report', target_report_id,
    jsonb_build_object('published_at', goes_public, 'disclosure_mode', terms.disclosure_mode));
  return updated;
end;
$$;

create or replace function public.decline_report_disclosure(target_report_id uuid, p_reason text default null)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
  trimmed_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  perform private.authorize_disclosure_decision(report);
  if trimmed_reason is not null and char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_DECLINE_REASON: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  select * into existing from public.report_disclosures where report_id = target_report_id for update;
  if existing.id is null or existing.status <> 'requested' then
    raise exception 'INVALID_STATE: this report has no pending disclosure request' using errcode = '55000';
  end if;

  update public.report_disclosures set status = 'declined', decided_by = actor, decided_at = now(), decline_reason = trimmed_reason
    where id = existing.id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.declined', 'report', target_report_id, jsonb_build_object('reason', trimmed_reason));
  return updated;
end;
$$;

create or replace function public.unpublish_report_disclosure(target_report_id uuid, p_reason text)
returns public.report_disclosures
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  existing public.report_disclosures;
  updated public.report_disclosures;
  trimmed_reason text := trim(coalesce(p_reason, ''));
begin
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  perform private.authorize_disclosure_decision(report);
  if char_length(trimmed_reason) = 0 or char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_UNPUBLISH: explain why this disclosure is being taken down (2000 characters or fewer)' using errcode = '22023';
  end if;

  select * into existing from public.report_disclosures where report_id = target_report_id for update;
  if existing.id is null or existing.status <> 'approved' then
    raise exception 'INVALID_STATE: this report has no approved disclosure to unpublish' using errcode = '55000';
  end if;

  update public.report_disclosures set status = 'unpublished', unpublished_at = now(), unpublished_by = actor, unpublish_reason = trimmed_reason
    where id = existing.id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report_disclosure.unpublished', 'report', target_report_id,
    jsonb_build_object('reason', trimmed_reason, 'was_public', existing.published_at <= now()));
  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public reads: snapshots only, no user ids, researcher credited only on opt-in
-- ---------------------------------------------------------------------------

drop function public.list_public_disclosures();
create function public.list_public_disclosures(p_limit integer default 50, p_before timestamptz default null)
returns table (
  report_id uuid, published_title text, published_summary text, severity public.report_severity,
  program_id uuid, program_name text, organization_id uuid, organization_name text, researcher_username text, published_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select d.report_id, d.published_title, d.published_summary, d.published_severity,
    p.id, p.name, o.id, o.name,
    case when u.public_username is not null and u.deactivated_at is null and not u.is_suspended then u.public_username end,
    d.published_at
  from public.report_disclosures d
  join public.reports r on r.id = d.report_id
  join public.programs p on p.id = r.program_id
  join public.organizations o on o.id = r.organization_id
  join public.users u on u.id = r.researcher_id
  where d.status = 'approved' and d.published_at <= now() and o.status <> 'suspended'
    and (p_before is null or d.published_at < p_before)
  order by d.published_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.get_public_disclosure(target_report_id uuid)
returns table (
  report_id uuid, published_title text, published_summary text, severity public.report_severity,
  program_id uuid, program_name text, organization_id uuid, organization_name text, researcher_username text, published_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select d.report_id, d.published_title, d.published_summary, d.published_severity,
    p.id, p.name, o.id, o.name,
    case when u.public_username is not null and u.deactivated_at is null and not u.is_suspended then u.public_username end,
    d.published_at
  from public.report_disclosures d
  join public.reports r on r.id = d.report_id
  join public.programs p on p.id = r.program_id
  join public.organizations o on o.id = r.organization_id
  join public.users u on u.id = r.researcher_id
  where d.report_id = target_report_id and d.status = 'approved' and d.published_at <= now() and o.status <> 'suspended';
$$;

-- ---------------------------------------------------------------------------
-- Notifications (audit-row router, 202610060008/11)
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
  'report_not_applicable', 'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted',
  'report_message_posted',
  'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated',
  'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled', 'report_mediation_opened',
  'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened',
  'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined', 'report_disclosure_unpublished'
]));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array[
    'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
    'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted',
    'report_mediation_opened', 'report_assigned', 'report_retest_requested', 'report_retest_decided', 'report_mediation_resolved', 'report_reopened',
    'report_disclosure_requested', 'report_disclosure_approved', 'report_disclosure_declined', 'report_disclosure_unpublished'
  ]))
  or (category = 'bounty_activity' and notification_type = any (array[
    'bounty_finalized', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled'
  ]))
  or (category = 'platform_activity' and notification_type = any (array[
    'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated'
  ]))
);

create or replace function private.enqueue_payment_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  recipient uuid;
begin
  if new.action like 'payment.%' then
    select o.researcher_id into recipient from public.payment_obligations o where o.id = (new.metadata ->> 'obligation_id')::uuid;
  elsif new.action in ('bounty.adjusted', 'report.retest_decided', 'report.mediation_resolved', 'report.reopened',
                       'report_disclosure.approved', 'report_disclosure.declined', 'report_disclosure.unpublished') then
    select r.researcher_id into recipient from public.reports r where r.id = new.entity_id;
  elsif new.action = 'report.assigned' then
    recipient := nullif((new.metadata ->> 'assignee_id')::uuid, new.actor_id);
  end if;

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload, occurred_at)
  values (new.action, 1, 'report', new.entity_id, new.organization_id,
    jsonb_build_object('audit_log_id', new.id, 'report_id', new.entity_id, 'recipient_id', recipient), new.created_at);
  return new;
end;
$$;

drop trigger if exists audit_logs_enqueue_payment_event on public.audit_logs;
create trigger audit_logs_enqueue_payment_event
  after insert on public.audit_logs
  for each row
  when (new.action in ('payment.obligation_created', 'payment.succeeded', 'payment.failed', 'payment.cancelled', 'bounty.adjusted',
                       'report.mediation_opened', 'report.mediation_resolved', 'report.assigned', 'report.retest_requested',
                       'report.retest_decided', 'report.reopened',
                       'report_disclosure.requested', 'report_disclosure.approved', 'report_disclosure.declined', 'report_disclosure.unpublished'))
  execute function private.enqueue_payment_event();

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
    when 'report_disclosure_requested' then 'report_disclosure.requested'
    when 'report_disclosure_approved' then 'report_disclosure.approved'
    when 'report_disclosure_declined' then 'report_disclosure.declined'
    when 'report_disclosure_unpublished' then 'report_disclosure.unpublished'
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

  if p_notification_type in ('report_mediation_opened', 'report_retest_requested', 'report_disclosure_requested') then
    for recipient in select * from private.resolve_report_organization_recipients(report.id) loop
      if coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true) then
        insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
        values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, ev.id, ev.occurred_at)
        on conflict (source_event_id, recipient_id) do nothing;
      end if;
    end loop;
  else
    recipient := (ev.payload ->> 'recipient_id')::uuid;
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

revoke all on function private.report_disclosure_terms(uuid) from public;
revoke all on function private.get_disclosable_report(uuid) from public;
revoke all on function private.authorize_disclosure_decision(public.reports) from public;
revoke all on function public.request_report_disclosure(uuid, text, text) from public, anon;
revoke all on function public.update_report_disclosure_draft(uuid, text, text) from public, anon;
revoke all on function public.unpublish_report_disclosure(uuid, text) from public, anon;
grant execute on function public.request_report_disclosure(uuid, text, text) to authenticated;
grant execute on function public.update_report_disclosure_draft(uuid, text, text) to authenticated;
grant execute on function public.unpublish_report_disclosure(uuid, text) to authenticated;
revoke all on function public.list_public_disclosures(integer, timestamptz) from public;
revoke all on function public.get_public_disclosure(uuid) from public;
grant execute on function public.list_public_disclosures(integer, timestamptz) to anon, authenticated;
grant execute on function public.get_public_disclosure(uuid) to anon, authenticated;
