-- 202610290001's fan-out used a custom & operator, which a function with an empty search_path
-- can't resolve: chat fan-out failed. Call the intersection function directly instead.

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
    select ev.organization_id, c.provider, c.id, ev.id, 'msg_' || ev.id, ev.event_type, body || jsonb_build_object('alerts', to_jsonb(private.text_array_intersect(cats, c.alerts)))
    from public.chat_connections c
    where c.organization_id = ev.organization_id and c.status = 'active' and c.alerts && cats and (c.program_id is null or c.program_id = program)
    on conflict do nothing;
    get diagnostics added = row_count; n := n + added;
  end if;
  return n;
end;
$$;

drop operator if exists public.& (text[], text[]);
