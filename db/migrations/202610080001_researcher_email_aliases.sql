-- Researcher email aliases (like HackerOne's @wearehackerone.com / Bugcrowd's
-- @bugcrowdninja.com): every researcher gets <alias>@<ALIAS_EMAIL_DOMAIN> to register
-- test accounts on a program's targets. Mail to it arrives at Mailgun (MX on the alias
-- subdomain), is POSTed to /api/inbound/email with an HMAC signature, and is forwarded to
-- the researcher's real address -- which the sender never sees.
--
--  * researcher_email_aliases: one stable alias per researcher, assigned on first use from
--    their username (lower-cased; a numeric suffix if that is taken). Stable afterwards.
--  * email_alias_forwards: one row per inbound message -- the researcher's forwarding log
--    and, through the unique Mailgun token, replay protection.
--  * resolve_inbound_email_alias (service role only): records the message and returns where
--    to forward it, or why not (unknown alias, inactive account, rate limit, replay).
--  * complete_email_alias_forward (service role only): records the send outcome.
-- Only researcher accounts get aliases; a suspended or deactivated account's alias stops
-- forwarding. Rate limit: 200 forwards per alias per 24 hours.

create table public.researcher_email_aliases (
  user_id uuid primary key references public.users(id) on delete cascade,
  local_part text not null unique check (local_part ~ '^[a-z0-9_]{3,40}$'),
  created_at timestamptz not null default now()
);

create table public.email_alias_forwards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  local_part text not null,
  provider_token text not null unique,
  sender text not null check (char_length(sender) <= 320),
  subject text check (subject is null or char_length(subject) <= 998),
  status text not null check (status in ('received', 'forwarded', 'failed', 'rejected_unknown_alias', 'rejected_inactive', 'rate_limited')),
  provider_message_id text,
  error text check (error is null or char_length(error) <= 500),
  received_at timestamptz not null default now(),
  completed_at timestamptz
);
create index email_alias_forwards_user_received_idx on public.email_alias_forwards (user_id, received_at desc);

alter table public.researcher_email_aliases enable row level security;
alter table public.email_alias_forwards enable row level security;
create policy "researchers read their own alias" on public.researcher_email_aliases
  for select to authenticated using (user_id = auth.uid());
create policy "researchers read their own forwarding log" on public.email_alias_forwards
  for select to authenticated using (user_id = auth.uid());
grant select on public.researcher_email_aliases, public.email_alias_forwards to authenticated;
grant select, insert, update, delete on public.researcher_email_aliases, public.email_alias_forwards to service_role;

-- The caller's alias, created on first call. Researchers only.
create or replace function public.ensure_my_email_alias()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  me public.users;
  existing text;
  base text;
  candidate text;
  suffix integer := 1;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into me from public.users where id = actor;
  if me.account_type is distinct from 'researcher' then
    raise exception 'FORBIDDEN: only researcher accounts have an email alias' using errcode = '42501';
  end if;
  select local_part into existing from public.researcher_email_aliases where user_id = actor;
  if existing is not null then return existing; end if;

  base := left(lower(me.username), 34);
  candidate := base;
  while exists (select 1 from public.researcher_email_aliases where local_part = candidate) loop
    suffix := suffix + 1;
    candidate := base || suffix::text;
  end loop;
  insert into public.researcher_email_aliases (user_id, local_part) values (actor, candidate)
  on conflict (user_id) do nothing;
  select local_part into existing from public.researcher_email_aliases where user_id = actor;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'researcher.email_alias_created', 'user', actor, jsonb_build_object('local_part', existing));
  return existing;
end;
$$;

create or replace function public.resolve_inbound_email_alias(p_provider_token text, p_local_part text, p_sender text, p_subject text)
returns table (forward_id uuid, outcome text, recipient_email text, recipient_display_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  alias public.researcher_email_aliases;
  owner public.users;
  forward public.email_alias_forwards;
  local text := lower(trim(coalesce(p_local_part, '')));
  verdict text;
begin
  if nullif(trim(coalesce(p_provider_token, '')), '') is null then
    raise exception 'INVALID_INBOUND: missing provider token' using errcode = '22023';
  end if;
  -- Replay: Mailgun's token is unique per delivery; the same token is never forwarded twice.
  if exists (select 1 from public.email_alias_forwards f where f.provider_token = p_provider_token) then
    return query select null::uuid, 'replay'::text, null::text, null::text;
    return;
  end if;

  select * into alias from public.researcher_email_aliases a where a.local_part = local;
  if alias.user_id is not null then select * into owner from public.users u where u.id = alias.user_id; end if;

  verdict := case
    when alias.user_id is null then 'rejected_unknown_alias'
    when owner.is_suspended or owner.deactivated_at is not null or owner.account_type is distinct from 'researcher' then 'rejected_inactive'
    when (select count(*) from public.email_alias_forwards f
          where f.user_id = alias.user_id and f.status = 'forwarded' and f.received_at > now() - interval '24 hours') >= 200 then 'rate_limited'
    else 'received'
  end;

  insert into public.email_alias_forwards (user_id, local_part, provider_token, sender, subject, status, completed_at)
  values (alias.user_id, left(local, 64), p_provider_token, left(coalesce(p_sender, ''), 320), left(p_subject, 998), verdict,
          case when verdict = 'received' then null else now() end)
  returning * into forward;

  return query select forward.id, verdict,
    case when verdict = 'received' then owner.email end,
    case when verdict = 'received' then owner.display_name end;
end;
$$;

create or replace function public.complete_email_alias_forward(p_forward_id uuid, p_succeeded boolean, p_provider_message_id text, p_error text)
returns void
language sql security definer set search_path = ''
as $$
  update public.email_alias_forwards
     set status = case when p_succeeded then 'forwarded' else 'failed' end,
         provider_message_id = left(p_provider_message_id, 300),
         error = case when p_succeeded then null else left(p_error, 500) end,
         completed_at = now()
   where id = p_forward_id and status = 'received';
$$;

revoke all on function public.ensure_my_email_alias() from public, anon;
grant execute on function public.ensure_my_email_alias() to authenticated;
revoke all on function public.resolve_inbound_email_alias(text, text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_inbound_email_alias(text, text, text, text) to service_role;
revoke all on function public.complete_email_alias_forward(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.complete_email_alias_forward(uuid, boolean, text, text) to service_role;
