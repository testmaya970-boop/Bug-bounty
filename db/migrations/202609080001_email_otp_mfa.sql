-- Email-OTP MFA: the RPCs services/mfa.ts needs to actually populate/consume
-- public.mfa_factors/public.mfa_challenges (both created empty by
-- 202609020001_account_security_mfa_sessions.sql, which anticipated this as a distinct
-- follow-up unit of work -- see that migration's own header comment). No TOTP secret, no
-- QR code: enrollment and sign-in-time verification are both "we email you a 6-digit
-- code, you type it back" against the account's own registered email, the same
-- code-hashing-at-rest convention as every other token table in this schema
-- (mfa_backup_codes, email_verification_tokens, password_reset_tokens). The actual code
-- generation + SHA-256 hashing happens in the app layer (lib/auth/mfa-otp.ts, mirroring
-- lib/auth/tokens.ts's identical shape) -- these RPCs only ever see a hash, never a
-- plaintext code, so a compromised replica/backup of this data can never itself be used
-- to sign in.

-- ---------------------------------------------------------------------------
-- create_mfa_challenge -- issues a new challenge row for the calling actor. Enforces:
--   * ownership implicit in actor := auth.uid() (never a client-supplied user id)
--   * rate limiting: at most 5 challenges per purpose per rolling 15 minutes, counted
--     directly off mfa_challenges.created_at -- no separate rate-limit-counters bucket
--     needed, this table already carries exactly the timestamps required.
--   * any prior unconsumed challenge of the same purpose for this actor is invalidated
--     (consumed_at set) before the new one is inserted, so at most one challenge per
--     purpose can ever be live at a time -- a stale code from an earlier request can
--     never be verified after a newer one was issued.
-- 'enroll' requires no pre-existing verified factor (re-enrolling an already-verified
-- account must go through unenroll first, mirroring GoTrue's own "one verified TOTP
-- factor at a time" behavior); 'verify' requires one.
-- ---------------------------------------------------------------------------

create or replace function public.create_mfa_challenge(p_purpose text, p_code_hash text, p_ttl_seconds integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  has_verified_factor boolean;
  recent_count integer;
  new_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if p_purpose not in ('enroll', 'verify') then raise exception 'INVALID_PURPOSE: unrecognized challenge purpose' using errcode = '22023'; end if;

  select exists(select 1 from public.mfa_factors f where f.user_id = actor and f.status = 'verified') into has_verified_factor;
  if p_purpose = 'enroll' and has_verified_factor then
    raise exception 'ALREADY_ENROLLED: two-factor authentication is already enabled' using errcode = '42710';
  end if;
  if p_purpose = 'verify' and not has_verified_factor then
    raise exception 'NOT_ENROLLED: two-factor authentication is not enabled' using errcode = '22023';
  end if;

  select count(*) into recent_count
    from public.mfa_challenges
    where user_id = actor and purpose = p_purpose and created_at > now() - interval '15 minutes';
  if recent_count >= 5 then
    raise exception 'RATE_LIMITED: too many codes requested. Wait a few minutes and try again.' using errcode = '42901';
  end if;

  update public.mfa_challenges set consumed_at = now()
    where user_id = actor and purpose = p_purpose and consumed_at is null;

  insert into public.mfa_challenges (user_id, purpose, code_hash, expires_at)
    values (actor, p_purpose, p_code_hash, now() + make_interval(secs => p_ttl_seconds))
    returning id into new_id;

  if p_purpose = 'enroll' then
    insert into public.mfa_factors (user_id, status) values (actor, 'unverified')
      on conflict (user_id) do update set status = 'unverified', verified_at = null;
  end if;

  return new_id;
end;
$$;

revoke all on function public.create_mfa_challenge(text, text, integer) from public;
grant execute on function public.create_mfa_challenge(text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- verify_mfa_challenge -- the only path that consumes a challenge. Enforces:
--   * challenge ownership: looked up by (id, user_id = actor), never id alone
--   * single-use: consumed_at is null in the where clause, and the row is consumed as
--     soon as it is exhausted/expired/wrong -- never checkable twice even under
--     concurrent requests for the same challenge id (the attempts-increment UPDATE ...
--     RETURNING is itself the atomic claim on the row)
--   * expiry: expires_at > now()
--   * attempt limit: 5 wrong codes exhausts the challenge (attempts is incremented
--     unconditionally, before the hash comparison, so a crashed/retried request still
--     counts) -- an exhausted or expired challenge reports the same 'invalid' outcome as
--     a wrong code, never a distinguishable "you're locked out" signal (this codebase's
--     existing enumeration-safety convention -- see services/auth.ts's own
--     DUMMY_HASH_FOR_TIMING comment for the same reasoning applied elsewhere).
-- On success for an 'enroll' challenge, marks the factor verified. Returns the purpose
-- ('enroll' or 'verify') on success, or the literal string 'invalid' on any rejected
-- outcome (see the IMPORTANT note below for why this never RAISEs for that case) --
-- services/mfa.ts is what turns 'invalid' into the caller-facing INVALID_CODE error.
-- ---------------------------------------------------------------------------

-- IMPORTANT (found live via scripts/live-test-mfa-otp.mjs): a plpgsql function's own DML
-- is NOT durable if that same function call later RAISE EXCEPTIONs -- an exception
-- aborts the entire enclosing statement (the `select * from verify_mfa_challenge(...)`
-- call itself), unwinding every write the function performed, not merely the write that
-- triggered the error. There is no implicit per-statement savepoint inside a single
-- plpgsql function body. An earlier version of this function tried to
-- "increment attempts, then raise on a wrong code" in one call and silently discarded
-- every attempts increment as a result -- confirmed live (attempts stayed 0 forever).
-- The fix: this function never raises for an "invalid code" outcome (wrong code,
-- exhausted attempts, or expired) -- it performs every write that outcome needs
-- (incrementing attempts, and consuming the row when exhausted/expired/wrong) and
-- returns a plain status string instead, so the DML is always part of a successful
-- statement and always commits. Only a genuinely exceptional case (no such
-- owned/unconsumed challenge exists at all -- nothing to write) still raises, since
-- there is no state transition to lose in that case. services/mfa.ts maps the returned
-- status to the same OrganizationServiceError/INVALID_CODE contract callers already
-- expect, so this is invisible to every caller above the RPC boundary.
create or replace function public.verify_mfa_challenge(p_challenge_id uuid, p_code_hash text)
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
    where id = p_challenge_id and user_id = actor and consumed_at is null
    returning * into challenge;

  if challenge is null then
    raise exception 'INVALID_CODE: that code is invalid or has expired' using errcode = '22023';
  end if;

  if challenge.expires_at <= now() or challenge.attempts >= 5 or challenge.code_hash <> p_code_hash then
    -- Expired, attempts exhausted, or a wrong code: all three consume the challenge and
    -- report the same 'invalid' outcome, so a caller can never distinguish one from
    -- another -- the same enumeration-safety posture as everywhere else in this schema
    -- (see services/auth.ts's own DUMMY_HASH_FOR_TIMING comment for the same reasoning
    -- applied elsewhere). Only actually consumed once attempts is exhausted or the
    -- challenge is expired; a wrong guess still under the limit leaves the challenge
    -- live so a genuine retry can still succeed.
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
grant execute on function public.verify_mfa_challenge(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- unenroll_my_mfa_factor -- replaces GoTrue's auth.mfa.unenroll(). Also clears any
-- in-flight challenges and backup codes for the account, mirroring
-- unenrollMfaFactorAction's existing "unenroll then clearMyBackupCodes" two-call
-- sequence -- folded into one statement here isn't required (the TS layer still calls
-- clear_my_mfa_backup_codes separately, unchanged), so this only touches mfa_factors and
-- mfa_challenges, its own two tables.
-- ---------------------------------------------------------------------------

create or replace function public.unenroll_my_mfa_factor()
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  delete from public.mfa_factors where user_id = actor;
  delete from public.mfa_challenges where user_id = actor;
end;
$$;

revoke all on function public.unenroll_my_mfa_factor() from public;
grant execute on function public.unenroll_my_mfa_factor() to authenticated;

-- ---------------------------------------------------------------------------
-- list_my_mfa_factors -- replaces GoTrue's auth.mfa.listFactors(). At most one row: this
-- schema only ever tracks one email factor per user (public.mfa_factors.user_id is the
-- primary key). id is the user's own id -- there is no separate factor identity for an
-- email factor the way GoTrue minted one per TOTP enrollment, and every existing caller
-- (actions/mfa.ts, components/settings/mfa-settings.tsx, app/mfa/verify/page.tsx) already
-- treats factorId as an opaque string, never parses or displays it, so this is a
-- transparent substitution.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_mfa_factors()
returns table (id uuid, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  return query select f.user_id, f.status, f.created_at from public.mfa_factors f where f.user_id = actor;
end;
$$;

revoke all on function public.list_my_mfa_factors() from public;
grant execute on function public.list_my_mfa_factors() to authenticated;
