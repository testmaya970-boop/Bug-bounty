-- Signing in with MFA could get stuck: /mfa/verify emailed a fresh code on every render, and
-- create_mfa_challenge cancels the previous one. Reloading, or typing the site address again,
-- silently invalidated the code the person was about to type (seen live: six loads of
-- /mfa/verify in a row). The page now asks first whether a usable code is already out and only
-- sends one when none is; "Email me a new code" stays the explicit way to get another.
-- Live = same rules verify_mfa_challenge uses: unconsumed, unexpired, fewer than 5 attempts.
create or replace function public.has_live_mfa_challenge(p_purpose text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.mfa_challenges c
    where c.user_id = auth.uid() and c.purpose = p_purpose and c.consumed_at is null and c.expires_at > now() and c.attempts < 5
  );
$$;
revoke all on function public.has_live_mfa_challenge(text) from public, anon;
grant execute on function public.has_live_mfa_challenge(text) to authenticated;
