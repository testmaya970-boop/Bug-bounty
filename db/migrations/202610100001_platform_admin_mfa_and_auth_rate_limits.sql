-- Audit ADM-1 + launch readiness (2026-10-10).
--
-- 1. Platform-admin power now requires MFA, enforced here rather than in the UI.
--    private.is_platform_admin() is true only when the caller's CURRENT SESSION has passed
--    MFA (aal2, or a redeemed backup code), using the same rule as get_session_gate's
--    mfa_session_verified. The session id arrives in the claims (lib/db/pool.ts copies it
--    from the proxy-verified request header), and it must belong to auth.uid(). Every
--    platform RPC and every RLS policy that calls is_platform_admin() picks this up, so a
--    Server Action posted to an MFA-exempt path (/mfa/verify, /settings/security) can't
--    use admin power on a password-only session. An admin with no factor at all has no
--    admin power anywhere until they enroll; the proxy sends them to /settings/security.
--
-- 2. get_session_gate also reports platform_admin (raw membership), so the proxy can send
--    an admin with no factor to enrollment. The return type changes, so drop and recreate.
--
-- 3. Password reset and sign-up get rate limits. Before this, both were unlimited: anyone
--    could make the app send unlimited reset or verification emails.

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
    and exists (
      select 1 from public.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.user_id = auth.uid()
        and s.created_at > now() - interval '30 days'
        and (s.aal = 'aal2' or exists (select 1 from public.mfa_verified_sessions v where v.session_id = s.id and v.user_id = s.user_id))
    );
$$;

drop function public.get_session_gate(uuid);

create function public.get_session_gate(p_session_id uuid)
returns table (
  user_id uuid,
  aal public.aal_level,
  token_hash text,
  updated_at timestamptz,
  deactivated boolean,
  mfa_enrolled boolean,
  mfa_session_verified boolean,
  platform_admin boolean
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
    s.aal = 'aal2' or exists (select 1 from public.mfa_verified_sessions v where v.session_id = s.id and v.user_id = s.user_id),
    exists (select 1 from public.platform_admins pa where pa.user_id = s.user_id)
  from public.sessions s
  join public.users u on u.id = s.user_id
  where s.id = p_session_id
    and s.created_at > now() - interval '30 days';
$$;

revoke all on function public.get_session_gate(uuid) from public;
grant execute on function public.get_session_gate(uuid) to service_role;

-- Password reset: 3 per email per hour, 20 per client per hour. Checked before the account
-- lookup, so hitting the limit says nothing about whether the account exists.
create or replace function public.check_password_reset_rate_limit(p_email text, p_client text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  per_email boolean;
  per_client boolean;
begin
  per_email := private.check_and_consume_rate_limit('password_reset:' || lower(trim(p_email)), 3, 3600);
  per_client := private.check_and_consume_rate_limit('password_reset_client:' || left(coalesce(p_client, 'unknown'), 100), 20, 3600);
  return per_email and per_client;
end;
$$;

revoke all on function public.check_password_reset_rate_limit(text, text) from public, authenticated, anon;
grant execute on function public.check_password_reset_rate_limit(text, text) to service_role;

-- Sign-up (new accounts and re-sent codes for unconfirmed ones): 5 per email per hour,
-- 30 per client per hour (loose enough for many people behind one carrier-grade NAT).
create or replace function public.check_sign_up_rate_limit(p_email text, p_client text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  per_email boolean;
  per_client boolean;
begin
  per_email := private.check_and_consume_rate_limit('sign_up:' || lower(trim(p_email)), 5, 3600);
  per_client := private.check_and_consume_rate_limit('sign_up_client:' || left(coalesce(p_client, 'unknown'), 100), 30, 3600);
  return per_email and per_client;
end;
$$;

revoke all on function public.check_sign_up_rate_limit(text, text) from public, authenticated, anon;
grant execute on function public.check_sign_up_rate_limit(text, text) to service_role;
