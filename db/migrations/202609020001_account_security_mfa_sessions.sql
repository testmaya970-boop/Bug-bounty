-- Account security: session/device management + email-OTP MFA with backup codes.
-- See docs/decisions/0052.
--
-- NATIVE-POSTGRES MIGRATION EDIT (see db/migrations/README.md): this file originated as
-- supabase/migrations/202609020001_account_security_mfa_sessions.sql, built entirely on
-- Supabase Auth's own vendor-managed auth.sessions/auth.mfa_factors tables and GoTrue's
-- real TOTP mfa.* implementation (the original file's own header comment explains why:
-- avoiding hand-rolled TOTP time-window/replay logic). There is no GoTrue on vanilla
-- Postgres, and MFA is being replaced with email-delivered OTP codes rather than TOTP
-- (an explicit, deliberate choice -- delivery goes through the app's existing
-- lib/email-provider.ts activeEmailProvider, the same abstraction other transactional
-- email already uses), so this file is a genuine rewrite, not a mechanical port:
--
--   auth.sessions        -> public.sessions (new table below; owned end-to-end by
--                            lib/auth/session.ts, an opaque DB-backed session token, not
--                            a JWT -- see the migration plan's session-model decision)
--   auth.mfa_factors     -> public.mfa_factors (one row per user: an enrolled, verified
--                            email factor -- no TOTP secret, no QR code, since this is
--                            email OTP, not TOTP)
--   auth.jwt()->>'aal'   -> public.sessions.aal column, set by lib/auth/session.ts only
--                            after a real OTP verification (mirrors GoTrue's own
--                            AAL2-only-after-real-verification invariant exactly)
--   auth.jwt()->>'session_id' -> the session id is now a first-class parameter
--                            (p_session_id) passed explicitly by the calling TS code,
--                            since there is no more JWT for a claim to live on
--   auth.aal_level (type) -> public.aal_level (new enum below, same two values used
--                            anywhere in this codebase: aal1, aal2)
--
-- Backup codes and mfa_verified_sessions are carried forward unchanged in shape and
-- behavior -- neither ever depended on GoTrue, both were already first-class tables.

create type public.aal_level as enum ('aal1', 'aal2');

-- ---------------------------------------------------------------------------
-- Sessions -- replaces auth.sessions. One row per issued session; the session id is the
-- opaque cookie value's identity (the cookie itself holds only this id plus a signature,
-- never anything sensitive -- see lib/auth/session.ts). token_hash is the SHA-256 hash of
-- the actual bearer secret embedded in the cookie, so a leaked database row alone can
-- never be replayed as a session (matches organization_invitations' own token-hash
-- convention, and mfa_backup_codes' below).
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_agent text,
  ip text,
  aal public.aal_level not null default 'aal1'
);
create index sessions_user_id_idx on public.sessions(user_id);

alter table public.sessions enable row level security;
revoke all on public.sessions from anon, authenticated;
grant select, insert, update, delete on public.sessions to service_role;

create or replace function public.list_my_sessions(p_session_id uuid default null)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text,
  aal public.aal_level,
  is_current boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select s.id, s.created_at, s.updated_at, s.user_agent, s.ip, s.aal, s.id = p_session_id
    from public.sessions s
    where s.user_id = actor
    order by s.updated_at desc;
end;
$$;

revoke all on function public.list_my_sessions(uuid) from public;
grant execute on function public.list_my_sessions(uuid) to authenticated;

