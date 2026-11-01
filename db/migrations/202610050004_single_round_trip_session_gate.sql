-- Audit PERF-2 (P0). The proxy paid ~12 sequential round trips on every authenticated
-- request: a service_role transaction to validate the session (begin, set_config, set role,
-- select, an unconditional `update sessions set updated_at`, commit) and a second actor
-- transaction for the deactivation + MFA gate (begin, set_config, set role, two queries on
-- one client -- serialized, despite the old comment calling them parallel -- commit).
--
-- get_session_gate returns the session row plus both gate facts in one statement, using
-- the same conditions as am_i_deactivated() and get_my_mfa_status() (202609020003/
-- 202609020001), so gate decisions are unchanged. The token hash is still verified in the
-- app (HMAC with SESSION_COOKIE_SECRET, which the database never sees). touch_session
-- records "last active" only after that verification, and only when it is >5 minutes stale.
--
-- Granted to service_role only. The runtime login role reaches them through its inherited
-- service_role membership (000000000001_native_auth_shim.sql), with no SET ROLE needed.

create or replace function public.get_session_gate(p_session_id uuid)
returns table (
  user_id uuid,
  aal public.aal_level,
  token_hash text,
  updated_at timestamptz,
  deactivated boolean,
  mfa_enrolled boolean,
  mfa_session_verified boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    s.user_id,
    s.aal,
    s.token_hash,
    s.updated_at,
    u.deactivated_at is not null,
    exists (select 1 from public.mfa_factors f where f.user_id = s.user_id and f.status = 'verified'),
    s.aal = 'aal2' or exists (select 1 from public.mfa_verified_sessions v where v.session_id = s.id and v.user_id = s.user_id)
  from public.sessions s
  join public.users u on u.id = s.user_id
  where s.id = p_session_id;
$$;

create or replace function public.touch_session(p_session_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.sessions set updated_at = now() where id = p_session_id and updated_at < now() - interval '5 minutes';
$$;

revoke all on function public.get_session_gate(uuid) from public;
revoke all on function public.touch_session(uuid) from public;
grant execute on function public.get_session_gate(uuid) to service_role;
grant execute on function public.touch_session(uuid) to service_role;
