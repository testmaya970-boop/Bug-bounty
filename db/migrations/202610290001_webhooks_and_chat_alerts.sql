-- Outbound webhooks and Slack / Microsoft Teams alerts (docs/plans/organization-integrations.md,
-- modules 1 and 2), on one delivery engine:
--
--   outbox_events --(worker handler)--> private.enqueue_integration_deliveries(event)
--       --> integration_deliveries (one row per matching endpoint / chat connection)
--       --> worker delivery loop: claim, sign, send through lib/integrations/safe-fetch.ts,
--           complete with exponential backoff, auto-disable a target that keeps failing
--
-- Secrets: webhook signing secrets and Slack/Teams URLs (which are bearer credentials) are
-- encrypted with the existing private.encrypt_sensitive_field and never selectable by
-- `authenticated`. A signing secret is generated here and returned exactly once.
-- Payload privacy: a delivery carries ids, title, status, severity and program, never the
-- report description, steps or attachments.

-- 1. Targets --------------------------------------------------------------------------------------
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  description text check (char_length(description) <= 200),
  event_types text[] not null check (cardinality(event_types) between 1 and 30),
  program_id uuid references public.programs(id) on delete cascade,
  secret_encrypted bytea not null,
  previous_secret_encrypted bytea,
  previous_secret_valid_until timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  disabled_reason text check (char_length(disabled_reason) <= 300),
  failure_streak integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index webhook_endpoints_org_idx on public.webhook_endpoints(organization_id);

