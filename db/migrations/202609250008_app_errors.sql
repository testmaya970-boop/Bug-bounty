-- In-house error tracking (chosen over a hosted service: no third party receives error
-- text, which can contain user data). Server errors (instrumentation.ts onRequestError,
-- and the unknown-RPC-error path in services/rpc-error.ts that used to swallow bugs
-- silently) and browser errors (error boundaries + window listeners, via
-- /api/client-errors) land here; platform admins read them grouped at /platform/errors.
--
-- One row per occurrence, grouped by a fingerprint computed app-side (normalized message +
-- top stack frame). Writes only through record_app_error (service_role); reads only
-- through list_app_error_groups_for_admin (platform admin). No RLS policies at all, so the
-- table itself is unreadable to the app role.
--
-- ponytail: no retention job yet -- add a scheduled delete of rows older than ~90 days
-- once there is a scheduler (Phase 3 deploy); the client endpoint is rate-limited to bound
-- growth until then.

create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('server', 'client')),
  fingerprint text not null check (char_length(fingerprint) between 8 and 64),
  message text not null check (char_length(message) <= 1000),
  stack text check (stack is null or char_length(stack) <= 8000),
  route text check (route is null or char_length(route) <= 500),
  digest text check (digest is null or char_length(digest) <= 100),
  request_id text check (request_id is null or char_length(request_id) <= 100),
  user_id uuid references public.users(id) on delete set null
);
create index app_errors_fingerprint_occurred_idx on public.app_errors(fingerprint, occurred_at desc);
create index app_errors_occurred_idx on public.app_errors(occurred_at desc);
alter table public.app_errors enable row level security;

create or replace function public.record_app_error(
  p_source text, p_fingerprint text, p_message text, p_stack text default null, p_route text default null,
  p_digest text default null, p_request_id text default null, p_user_id uuid default null
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.app_errors (source, fingerprint, message, stack, route, digest, request_id, user_id)
  values (p_source, p_fingerprint, left(p_message, 1000), left(p_stack, 8000), left(p_route, 500), left(p_digest, 100), left(p_request_id, 100), p_user_id);
$$;

revoke all on function public.record_app_error(text, text, text, text, text, text, text, uuid) from public, authenticated, anon;
grant execute on function public.record_app_error(text, text, text, text, text, text, text, uuid) to service_role;

create or replace function public.list_app_error_groups_for_admin(p_since interval default interval '7 days')
returns table (
  fingerprint text,
  source text,
  message text,
  stack text,
  route text,
  occurrences bigint,
  affected_users bigint,
  first_seen timestamptz,
  last_seen timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select g.fingerprint, latest.source, latest.message, latest.stack, latest.route,
         g.occurrences, g.affected_users, g.first_seen, g.last_seen
  from (
    select e.fingerprint, count(*) as occurrences, count(distinct e.user_id) as affected_users,
           min(e.occurred_at) as first_seen, max(e.occurred_at) as last_seen
    from public.app_errors e
    where e.occurred_at > now() - p_since
    group by e.fingerprint
  ) g
  cross join lateral (
    select e.source, e.message, e.stack, e.route from public.app_errors e
    where e.fingerprint = g.fingerprint order by e.occurred_at desc limit 1
  ) latest
  order by g.last_seen desc
  limit 200;
end;
$$;

revoke all on function public.list_app_error_groups_for_admin(interval) from public;
grant execute on function public.list_app_error_groups_for_admin(interval) to authenticated;
