-- Platform Operations Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0027-platform-operations-foundation.md.
--
-- 1. platform_role (202608250001) is NOT reused for this. It has never been set to
--    anything but its default 'researcher' by any migration, RPC, or trigger (confirmed
--    by grep across the whole schema before writing this one), and its non-default
--    values collide in name with organization_member_role/program roles
--    ('organization_owner', 'program_manager', 'triager' all exist as BOTH platform_role
--    values and unrelated organization/program role values) -- a confusing foundation to
--    build real authority on. This migration introduces a new, unambiguous concept
--    instead: a real membership table, platform_admins, following the exact shape
--    organization_members/program_researchers already established (a row means
--    membership; absence means none -- never a mutable flag on the user row).
-- 2. Granting/revoking platform admin status is service_role-only, by design, with NO
--    RPC reachable from `authenticated` at all -- there is no self-escalation path for a
--    researcher or organization owner, ever, through any client-reachable code. This
--    mirrors workers/outbox/'s own trust boundary (service_role, never imported by
--    app/actions/services/components) rather than inventing a weaker one.
-- 3. Every read this migration exposes is SECURITY DEFINER, narrowly scoped to exactly
--    the failure metadata needed to identify and locate a problem -- organization name,
--    program name, report id, provider/failure code, timestamps. It never exposes report
--    titles/descriptions/evidence/messages, bounty or payment amounts, or recipient
--    identity. This is deliberately narrower than "platform admin can read everything"
--    -- see the task's own explicit non-authority list.
-- 4. Only one mutation exists in this slice: replay_dead_lettered_outbox_event. It is
--    safe specifically because it reuses the EXISTING claim/complete machinery
--    (202608290002) and the existing idempotent-consumer-receipt guarantee that
--    machinery already relies on -- resetting a dead-lettered event to 'pending' does not
--    require inventing any new safety mechanism. Notification-delivery permanent
--    failures and payment failures get NO mutation in this slice: read-tracing the
--    actual handler code (workers/outbox/handlers/notifications/notification-handler.ts)
--    confirms the underlying outbox event for a permanently-failed notification delivery
--    has already reached 'succeeded' by design (a permanent failure is not itself a
--    handler failure) -- there is no existing safe path to re-trigger just the email
--    send, so this slice offers observation only for it, per the task's own explicit
--    "when uncertain, do not mutate" instruction. Payment failures are read-only for the
--    identical reason plus an even stronger one: payment mutation is financial
--    infrastructure explicitly out of scope for this slice regardless.

-- ---------------------------------------------------------------------------
-- platform_admins: real membership, not a role column. RLS enabled with zero permissive
-- policies -- the same "absent, not narrow" precedent outbox_events/notification_deliveries
-- already established -- so even the fact of who is a platform admin is never directly
-- queryable by a client; only the private.is_platform_admin() helper below can check it,
-- for the exact caller, never enumerate others.
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted_by uuid references public.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from authenticated, anon;
grant select, insert, delete on public.platform_admins to service_role;

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;

revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;

-- A minimal, safe self-check a page can call to decide whether to render the platform
-- route at all -- returns a plain boolean, never anyone else's membership.
create or replace function public.am_i_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_platform_admin();
$$;

revoke all on function public.am_i_platform_admin() from public;
grant execute on function public.am_i_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Grant/revoke: service_role-only, deliberately with NO grant to authenticated/anon at
-- all -- not even a platform admin can grant another platform admin through this schema
-- in this slice (that would need a dual-control design this slice does not build). Both
-- write a real audit_logs row -- actor_id is null (a service-role/operational action, not
-- an in-app actor), matching audit_logs.actor_id's own nullable, on-delete-set-null shape.
-- ---------------------------------------------------------------------------

