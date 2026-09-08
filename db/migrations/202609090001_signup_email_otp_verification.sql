-- Signup email verification: replaces the clickable-link `email_verification_tokens`
-- flow with a typed 6-digit code, per explicit product direction (see docs/decisions/0030
-- for the original link-based design this supersedes).
--
-- This is intentionally a NEW, dedicated table -- not a reuse of public.mfa_challenges
-- (db/migrations/202609080001_email_otp_mfa.sql). mfa_challenges' create_mfa_challenge/
-- verify_mfa_challenge RPCs hard-require an authenticated actor (auth.uid() is not null),
-- because MFA only ever runs for an already-signed-in session. Signup verification runs
-- BEFORE any session exists at all -- public.create_user() inserts the account row first,
-- but there is no auth.uid() to derive an actor from yet. Reusing mfa_challenges would
-- require weakening its "actor is never a parameter, only ever auth.uid()" invariant for
-- exactly one purpose, and would incorrectly touch public.mfa_factors (an MFA-enrollment
-- concept unrelated to "confirm your email"). This table instead follows the EXACT same
-- precedent public.email_verification_tokens/password_reset_tokens already established
-- for pre-authentication operations: service_role-only, actor supplied as an explicit
-- parameter, never derived from auth.uid().
--
-- Code generation/hashing happens in the app layer (lib/auth/signup-otp.ts, mirroring
-- lib/auth/mfa-otp.ts's identical shape: a 6-digit code, SHA-256 hashed, never persisted
-- in plaintext) -- this table only ever sees a hash.

create table public.signup_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  -- Carries signUpAction's own intent/companyName choice across the code-entry step,
  -- identical purpose to email_verification_tokens.metadata (see that table's own
  -- column comment) -- replaced by this table for the signup case only;
  -- email_verification_tokens/password_reset_tokens remain unchanged and still handle
  -- password-reset links.
  metadata jsonb not null default '{}'::jsonb
);
create index signup_verification_challenges_user_idx on public.signup_verification_challenges(user_id) where consumed_at is null;

alter table public.signup_verification_challenges enable row level security;
revoke all on public.signup_verification_challenges from anon, authenticated;
grant select, insert, update, delete on public.signup_verification_challenges to service_role;

-- ---------------------------------------------------------------------------
-- create_signup_verification_challenge -- issues a new code for a just-created,
-- not-yet-verified account. Enforces:
--   * ownership implicit in requiring the target account to exist and be unverified
--     (email_verified_at is null) -- an already-verified account has nothing left to
--     confirm, so this rejects rather than silently reissuing a pointless code.
--   * rate limiting: at most 5 challenges per rolling 15 minutes per account, counted
--     directly off this table's own created_at (same convention as
--     create_mfa_challenge's identical limit).
--   * any prior unconsumed challenge for this account is invalidated (consumed_at set)
--     before the new one is inserted, so at most one code is ever live at a time.
-- service_role-only, called from services/auth.ts's signUpWithPassword/
-- resendConfirmationEmail, never reachable by anon/authenticated directly (mirrors
-- email_verification_tokens' own reachability exactly).
-- ---------------------------------------------------------------------------

create or replace function public.create_signup_verification_challenge(p_user_id uuid, p_code_hash text, p_ttl_seconds integer, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  account public.users;
  recent_count integer;
  new_id uuid;
begin
  select * into account from public.users where id = p_user_id;
  if account.id is null then raise exception 'ACCOUNT_NOT_FOUND: account not found' using errcode = 'P0002'; end if;
  if account.email_verified_at is not null then
    raise exception 'ALREADY_VERIFIED: this account is already confirmed' using errcode = '42710';
  end if;

  select count(*) into recent_count
    from public.signup_verification_challenges
    where user_id = p_user_id and created_at > now() - interval '15 minutes';
  if recent_count >= 5 then
    raise exception 'RATE_LIMITED: too many codes requested. Wait a few minutes and try again.' using errcode = '42901';
  end if;

  update public.signup_verification_challenges set consumed_at = now()
    where user_id = p_user_id and consumed_at is null;

  insert into public.signup_verification_challenges (user_id, code_hash, expires_at, metadata)
    values (p_user_id, p_code_hash, now() + make_interval(secs => p_ttl_seconds), coalesce(p_metadata, '{}'::jsonb))
    returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_signup_verification_challenge(uuid, text, integer, jsonb) from public;
grant execute on function public.create_signup_verification_challenge(uuid, text, integer, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- verify_signup_verification_challenge -- checks a submitted code against the account's
-- latest unconsumed challenge. Enforces single-use, expiry, and a 5-attempt limit,
-- identical shape to verify_mfa_challenge (202609080001_email_otp_mfa.sql) INCLUDING that
-- function's own critical fix: this function must never RAISE EXCEPTION for a
-- wrong/expired/exhausted outcome, because a RAISE unwinds every DML this same function
-- call already performed (Postgres has no implicit per-statement savepoint inside one
-- plpgsql function body) -- an earlier version of verify_mfa_challenge that tried
-- "increment attempts, then raise on a wrong code" silently discarded its own attempts
-- increment every time, found live via scripts/live-test-mfa-otp.mjs. This function
-- instead performs every write a wrong-code outcome needs and returns the plain string
-- 'invalid' rather than raising; only a genuinely missing/foreign challenge (nothing to
-- write, so nothing to lose) still raises. On success, marks the account's email verified
-- in the SAME transaction and returns 'valid' plus the metadata the caller needs to
-- pick a post-verification destination -- services/auth.ts maps 'invalid' to the
-- caller-facing INVALID_CODE contract.
-- ---------------------------------------------------------------------------

create or replace function public.verify_signup_verification_challenge(p_user_id uuid, p_code_hash text)
returns table (outcome text, metadata jsonb)
language plpgsql security definer set search_path = ''
as $$
declare
  challenge public.signup_verification_challenges;
begin
  update public.signup_verification_challenges
    set attempts = attempts + 1
    where user_id = p_user_id and consumed_at is null
    returning * into challenge;

  if challenge is null then
    raise exception 'INVALID_CODE: that code is invalid or has expired' using errcode = '22023';
  end if;

  if challenge.expires_at <= now() or challenge.attempts >= 5 or challenge.code_hash <> p_code_hash then
    -- Expired, attempts exhausted, or a wrong code: all three consume the challenge and
    -- report the same 'invalid' outcome, so a caller can never distinguish one from
    -- another -- the same enumeration-safety posture as everywhere else in this schema.
    -- Only actually consumed once attempts is exhausted or the challenge is expired; a
    -- wrong guess still under the limit leaves the challenge live so a genuine retry can
    -- still succeed.
    if challenge.expires_at <= now() or challenge.attempts >= 5 then
      update public.signup_verification_challenges set consumed_at = now() where id = challenge.id;
    end if;
    return query select 'invalid'::text, '{}'::jsonb;
    return;
  end if;

  update public.signup_verification_challenges set consumed_at = now() where id = challenge.id;
  update public.users set email_verified_at = now(), updated_at = now() where id = p_user_id and email_verified_at is null;

  return query select 'valid'::text, challenge.metadata;
end;
$$;

revoke all on function public.verify_signup_verification_challenge(uuid, text) from public;
grant execute on function public.verify_signup_verification_challenge(uuid, text) to service_role;