create or replace function public.revoke_my_session(target_session_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  delete from public.sessions where id = target_session_id and user_id = actor;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'NOT_FOUND: session not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.revoke_my_session(uuid) from public;
grant execute on function public.revoke_my_session(uuid) to authenticated;

create or replace function public.revoke_all_other_sessions(p_session_id uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  delete from public.sessions where user_id = actor and (p_session_id is null or id is distinct from p_session_id);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.revoke_all_other_sessions(uuid) from public;
grant execute on function public.revoke_all_other_sessions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Email-OTP MFA -- replaces GoTrue's real TOTP mfa.* implementation. mfa_factors holds
-- at most one enrolled, verified email factor per user (the account's own email --
-- codes are always sent there, never to an address supplied at challenge time, so a
-- compromised session alone can never redirect where codes are delivered).
-- mfa_challenges holds an in-flight OTP: a short-lived, hashed, single-use, attempt-
-- limited code. Both are new tables; there is no Supabase/GoTrue equivalent to adapt.
-- ---------------------------------------------------------------------------

create table public.mfa_factors (
  user_id uuid primary key references public.users(id) on delete cascade,
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

alter table public.mfa_factors enable row level security;
revoke all on public.mfa_factors from anon, authenticated;
grant select, insert, update, delete on public.mfa_factors to service_role;

create table public.mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null check (purpose in ('enroll', 'verify')),
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index mfa_challenges_user_purpose_idx on public.mfa_challenges(user_id, purpose) where consumed_at is null;

alter table public.mfa_challenges enable row level security;
revoke all on public.mfa_challenges from anon, authenticated;
grant select, insert, update, delete on public.mfa_challenges to service_role;

-- ---------------------------------------------------------------------------
-- MFA backup codes -- unchanged from the original migration: self-only, zero policies
-- (same "absent, not narrow" shape as researcher_kyc/platform_admins). Codes are
-- server-generated and shown to the client exactly once (generate_my_mfa_backup_codes'
-- return value) -- only their SHA-256 hash is ever stored.
-- ---------------------------------------------------------------------------

create table public.mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index mfa_backup_codes_user_unused_idx on public.mfa_backup_codes(user_id) where used_at is null;

alter table public.mfa_backup_codes enable row level security;
revoke all on public.mfa_backup_codes from anon, authenticated;
grant select, insert, update, delete on public.mfa_backup_codes to service_role;

-- Requires a real AAL2 session (the calling code's own current session row must already
-- have aal = 'aal2', set by lib/auth/session.ts only after a genuine OTP verification) --
-- codes can never be (re)generated on a password-only session, including by someone who
-- merely knows the account password. p_session_id is the caller's own session id,
-- supplied explicitly (there is no more JWT for this to be read from).
create or replace function public.generate_my_mfa_backup_codes(p_session_id uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_aal public.aal_level;
  codes text[] := '{}';
  code text;
  i int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select aal into current_aal from public.sessions where id = p_session_id and user_id = actor;
  if current_aal is null or current_aal <> 'aal2' then
    raise exception 'STRONG_AUTH_REQUIRED: verify your one-time code before generating backup codes' using errcode = '42501';
  end if;

  delete from public.mfa_backup_codes where user_id = actor and used_at is null;

  for i in 1..10 loop
    code := upper(substr(md5(gen_random_uuid()::text || i::text || clock_timestamp()::text), 1, 10));
    codes := array_append(codes, code);
    insert into public.mfa_backup_codes (user_id, code_hash) values (actor, encode(extensions.digest(code, 'sha256'), 'hex'));
  end loop;

  return codes;
end;
$$;

revoke all on function public.generate_my_mfa_backup_codes(uuid) from public;
grant execute on function public.generate_my_mfa_backup_codes(uuid) to authenticated;

create or replace function public.clear_my_mfa_backup_codes()
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  delete from public.mfa_backup_codes where user_id = actor;
end;
$$;

revoke all on function public.clear_my_mfa_backup_codes() from public;
grant execute on function public.clear_my_mfa_backup_codes() to authenticated;

-- ---------------------------------------------------------------------------
-- mfa_verified_sessions -- unchanged in shape/behavior from the original migration: the
-- backup-code equivalent of a real AAL2 session, scoped to one real session id (now
-- public.sessions.id rather than a JWT's session_id claim).
-- ---------------------------------------------------------------------------

create table public.mfa_verified_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  verified_via text not null check (verified_via in ('backup_code'))
);

alter table public.mfa_verified_sessions enable row level security;
revoke all on public.mfa_verified_sessions from anon, authenticated;
grant select, insert, update, delete on public.mfa_verified_sessions to service_role;

create or replace function public.redeem_mfa_backup_code(p_code text, p_session_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized text := upper(trim(coalesce(p_code, '')));
  matched_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED: no session context' using errcode = '28000'; end if;
  if normalized = '' then raise exception 'INVALID_CODE: enter a backup code' using errcode = '22023'; end if;

  select id into matched_id from public.mfa_backup_codes
    where user_id = actor and used_at is null and code_hash = encode(extensions.digest(normalized, 'sha256'), 'hex')
    for update;

  if matched_id is null then
    raise exception 'INVALID_CODE: that backup code is invalid or has already been used' using errcode = '22023';
  end if;

  update public.mfa_backup_codes set used_at = now() where id = matched_id;

  insert into public.mfa_verified_sessions (session_id, user_id, verified_via)
  values (p_session_id, actor, 'backup_code')
  on conflict (session_id) do update set verified_at = now();
end;
$$;

revoke all on function public.redeem_mfa_backup_code(text, uuid) from public;
grant execute on function public.redeem_mfa_backup_code(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_mfa_status -- the one function both the settings page and the app's MFA gate
-- (checked server-side on every protected request) read to decide what to show/enforce.
-- p_session_id is supplied explicitly by the caller (lib/auth/current-user.ts), since
-- there is no JWT for a session_id claim to live on.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_mfa_status(p_session_id uuid default null)
returns table (
  totp_enrolled boolean,
  current_aal public.aal_level,
  session_verified boolean,
  remaining_backup_codes integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  has_email_factor boolean;
  current_aal_value public.aal_level;
  verified_via_backup boolean;
  remaining int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select exists(select 1 from public.mfa_factors f where f.user_id = actor and f.status = 'verified') into has_email_factor;
  select coalesce((select s.aal from public.sessions s where s.id = p_session_id and s.user_id = actor), 'aal1'::public.aal_level) into current_aal_value;
  select exists(select 1 from public.mfa_verified_sessions v where v.session_id = p_session_id and v.user_id = actor) into verified_via_backup;
  select count(*) into remaining from public.mfa_backup_codes where user_id = actor and used_at is null;

  return query select has_email_factor, current_aal_value, (current_aal_value = 'aal2' or verified_via_backup), remaining;
end;
$$;

revoke all on function public.get_my_mfa_status(uuid) from public;
grant execute on function public.get_my_mfa_status(uuid) to authenticated;