create or replace function public.grant_platform_admin(target_user_id uuid, p_reason text default null)
returns void
language plpgsql set search_path = ''
as $$
begin
  insert into public.platform_admins (user_id) values (target_user_id)
  on conflict (user_id) do nothing;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (null, null, 'platform_admin.granted', 'user', target_user_id, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.grant_platform_admin(uuid, text) from public, authenticated, anon;
grant execute on function public.grant_platform_admin(uuid, text) to service_role;

create or replace function public.revoke_platform_admin(target_user_id uuid, p_reason text default null)
returns void
language plpgsql set search_path = ''
as $$
begin
  delete from public.platform_admins where user_id = target_user_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (null, null, 'platform_admin.revoked', 'user', target_user_id, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.revoke_platform_admin(uuid, text) from public, authenticated, anon;
grant execute on function public.revoke_platform_admin(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Needs Recovery: three narrow, SECURITY DEFINER reads. Each independently re-checks
-- private.is_platform_admin() -- never assumed from a caller having merely reached the
-- function (these are the only public entry points, so the check must live here).
-- ---------------------------------------------------------------------------

create or replace function public.list_needs_recovery_outbox_events()
returns table (
  id uuid,
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  organization_id uuid,
  organization_name text,
  attempts integer,
  max_attempts integer,
  last_error text,
  occurred_at timestamptz,
  processed_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select e.id, e.event_type, e.aggregate_type, e.aggregate_id, e.organization_id, o.name,
    e.attempts, e.max_attempts, e.last_error, e.occurred_at, e.processed_at
  from public.outbox_events e
  join public.organizations o on o.id = e.organization_id
  where e.status = 'dead_letter'
  order by e.processed_at desc nulls last, e.occurred_at desc;
end;
$$;

revoke all on function public.list_needs_recovery_outbox_events() from public;
grant execute on function public.list_needs_recovery_outbox_events() to authenticated;

create or replace function public.list_needs_recovery_notification_deliveries()
returns table (
  id uuid,
  notification_id uuid,
  notification_type text,
  organization_id uuid,
  organization_name text,
  program_id uuid,
  program_name text,
  report_id uuid,
  provider_reference text,
  last_error text,
  attempts integer,
  max_attempts integer,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select d.id, d.notification_id, n.notification_type, n.organization_id, o.name, n.program_id, p.name, n.report_id,
    d.provider_reference, d.last_error, d.attempts, d.max_attempts, d.updated_at
  from public.notification_deliveries d
  join public.notifications n on n.id = d.notification_id
  join public.organizations o on o.id = n.organization_id
  join public.programs p on p.id = n.program_id
  where d.state = 'permanent_failure'
  order by d.updated_at desc;
end;
$$;

revoke all on function public.list_needs_recovery_notification_deliveries() from public;
grant execute on function public.list_needs_recovery_notification_deliveries() to authenticated;

create or replace function public.list_needs_recovery_payment_attempts()
returns table (
  id uuid,
  payment_obligation_id uuid,
  organization_id uuid,
  organization_name text,
  program_id uuid,
  program_name text,
  report_id uuid,
  provider text,
  failure_code text,
  failure_message text,
  attempt_number integer,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  -- Deliberately never selects amount_minor_units/currency/researcher_id -- financial
  -- figures and researcher identity are outside this slice's narrow metadata boundary.
  return query
  select a.id, a.payment_obligation_id, ob.organization_id, o.name, ob.program_id, p.name, ob.report_id,
    a.provider, a.failure_code, a.failure_message, a.attempt_number, a.started_at, a.completed_at
  from public.payment_attempts a
  join public.payment_obligations ob on ob.id = a.payment_obligation_id
  join public.organizations o on o.id = ob.organization_id
  join public.programs p on p.id = ob.program_id
  where a.state = 'failed'
  order by a.completed_at desc nulls last, a.started_at desc;
end;
$$;

revoke all on function public.list_needs_recovery_payment_attempts() from public;
grant execute on function public.list_needs_recovery_payment_attempts() to authenticated;

-- ---------------------------------------------------------------------------
-- The one recovery action this slice offers: resetting a dead-lettered outbox event back
-- to 'pending' so the existing, unmodified claim/complete loop picks it up naturally --
-- no new processing path, no bypass of outbox_event_receipts' idempotency guarantee.
-- `for update` serializes two concurrent replay attempts on the same event: the second
-- one to acquire the lock sees the row already moved to 'pending' (not 'dead_letter') and
-- is cleanly rejected, never double-replaying the same event.
-- ---------------------------------------------------------------------------

create or replace function public.replay_dead_lettered_outbox_event(p_event_id uuid, p_reason text default null)
returns public.outbox_events
language plpgsql security definer set search_path = ''
as $$
declare
  event public.outbox_events;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  select * into event from public.outbox_events where id = p_event_id for update;
  if event.id is null then
    raise exception 'EVENT_NOT_FOUND: outbox event not found' using errcode = 'P0002';
  end if;
  if event.status <> 'dead_letter' then
    raise exception 'EVENT_NOT_DEAD_LETTER: only a dead-lettered event can be replayed' using errcode = '23514';
  end if;

  update public.outbox_events
  set status = 'pending', attempts = 0, available_at = now(), updated_at = now()
  where id = p_event_id
  returning * into event;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), event.organization_id, 'platform.outbox_event_replayed', 'outbox_event', event.id,
    jsonb_build_object('reason', p_reason, 'event_type', event.event_type));

  return event;
end;
$$;

revoke all on function public.replay_dead_lettered_outbox_event(uuid, text) from public;
grant execute on function public.replay_dead_lettered_outbox_event(uuid, text) to authenticated;