create table public.chat_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('slack', 'teams')),
  label text not null check (char_length(label) between 1 and 120),
  target_encrypted bytea not null,
  target_hint text not null check (char_length(target_hint) <= 120),
  alerts text[] not null check (cardinality(alerts) >= 1 and alerts <@ array['new_report', 'critical', 'status_change', 'sla_breach']),
  program_id uuid references public.programs(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  disabled_reason text check (char_length(disabled_reason) <= 300),
  failure_streak integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_connections_org_idx on public.chat_connections(organization_id);

-- 2. Deliveries ------------------------------------------------------------------------------------
create table public.integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_kind text not null check (target_kind in ('webhook', 'slack', 'teams')),
  target_id uuid not null,
  event_id uuid,
  message_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivering', 'succeeded', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_status_code integer,
  last_error text check (char_length(last_error) <= 500),
  response_excerpt text check (char_length(response_excerpt) <= 1000),
  duration_ms integer,
  delivered_at timestamptz,
  replay_of uuid references public.integration_deliveries(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index integration_deliveries_once_per_event on public.integration_deliveries(target_kind, target_id, event_id) where event_id is not null and replay_of is null;
create index integration_deliveries_due on public.integration_deliveries(next_attempt_at) where status in ('pending', 'delivering');
create index integration_deliveries_target on public.integration_deliveries(target_id, created_at desc);

-- 3. Reads: owner / security admin only; secrets never --------------------------------------------
alter table public.webhook_endpoints enable row level security;
alter table public.chat_connections enable row level security;
alter table public.integration_deliveries enable row level security;
create policy "webhook endpoints read by org admins" on public.webhook_endpoints for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
create policy "chat connections read by org admins" on public.chat_connections for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
create policy "deliveries read by org admins" on public.integration_deliveries for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
revoke all on public.webhook_endpoints, public.chat_connections, public.integration_deliveries from anon, authenticated;
grant select (id, organization_id, url, description, event_types, program_id, previous_secret_valid_until, status, disabled_reason, failure_streak, created_by, created_at, updated_at) on public.webhook_endpoints to authenticated;
grant select (id, organization_id, provider, label, target_hint, alerts, program_id, status, disabled_reason, failure_streak, created_by, created_at, updated_at) on public.chat_connections to authenticated;
grant select on public.integration_deliveries to authenticated;
grant select, insert, update, delete on public.webhook_endpoints, public.chat_connections, public.integration_deliveries to service_role;

-- 4. Event catalog and payloads --------------------------------------------------------------------
create or replace function private.webhook_event_catalog()
returns text[]
language sql immutable set search_path = ''
as $$
  select array['report.created', 'report.triage_started', 'report.needs_information', 'report.accepted', 'report.resolved',
               'report.duplicate', 'report.informative', 'report.not_applicable', 'report.rejected', 'report.message_posted',
               'report.sla_breached', 'bounty.finalized', 'bounty.bonus_approved', 'payment.succeeded', 'payment.failed'];
$$;

create or replace function private.assert_org_integration_admin(p_organization_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can manage integrations' using errcode = '42501';
  end if;
end;
$$;

/** The data an integration may see about an event: never report content beyond the title. */
create or replace function private.integration_event_payload(ev public.outbox_events)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  report_id uuid := coalesce((ev.payload ->> 'report_id')::uuid, case when ev.aggregate_type = 'report' then ev.aggregate_id end);
begin
  if report_id is null then return null; end if;
  select rp.id, rp.title, rp.status, coalesce(rp.confirmed_severity, rp.researcher_severity) as severity, rp.priority, rp.program_id, p.name as program_name, rp.organization_id, rp.submitted_at
    into r from public.reports rp join public.programs p on p.id = rp.program_id where rp.id = report_id;
  if r.id is null then return null; end if;
  return jsonb_build_object(
    'id', ev.id, 'type', ev.event_type, 'occurred_at', ev.occurred_at, 'organization_id', ev.organization_id,
    'data', jsonb_build_object(
      'report', jsonb_build_object('id', r.id, 'title', r.title, 'status', r.status, 'severity', r.severity, 'priority', r.priority,
        'program_id', r.program_id, 'program_name', r.program_name, 'submitted_at', r.submitted_at,
        'path', '/organizations/' || r.organization_id || '/programs/' || r.program_id || '/reports/' || r.id),
      'sla', ev.payload ->> 'sla',
      'bonus_id', ev.payload ->> 'bonus_id')
  );
end;
$$;

/** Which chat alert categories an event belongs to. */
create or replace function private.chat_alert_categories(p_event_type text, p_severity text)
returns text[]
language sql immutable set search_path = ''
as $$
  select array_remove(array[
    case when p_event_type = 'report.created' then 'new_report' end,
    case when p_event_type in ('report.triage_started', 'report.needs_information', 'report.accepted', 'report.resolved', 'report.duplicate', 'report.informative', 'report.not_applicable', 'report.rejected') then 'status_change' end,
    case when p_event_type = 'report.sla_breached' then 'sla_breach' end,
    case when p_severity = 'critical' and p_event_type in ('report.created', 'report.accepted') then 'critical' end
  ], null);
$$;

/** Worker (service role): one delivery per active, subscribed target. Idempotent per event. */
create or replace function private.enqueue_integration_deliveries(p_event_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  body jsonb;
  program uuid;
  cats text[];
  n integer := 0;
  added integer;
begin
  select * into ev from public.outbox_events where id = p_event_id;
  if ev.id is null then return 0; end if;
  body := private.integration_event_payload(ev);
  if body is null then return 0; end if;
  program := (body -> 'data' -> 'report' ->> 'program_id')::uuid;
  cats := private.chat_alert_categories(ev.event_type, body -> 'data' -> 'report' ->> 'severity');

  insert into public.integration_deliveries (organization_id, target_kind, target_id, event_id, message_id, event_type, payload)
  select ev.organization_id, 'webhook', w.id, ev.id, 'msg_' || ev.id, ev.event_type, body
  from public.webhook_endpoints w
  where w.organization_id = ev.organization_id and w.status = 'active' and ev.event_type = any (w.event_types) and (w.program_id is null or w.program_id = program)
  on conflict do nothing;
  get diagnostics added = row_count; n := n + added;

  if cardinality(cats) > 0 then
    insert into public.integration_deliveries (organization_id, target_kind, target_id, event_id, message_id, event_type, payload)
    select ev.organization_id, c.provider, c.id, ev.id, 'msg_' || ev.id, ev.event_type, body || jsonb_build_object('alerts', to_jsonb(cats & c.alerts))
    from public.chat_connections c
    where c.organization_id = ev.organization_id and c.status = 'active' and c.alerts && cats and (c.program_id is null or c.program_id = program)
    on conflict do nothing;
    get diagnostics added = row_count; n := n + added;
  end if;
  return n;
end;
$$;

-- text[] intersection used above.
create or replace function private.text_array_intersect(a text[], b text[])
returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array_agg(x), '{}') from unnest(a) x where x = any (b); $$;
create operator public.& (leftarg = text[], rightarg = text[], function = private.text_array_intersect);

-- 5. Delivery engine (worker, service role) --------------------------------------------------------
create or replace function private.claim_integration_deliveries(p_limit integer, p_lease_seconds integer)
returns setof public.integration_deliveries
language sql security definer set search_path = ''
as $$
  update public.integration_deliveries d
     set status = 'delivering', locked_until = now() + make_interval(secs => p_lease_seconds), attempts = d.attempts + 1
   where d.id in (
     select x.id from public.integration_deliveries x
      where (x.status = 'pending' and x.next_attempt_at <= now()) or (x.status = 'delivering' and x.locked_until < now())
      order by x.next_attempt_at
      limit p_limit
      for update skip locked)
  returning d.*;
$$;

/** Where and how to send one delivery: the URL and, for webhooks, every currently valid secret. */
create or replace function private.integration_delivery_target(p_delivery_id uuid)
returns table (target_kind text, url text, secrets text[], target_status text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.integration_deliveries;
begin
  select * into d from public.integration_deliveries where id = p_delivery_id;
  if d.target_kind = 'webhook' then
    return query select 'webhook', w.url,
      array_remove(array[private.decrypt_sensitive_field(w.secret_encrypted),
        case when w.previous_secret_valid_until > now() then private.decrypt_sensitive_field(w.previous_secret_encrypted) end], null),
      w.status
      from public.webhook_endpoints w where w.id = d.target_id;
  else
    return query select c.provider, private.decrypt_sensitive_field(c.target_encrypted), '{}'::text[], c.status
      from public.chat_connections c where c.id = d.target_id;
  end if;
end;
$$;

/** Backoff after attempt n: 1m, 5m, 30m, 2h, 6h, 12h, 24h. A target whose last five
 * deliveries all failed is disabled until an admin turns it back on. */
create or replace function private.complete_integration_delivery(p_delivery_id uuid, p_success boolean, p_permanent boolean, p_status_code integer, p_error text, p_excerpt text, p_duration_ms integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d public.integration_deliveries;
  backoff integer[] := array[60, 300, 1800, 7200, 21600, 43200, 86400];
  exhausted boolean;
  streak integer;
begin
  select * into d from public.integration_deliveries where id = p_delivery_id for update;
  if d.id is null or d.status <> 'delivering' then return; end if;
  exhausted := not p_success and (p_permanent or d.attempts >= d.max_attempts);
  update public.integration_deliveries set
    status = case when p_success then 'succeeded' when exhausted then 'failed' else 'pending' end,
    delivered_at = case when p_success then now() end,
    next_attempt_at = case when p_success or exhausted then next_attempt_at else now() + make_interval(secs => backoff[least(d.attempts, 7)]) end,
    locked_until = null, last_status_code = p_status_code, last_error = left(p_error, 500), response_excerpt = left(p_excerpt, 1000), duration_ms = p_duration_ms
  where id = d.id;

  if p_success then
    update public.webhook_endpoints set failure_streak = 0 where id = d.target_id and d.target_kind = 'webhook';
    update public.chat_connections set failure_streak = 0 where id = d.target_id and d.target_kind <> 'webhook';
  elsif exhausted then
    if d.target_kind = 'webhook' then
      update public.webhook_endpoints set failure_streak = failure_streak + 1,
        status = case when failure_streak + 1 >= 5 or p_status_code = 410 then 'disabled' else status end,
        disabled_reason = case when failure_streak + 1 >= 5 or p_status_code = 410 then left('Disabled after repeated failures: ' || coalesce(p_error, 'HTTP ' || p_status_code), 300) else disabled_reason end,
        updated_at = now()
      where id = d.target_id returning failure_streak into streak;
    else
      update public.chat_connections set failure_streak = failure_streak + 1,
        status = case when failure_streak + 1 >= 5 or p_permanent then 'disabled' else status end,
        disabled_reason = case when failure_streak + 1 >= 5 or p_permanent then left('Disabled: ' || coalesce(p_error, 'HTTP ' || p_status_code), 300) else disabled_reason end,
        updated_at = now()
      where id = d.target_id returning failure_streak into streak;
    end if;
  end if;
end;
$$;

-- 6. SLA breaches become events (scanned by the worker every few minutes) -------------------------
create table private.report_sla_breach_notices (
  report_id uuid not null references public.reports(id) on delete cascade,
  sla text not null check (sla in ('first_response', 'triage', 'resolution')),
  noticed_at timestamptz not null default now(),
  primary key (report_id, sla)
);

create or replace function private.scan_sla_breaches()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  rp record;
  s record;
  kind text;
  n integer := 0;
begin
  for rp in
    select r.id, r.organization_id, r.program_id from public.reports r
    where r.status in ('new', 'triaging', 'needs_information', 'accepted') and r.submitted_at > now() - interval '180 days'
  loop
    select * into s from private.report_sla(rp.id);
    foreach kind in array array_remove(array[
        case when s.first_response_breached then 'first_response' end,
        case when s.triage_breached then 'triage' end,
        case when s.resolution_breached then 'resolution' end], null)
    loop
      insert into private.report_sla_breach_notices (report_id, sla) values (rp.id, kind) on conflict do nothing;
      if found then
        insert into public.outbox_events (event_type, aggregate_type, aggregate_id, organization_id, payload)
        values ('report.sla_breached', 'report', rp.id, rp.organization_id, jsonb_build_object('report_id', rp.id, 'program_id', rp.program_id, 'organization_id', rp.organization_id, 'sla', kind));
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;

-- 7. Admin functions (owner / security admin) ----------------------------------------------------
create or replace function public.create_webhook_endpoint(p_organization_id uuid, p_url text, p_description text, p_event_types text[], p_program_id uuid, p_secret text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform private.assert_org_integration_admin(p_organization_id);
  if p_event_types is null or cardinality(p_event_types) = 0 or not (p_event_types <@ private.webhook_event_catalog()) then
    raise exception 'INVALID_EVENTS: choose at least one event from the list' using errcode = '22023';
  end if;
  if p_program_id is not null and not exists (select 1 from public.programs where id = p_program_id and organization_id = p_organization_id) then
    raise exception 'INVALID_PROGRAM: that program is not in this organization' using errcode = '22023';
  end if;
  if p_secret !~ '^whsec_[A-Za-z0-9+/=]{24,}$' then raise exception 'INVALID_SECRET: secret format' using errcode = '22023'; end if;
  if (select count(*) from public.webhook_endpoints where organization_id = p_organization_id) >= 10 then
    raise exception 'LIMIT_REACHED: an organization can have up to 10 webhook endpoints' using errcode = '54000';
  end if;
  insert into public.webhook_endpoints (organization_id, url, description, event_types, program_id, secret_encrypted, created_by)
  values (p_organization_id, p_url, nullif(trim(coalesce(p_description, '')), ''), (select array_agg(distinct e) from unnest(p_event_types) e), p_program_id, private.encrypt_sensitive_field(p_secret), auth.uid())
  returning id into new_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'integration.webhook_created', 'webhook_endpoint', new_id, jsonb_build_object('url', p_url, 'events', p_event_types));
  return new_id;
end;
$$;

create or replace function public.update_webhook_endpoint(p_endpoint_id uuid, p_url text, p_description text, p_event_types text[], p_program_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  w public.webhook_endpoints;
begin
  select * into w from public.webhook_endpoints where id = p_endpoint_id;
  if w.id is null then raise exception 'NOT_FOUND: endpoint not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(w.organization_id);
  if p_event_types is null or cardinality(p_event_types) = 0 or not (p_event_types <@ private.webhook_event_catalog()) then
    raise exception 'INVALID_EVENTS: choose at least one event from the list' using errcode = '22023';
  end if;
  if p_status not in ('active', 'paused') then raise exception 'INVALID_INPUT: active or paused' using errcode = '22023'; end if;
  if p_program_id is not null and not exists (select 1 from public.programs where id = p_program_id and organization_id = w.organization_id) then
    raise exception 'INVALID_PROGRAM: that program is not in this organization' using errcode = '22023';
  end if;
  update public.webhook_endpoints set url = p_url, description = nullif(trim(coalesce(p_description, '')), ''), event_types = (select array_agg(distinct e) from unnest(p_event_types) e),
    program_id = p_program_id, status = p_status, disabled_reason = case when p_status = 'active' then null else disabled_reason end,
    failure_streak = case when p_status = 'active' then 0 else failure_streak end, updated_at = now()
  where id = w.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), w.organization_id, 'integration.webhook_updated', 'webhook_endpoint', w.id, jsonb_build_object('url', p_url, 'status', p_status));
end;
$$;

/** New secret now; the old one keeps verifying for 24 hours so receivers can switch over. */
create or replace function public.rotate_webhook_secret(p_endpoint_id uuid, p_secret text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  w public.webhook_endpoints;
begin
  select * into w from public.webhook_endpoints where id = p_endpoint_id;
  if w.id is null then raise exception 'NOT_FOUND: endpoint not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(w.organization_id);
  if p_secret !~ '^whsec_[A-Za-z0-9+/=]{24,}$' then raise exception 'INVALID_SECRET: secret format' using errcode = '22023'; end if;
  update public.webhook_endpoints set previous_secret_encrypted = secret_encrypted, previous_secret_valid_until = now() + interval '24 hours',
    secret_encrypted = private.encrypt_sensitive_field(p_secret), updated_at = now() where id = w.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), w.organization_id, 'integration.webhook_secret_rotated', 'webhook_endpoint', w.id, '{}'::jsonb);
end;
$$;

create or replace function public.delete_integration_target(p_kind text, p_target_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid;
begin
  if p_kind = 'webhook' then select organization_id into org from public.webhook_endpoints where id = p_target_id;
  else select organization_id into org from public.chat_connections where id = p_target_id; end if;
  if org is null then raise exception 'NOT_FOUND: not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(org);
  if p_kind = 'webhook' then delete from public.webhook_endpoints where id = p_target_id;
  else delete from public.chat_connections where id = p_target_id; end if;
  delete from public.integration_deliveries where target_id = p_target_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), org, 'integration.' || p_kind || '_removed', 'integration', p_target_id, '{}'::jsonb);
end;
$$;

/** Customer-provided chat URL (Teams Workflows, or a Slack incoming webhook they created). The
 * server has already checked the URL's host; the Slack app install uses the service-role variant. */
create or replace function public.create_chat_connection(p_organization_id uuid, p_provider text, p_label text, p_url text, p_target_hint text, p_alerts text[], p_program_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform private.assert_org_integration_admin(p_organization_id);
  if p_provider not in ('slack', 'teams') then raise exception 'INVALID_INPUT: slack or teams' using errcode = '22023'; end if;
  if p_program_id is not null and not exists (select 1 from public.programs where id = p_program_id and organization_id = p_organization_id) then
    raise exception 'INVALID_PROGRAM: that program is not in this organization' using errcode = '22023';
  end if;
  if (select count(*) from public.chat_connections where organization_id = p_organization_id) >= 10 then
    raise exception 'LIMIT_REACHED: an organization can have up to 10 chat connections' using errcode = '54000';
  end if;
  insert into public.chat_connections (organization_id, provider, label, target_encrypted, target_hint, alerts, program_id, created_by)
  values (p_organization_id, p_provider, trim(p_label), private.encrypt_sensitive_field(p_url), p_target_hint, (select array_agg(distinct a) from unnest(p_alerts) a), p_program_id, auth.uid())
  returning id into new_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'integration.' || p_provider || '_connected', 'chat_connection', new_id, jsonb_build_object('label', p_label, 'alerts', p_alerts));
  return new_id;
end;
$$;

/** Slack app install (server, after a verified OAuth callback for this user and organization). */
create or replace function private.create_slack_app_connection(p_organization_id uuid, p_actor uuid, p_label text, p_url text, p_target_hint text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.organization_members where organization_id = p_organization_id and user_id = p_actor and status = 'active' and role in ('owner', 'security_admin')) then
    raise exception 'FORBIDDEN: only an owner or security admin can connect Slack' using errcode = '42501';
  end if;
  insert into public.chat_connections (organization_id, provider, label, target_encrypted, target_hint, alerts, created_by)
  values (p_organization_id, 'slack', left(p_label, 120), private.encrypt_sensitive_field(p_url), left(p_target_hint, 120), array['new_report', 'critical', 'sla_breach'], p_actor)
  returning id into new_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (p_actor, p_organization_id, 'integration.slack_connected', 'chat_connection', new_id, jsonb_build_object('label', p_label, 'via', 'slack_app'));
  return new_id;
end;
$$;

create or replace function public.update_chat_connection(p_connection_id uuid, p_alerts text[], p_program_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.chat_connections;
begin
  select * into c from public.chat_connections where id = p_connection_id;
  if c.id is null then raise exception 'NOT_FOUND: connection not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(c.organization_id);
  if p_status not in ('active', 'paused') then raise exception 'INVALID_INPUT: active or paused' using errcode = '22023'; end if;
  if p_program_id is not null and not exists (select 1 from public.programs where id = p_program_id and organization_id = c.organization_id) then
    raise exception 'INVALID_PROGRAM: that program is not in this organization' using errcode = '22023';
  end if;
  update public.chat_connections set alerts = (select array_agg(distinct a) from unnest(p_alerts) a), program_id = p_program_id, status = p_status,
    disabled_reason = case when p_status = 'active' then null else disabled_reason end, failure_streak = case when p_status = 'active' then 0 else failure_streak end, updated_at = now()
  where id = c.id;
end;
$$;

/** A test message, or a manual replay of an earlier delivery (same message id, so receivers dedupe). */
create or replace function public.queue_integration_test(p_kind text, p_target_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid;
  new_id uuid := gen_random_uuid();
begin
  if p_kind = 'webhook' then select organization_id into org from public.webhook_endpoints where id = p_target_id;
  else select organization_id into org from public.chat_connections where id = p_target_id and provider = p_kind; end if;
  if org is null then raise exception 'NOT_FOUND: not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(org);
  if not private.check_and_consume_rate_limit('integration_test:' || p_target_id, 10, 3600) then
    raise exception 'RATE_LIMITED: at most 10 test messages an hour' using errcode = '54000';
  end if;
  insert into public.integration_deliveries (id, organization_id, target_kind, target_id, message_id, event_type, payload, max_attempts)
  values (new_id, org, p_kind, p_target_id, 'msg_' || new_id, 'integration.test',
    jsonb_build_object('id', new_id, 'type', 'integration.test', 'occurred_at', now(), 'organization_id', org, 'data', jsonb_build_object('message', 'Test delivery from Unpatched')), 1);
  return new_id;
end;
$$;

create or replace function public.replay_integration_delivery(p_delivery_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  d public.integration_deliveries;
  new_id uuid;
begin
  select * into d from public.integration_deliveries where id = p_delivery_id;
  if d.id is null then raise exception 'NOT_FOUND: delivery not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(d.organization_id);
  if not private.check_and_consume_rate_limit('integration_replay:' || d.target_id, 30, 3600) then
    raise exception 'RATE_LIMITED: at most 30 replays an hour for one target' using errcode = '54000';
  end if;
  insert into public.integration_deliveries (organization_id, target_kind, target_id, event_id, message_id, event_type, payload, replay_of)
  values (d.organization_id, d.target_kind, d.target_id, d.event_id, d.message_id, d.event_type, d.payload, d.id)
  returning id into new_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), d.organization_id, 'integration.delivery_replayed', 'integration_delivery', d.id, '{}'::jsonb);
  return new_id;
end;
$$;

-- 8. Slack OAuth state (one-time, hashed) -------------------------------------------------------
create table public.integration_oauth_states (
  state_hash text primary key,
  provider text not null check (provider in ('slack', 'github')),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.integration_oauth_states enable row level security;
revoke all on public.integration_oauth_states from anon, authenticated;
grant select, insert, delete on public.integration_oauth_states to service_role;

-- Grants -----------------------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_webhook_endpoint(uuid, text, text, text[], uuid, text)', 'public.update_webhook_endpoint(uuid, text, text, text[], uuid, text)',
    'public.rotate_webhook_secret(uuid, text)', 'public.delete_integration_target(text, uuid)',
    'public.create_chat_connection(uuid, text, text, text, text, text[], uuid)', 'public.update_chat_connection(uuid, text[], uuid, text)',
    'public.queue_integration_test(text, uuid)', 'public.replay_integration_delivery(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
