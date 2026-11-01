-- Notification Routing + Preferences + Delivery Foundation.
--
-- Chain built: domain event -> outbox (reused, unchanged) -> notification routing (this
-- migration re-derives recipients and re-verifies authorization from authoritative
-- tables, never trusting the event payload for anything beyond "which report, which
-- fact") -> recipient resolution -> preference check -> a durable `notifications` row
-- (the in-app record) -> at most one `notification_deliveries` row per external channel
-- (currently only 'email') -> delivery attempt via a provider-neutral adapter
-- (lib/email-provider.ts) -> idempotent result.
--
-- Key design decisions, documented in full in
-- docs/decisions/0017-notification-routing-and-delivery-foundation.md:
--
-- 1. No second queue/worker: this migration adds zero new outbox-style scheduling
--    machinery. Recipient resolution + notification creation + email delivery all run
--    synchronously inside the SAME outbox event handler invocation; retries are driven
--    entirely by the EXISTING outbox_events retry/backoff loop (workers/outbox/worker.ts,
--    itself extended in this slice -- see below -- to support more than one registered
--    consumer per event_type:schema_version, which this slice's own requirements make
--    unavoidable: report.resolved/duplicate/informative/not_applicable/rejected and
--    bounty.finalized already have a reputation consumer (0016) registered against their
--    exact event_type:schema_version key, and this slice needs a SECOND, independent
--    consumer -- notifications -- on the identical keys).
-- 2. Recipient identity is a historical decision once a notification row exists (never
--    re-resolved on read), but recipient RESOLUTION itself reflects current
--    authorization at processing time -- a removed program manager is never notified in
--    the first place if their removal is visible by the time this event is processed.
--    Separately, and more conservatively, actual EMAIL CONTENT is re-verified for
--    authorization again immediately before rendering (private.can_currently_read_report)
--    -- if a recipient's access was revoked between notification-creation and email-send,
--    the email is never sent and the delivery is marked permanently failed, rather than
--    leaking report content to someone no longer authorized to see it. Both checks reuse
--    the report table's own existing read-authorization predicate (0008) verbatim --
--    never a second, divergent recipient-authorization rule.
-- 3. FACT, never CONTENT CACHE: `notifications` stores only identifiers and the fact
--    that something happened (category, notification_type, provenance, occurred_at) --
--    never a denormalized report title/description. The in-app UI re-reads the current,
--    RLS-scoped report row to render a title, which means a recipient who later loses
--    access to a report also naturally loses the ability to see anything about it beyond
--    "you were notified," with no special-case code required. The email renderer (which
--    runs server-side with the service-role client, not the recipient's own session) is
--    the one place that DOES need report content, so it fetches the minimum -- title,
--    program name, organization name -- through prepare_notification_email, which
--    performs the authorization re-check in (2) immediately beforehand.
-- 4. Two notification categories, not four: `report_activity` (optional; report.created
--    to the organization side, and every terminal report-outcome event to the report's
--    own researcher) and `bounty_activity` (mandatory; bounty.finalized to the
--    researcher -- a financial-outcome notice, treated like a payment receipt rather
--    than a promotional message, matching real-world transactional-email practice where
--    strictly transactional/administrative notices are exempt from an unsubscribe
--    requirement). `triage_activity`/`researcher_activity` were considered and rejected
--    for this slice: no shipped event currently backs either (researcher access changes
--    -- invitations, suspensions -- are not yet instrumented with outbox events), and
--    inventing a category with no real event behind it would be exactly the "50 toggles"
--    anti-pattern the task warns against.
-- 5. Idempotency at three of the four documented boundaries (the fourth --
--    outbox-event-processing idempotency -- is unchanged, inherited entirely from 0015):
--      a. Notification creation: `unique (source_event_id, recipient_id)` on
--         `notifications` -- the same event, redelivered, can never create a second
--         notification row for the same recipient.
--      b. Delivery-attempt idempotency: `unique (notification_id, channel)` on
--         `notification_deliveries` -- at most one delivery row per notification per
--         channel, checked for a terminal state (delivered/permanent_failure) before any
--         send is attempted again.
--      c. Provider-operation idempotency: every email send is given a
--         Sentinel-generated idempotency key (the delivery row's own id), which a real
--         future provider adapter would pass through to the provider's own
--         idempotency-key mechanism -- mirrors lib/payment-provider.ts's identical
--         reasoning for payment_attempts.id.
-- 6. Never a second payment/reputation ledger: bounty_finalized notifications never
--    carry an amount or currency -- notifications reference the bounty *outcome*, never
--    its financial detail.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null,
  program_id uuid not null,
  report_id uuid not null,
  category text not null check (category in ('report_activity', 'bounty_activity')),
  notification_type text not null check (notification_type in (
    'report_created', 'report_resolved', 'report_duplicate', 'report_informative',
    'report_not_applicable', 'report_rejected', 'bounty_finalized'
  )),
  source_event_id uuid not null references public.outbox_events(id) on delete restrict,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_source_event_recipient_key unique (source_event_id, recipient_id),
  constraint notifications_category_matches_type_check check (
    (category = 'report_activity' and notification_type in ('report_created', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected'))
    or (category = 'bounty_activity' and notification_type = 'bounty_finalized')
  ),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade
);

-- The recipient's own notification list, newest first -- the one query pattern this
-- slice actually has. No category/organization_id index: nothing in this slice filters
-- by either alone, and this codebase's own precedent (0016) is to add an index only when
-- a real query pattern justifies it, not speculatively.
create index notifications_recipient_id_created_at_idx on public.notifications(recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications read by their own recipient" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

grant select on public.notifications to authenticated;
grant select, insert on public.notifications to service_role;

-- ---------------------------------------------------------------------------
-- notification_deliveries: one row per (notification, channel) -- currently only
-- 'email' is real. In-app "delivery" is definitionally synchronous and cannot fail (it
-- is just the notifications row existing plus RLS-scoped visibility), so it does not get
-- its own delivery row -- inventing one would be a state with no possible transition,
-- exactly what the task's own "do not create states without a reason" warns against.
--
-- No legitimate human reader exists for this table in this slice (delivery mechanics are
-- operational, not a product surface a recipient sees) -- RLS is enabled with zero
-- permissive policies and zero grants to authenticated/anon, mirroring outbox_events'
-- own reasoning from 0015 exactly, for the identical reason.
-- ---------------------------------------------------------------------------

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('email')),
  state text not null default 'pending' check (state in ('pending', 'processing', 'delivered', 'retryable_failure', 'permanent_failure')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  provider_reference text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_notification_channel_key unique (notification_id, channel)
);

alter table public.notification_deliveries enable row level security;
grant select, insert on public.notification_deliveries to service_role;
grant update (state, attempts, provider_reference, last_error, updated_at) on public.notification_deliveries to service_role;

-- ---------------------------------------------------------------------------
-- notification_preferences: a sparse override table, not one row per user per category.
-- Absence of a row means "use the category default" (report_activity defaults to
-- enabled; bounty_activity has NO override path at all -- see the shape/category check
-- below and set_notification_preference's own rejection of any other category). This
-- avoids copying a preference object into every user row at signup, matching the task's
-- own "avoid copying a huge preference object into every user row" instruction.
-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('report_activity')),
  email_enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.notification_preferences enable row level security;

create policy "notification preferences read by their own user" on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- private.resolve_report_organization_recipients: the organization-side audience for
-- report.created, defined as EXACTLY the set of users the report's own RLS read policy
-- (0008) already authorizes -- program managers of that program, plus organization
-- owners/security admins of that organization. Never a broader "everyone in the
-- organization" set, and never a new, divergent authorization rule.
-- ---------------------------------------------------------------------------

create or replace function private.resolve_report_organization_recipients(target_report_id uuid)
returns setof uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = target_report_id;
  if r.id is null then
    return;
  end if;

  return query
    select pm.user_id from public.program_members pm where pm.program_id = r.program_id
    union
    select om.user_id from public.organization_members om
      where om.organization_id = r.organization_id and om.status = 'active' and om.role in ('owner', 'security_admin');
end;
$$;

revoke all on function private.resolve_report_organization_recipients(uuid) from public;
grant execute on function private.resolve_report_organization_recipients(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- private.can_currently_read_report: the identical predicate as the reports table's own
-- read RLS policy (0008), parameterized by an explicit candidate user id rather than
-- auth.uid() -- the same "candidate_user_id" shape private.is_manager_or_admin_of_my_
-- program (0010) already established for exactly this reason (checking a DIFFERENT
-- user's access, not the caller's own). Granted to service_role only: exposing this to
-- authenticated would turn it into an arbitrary-user access oracle, the exact danger the
-- private schema convention exists to prevent.
-- ---------------------------------------------------------------------------

create or replace function private.can_currently_read_report(target_report_id uuid, candidate_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = target_report_id;
  if r.id is null then
    return false;
  end if;

  return r.researcher_id = candidate_user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = r.organization_id and om.user_id = candidate_user_id and om.status = 'active' and om.role in ('owner', 'security_admin')
    )
    or exists (
      select 1 from public.program_members pm where pm.program_id = r.program_id and pm.user_id = candidate_user_id
    );
end;
$$;

revoke all on function private.can_currently_read_report(uuid, uuid) from public;
grant execute on function private.can_currently_read_report(uuid, uuid) to service_role;

-- The `private` schema previously only needed USAGE granted to `authenticated` (every
-- prior private helper is called from an RLS policy body, which runs as the policy's
-- declared role, but the SECURITY DEFINER function itself executes as its owner and so
-- never needed the CALLING role to hold schema usage). route_and_create_notifications
-- and prepare_notification_email are the first PLAIN (non-SECURITY-DEFINER) functions in
-- this schema to call directly into `private.*`, so the calling role (service_role, the
-- only role ever allowed to invoke them) needs USAGE on the schema itself to even
-- reference `private.foo(...)` in a query.
grant usage on schema private to service_role;

-- ---------------------------------------------------------------------------
-- route_and_create_notifications: the sole insertion path for `notifications`. Re-derives
-- the report row and re-verifies the claimed notification_type against the report's
-- actual current state (the identical PROVENANCE_MISMATCH pattern 0016 established),
-- resolves the eligible recipient set, checks each recipient's effective preference, and
-- inserts idempotently. Returns every notification row for this source event (both
-- newly-inserted and pre-existing), so a caller processing a redelivered event can
-- resume delivery attempts for rows it already created on an earlier, incomplete pass.
-- Plain (not SECURITY DEFINER) + explicit table grants below, service_role-only --
-- mirrors record_reputation_fact's identical reasoning: its only caller already bypasses
-- RLS via the service_role role attribute, so the real boundary is the table/function
-- grant, not an elevated-privilege function body.
-- ---------------------------------------------------------------------------

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
  if p_notification_type not in ('report_created', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized') then
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

-- ---------------------------------------------------------------------------
-- ensure_email_delivery: idempotent insert-or-return for a notification's email delivery
-- row. `on conflict (notification_id, channel) do nothing` is the actual guarantee, not
-- "we checked first."
-- ---------------------------------------------------------------------------

create or replace function public.ensure_email_delivery(p_notification_id uuid)
returns public.notification_deliveries
language plpgsql set search_path = ''
as $$
declare
  result public.notification_deliveries;
begin
  insert into public.notification_deliveries (notification_id, channel, state)
  values (p_notification_id, 'email', 'pending')
  on conflict (notification_id, channel) do nothing;

  select * into result from public.notification_deliveries where notification_id = p_notification_id and channel = 'email';
  return result;
end;
$$;

revoke all on function public.ensure_email_delivery(uuid) from public, authenticated, anon;
grant execute on function public.ensure_email_delivery(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- prepare_notification_email: the ONE place email content is assembled. Re-verifies the
-- recipient's current authorization to read the underlying report immediately before
-- returning any content (see design decision 2 above) -- if authorization has been lost
-- since the notification was created, this marks the delivery permanently failed and
-- returns deliverable=false rather than ever returning report content. Also transitions
-- the delivery to 'processing' as a side effect of a successful call, so a caller never
-- has to make a second round trip just to claim it.
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

  authorized := private.can_currently_read_report(notif.report_id, notif.recipient_id);
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
    join public.reports rp on rp.id = n.report_id
    join public.programs prog on prog.id = n.program_id
    join public.organizations org on org.id = n.organization_id
    where n.id = notif.id;
end;
$$;

revoke all on function public.prepare_notification_email(uuid) from public, authenticated, anon;
grant execute on function public.prepare_notification_email(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- record_email_delivery_result: the only path that transitions a delivery out of
-- 'pending'/'processing'/'retryable_failure'. Success -> 'delivered' (terminal). Failure
-- -> 'permanent_failure' (terminal, no more retries -- either the caller says this
-- specific failure can never succeed, or this delivery's own max_attempts is reached) or
-- 'retryable_failure' (stays available for the next time the OUTER outbox event retries
-- -- there is no separate scheduling/lease mechanism for this table; see the ADR).
-- ---------------------------------------------------------------------------

create or replace function public.record_email_delivery_result(
  p_delivery_id uuid,
  p_success boolean,
  p_permanent boolean,
  p_provider_reference text,
  p_error text
)
returns public.notification_deliveries
language plpgsql set search_path = ''
as $$
declare
  result public.notification_deliveries;
  current_attempts integer;
  current_max integer;
  new_state text;
begin
  select attempts, max_attempts into current_attempts, current_max from public.notification_deliveries where id = p_delivery_id;
  if current_attempts is null then
    raise exception 'DELIVERY_NOT_FOUND: no such delivery' using errcode = 'P0002';
  end if;

  if p_success then
    new_state := 'delivered';
  elsif p_permanent or (current_attempts + 1) >= current_max then
    new_state := 'permanent_failure';
  else
    new_state := 'retryable_failure';
  end if;

  update public.notification_deliveries
    set state = new_state,
        attempts = attempts + 1,
        provider_reference = coalesce(p_provider_reference, provider_reference),
        last_error = case when p_success then null else p_error end,
        updated_at = now()
    where id = p_delivery_id
    returning * into result;

  return result;
end;
$$;

revoke all on function public.record_email_delivery_result(uuid, boolean, boolean, text, text) from public, authenticated, anon;
grant execute on function public.record_email_delivery_result(uuid, boolean, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- mark_notification_read: the only mutation an ordinary authenticated user may perform
-- on `notifications`. Re-derives the recipient from auth.uid() -- never accepts a
-- recipient id from the client -- and is a no-op-safe, one-way transition (read_at is
-- never cleared back to null; there is no "mark unread" in this foundation slice).
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.notifications;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000';
  end if;

  update public.notifications
    set read_at = coalesce(read_at, now())
    where id = p_notification_id and recipient_id = actor
    returning * into result;

  if result.id is null then
    raise exception 'NOTIFICATION_NOT_FOUND: no such notification for this recipient' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_notification_preference: the only mutation path for notification_preferences.
-- Rejects any category outside the configurable allowlist ('report_activity') by name --
-- this is the actual enforcement that a mandatory category (bounty_activity) can never
-- be disabled, not a UI convention. Audit-logged: a deliberate, self-service change to
-- how a user receives security/business-relevant communication is worth a durable trail;
-- routine delivery retries (recorded in notification_deliveries, never audit_logs) are
-- not -- see the ADR's "Audit boundary" section for the full reasoning.
-- ---------------------------------------------------------------------------

create or replace function public.set_notification_preference(p_category text, p_email_enabled boolean)
returns public.notification_preferences
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.notification_preferences;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000';
  end if;

  if p_category <> 'report_activity' then
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
$$;

revoke all on function public.set_notification_preference(text, boolean) from public;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_notification_preferences: the effective preference for every known category
-- (both configurable and mandatory), computed server-side so the default-vs-override
-- merge logic exists in exactly one place, never duplicated in TypeScript. Self-only, no
-- parameter, structurally incapable of returning another user's preferences.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_notification_preferences()
returns table (category text, email_enabled boolean, is_mandatory boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000';
  end if;

  return query
    select 'report_activity'::text, coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = actor and np.category = 'report_activity'), true), false
    union all
    select 'bounty_activity'::text, true, true;
end;
$$;

revoke all on function public.get_my_notification_preferences() from public;
grant execute on function public.get_my_notification_preferences() to authenticated;
