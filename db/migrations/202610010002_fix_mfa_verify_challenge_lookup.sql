-- Fixes a real, 100%-reproduction bug: services/mfa.ts's verifyChallengeCode (both MFA
-- enrollment confirmation and sign-in-time verification) pre-fetched the caller's latest
-- unconsumed challenge id with a raw `select id from public.mfa_challenges ...` under the
-- `authenticated` role, before calling verify_mfa_challenge(challenge_id, code_hash).
-- 202609020001 only ever granted that table to service_role -- there is no, and was never
-- meant to be, a grant to authenticated (every other access in this schema goes through a
-- SECURITY DEFINER RPC). That raw SELECT has therefore always thrown "permission denied
-- for table mfa_challenges" for every single attempt, confirmed live via public.app_errors.
--
-- Fix: verify_mfa_challenge already re-scopes by `user_id = actor` internally and never
-- trusted a client-supplied challenge id alone -- and create_mfa_challenge's own header
-- comment already guarantees "at most one challenge per purpose can ever be live at a
-- time" per actor. So the id parameter was never actually needed: this redefines the
-- function to look up the actor's own latest unconsumed challenge internally, removing
-- the one call site that had to query the table directly to find it.

create or replace function public.verify_mfa_challenge(p_code_hash text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  challenge public.mfa_challenges;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  update public.mfa_challenges
    set attempts = attempts + 1
    where id = (
      select id from public.mfa_challenges
      where user_id = actor and consumed_at is null
      order by created_at desc
      limit 1
    )
    returning * into challenge;

  if challenge is null then
    raise exception 'INVALID_CODE: that code is invalid or has expired' using errcode = '22023';
  end if;

  if challenge.expires_at <= now() or challenge.attempts >= 5 or challenge.code_hash <> p_code_hash then
    if challenge.expires_at <= now() or challenge.attempts >= 5 then
      update public.mfa_challenges set consumed_at = now() where id = challenge.id;
    end if;
    return 'invalid';
  end if;

  update public.mfa_challenges set consumed_at = now() where id = challenge.id;

  if challenge.purpose = 'enroll' then
    update public.mfa_factors set status = 'verified', verified_at = now() where user_id = actor;
  end if;

  return challenge.purpose;
end;
$$;

revoke all on function public.verify_mfa_challenge(uuid, text) from public;
drop function if exists public.verify_mfa_challenge(uuid, text);

revoke all on function public.verify_mfa_challenge(text) from public;
grant execute on function public.verify_mfa_challenge(text) to authenticated;
