-- Audit AUTH-3 (P1). public.sessions had no expiry: the browser cookie expires after 30 days
-- (services/auth.ts SESSION_COOKIE_MAX_AGE_SECONDS), but the server accepted the same cookie
-- value forever, so a copied or stolen cookie never stopped working. get_session_gate is now
-- the single place sessions are validated (proxy and getCurrentUser's fallback both use
-- it), and it refuses a session older than the cookie's own 30-day lifetime.

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
  where s.id = p_session_id
    and s.created_at > now() - interval '30 days';
$$;

revoke all on function public.get_session_gate(uuid) from public;
grant execute on function public.get_session_gate(uuid) to service_role;
