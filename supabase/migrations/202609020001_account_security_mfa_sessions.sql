-- Account security: session/device management + TOTP MFA with backup codes.
-- See docs/decisions/0052.
--
-- Deliberately built on Supabase Auth's own real, vendor-managed tables and MFA
-- implementation (auth.sessions, auth.mfa_factors, the real supabase.auth.mfa.* client
-- API) rather than a parallel, hand-rolled session or TOTP system -- inventing our own
-- TOTP time-window/replay logic would be exactly the kind of unverified security code
-- this project's own conventions warn against (see the KYC encryption bug this session:
-- even reusing a well-known library, one schema-qualification mistake was enough to break
-- it silently). Every function here is a narrow, self-scoped (auth.uid()-only) window onto
-- that real vendor data, never a second source of truth.
--
-- Backup codes are the one piece Supabase Auth does not provide natively. Real constraint:
-- redeeming a backup code cannot itself mint an AAL2-elevated Supabase JWT (only a real
-- `mfa.verify()` TOTP check does that, at the GoTrue level). So backup-code verification is
-- tracked as an equally real, server-checked, session-scoped fact in
-- `mfa_verified_sessions` (keyed by the JWT's own `session_id` claim), and
-- `get_my_mfa_status()` treats "AAL2 this JWT" OR "backup-code-verified this session_id"
-- as equally valid -- both are real, auditable checks, never a client-supplied claim.

-- ---------------------------------------------------------------------------
-- Session/device management -- reads and writes auth.sessions directly, GoTrue's own real
-- session table (verified live: id, user_id, created_at, updated_at, user_agent, ip, aal,
-- session_id claim present in a real issued JWT -- not assumed from documentation).
-- ---------------------------------------------------------------------------

create or replace function public.list_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text,
  aal auth.aal_level,
  is_current boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select s.id, s.created_at, s.updated_at, s.user_agent, s.ip::text, s.aal, s.id = current_session_id
    from auth.sessions s
    where s.user_id = actor
    order by s.updated_at desc;
end;
$$;

revoke all on function public.list_my_sessions() from public;
grant execute on function public.list_my_sessions() to authenticated;

create or replace function public.revoke_my_session(target_session_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  delete from auth.sessions where id = target_session_id and user_id = actor;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'NOT_FOUND: session not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.revoke_my_session(uuid) from public;
grant execute on function public.revoke_my_session(uuid) to authenticated;

create or replace function public.revoke_all_other_sessions()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  delete from auth.sessions where user_id = actor and (current_session_id is null or id is distinct from current_session_id);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.revoke_all_other_sessions() from public;
grant execute on function public.revoke_all_other_sessions() to authenticated;

-- ---------------------------------------------------------------------------
-- MFA backup codes -- self-only, zero policies (same "absent, not narrow" shape as
-- researcher_kyc/platform_admins). Codes are server-generated and shown to the client
-- exactly once (generate_my_mfa_backup_codes' return value) -- only their SHA-256 hash is
-- ever stored, matching organization_invitations' own token-hash convention.
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

-- Requires a real AAL2 session (the JWT's own `aal` claim, set by GoTrue only after a
-- genuine `mfa.verify()` TOTP check) -- codes can never be (re)generated on a
-- password-only session, including by someone who merely knows the account password.
create or replace function public.generate_my_mfa_backup_codes()
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  codes text[] := '{}';
  code text;
  i int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'STRONG_AUTH_REQUIRED: verify your authenticator app before generating backup codes' using errcode = '42501';
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

revoke all on function public.generate_my_mfa_backup_codes() from public;
grant execute on function public.generate_my_mfa_backup_codes() to authenticated;

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
-- mfa_verified_sessions -- see the file header comment for why this exists: it is the
-- backup-code equivalent of a real AAL2 JWT, scoped to one real GoTrue session_id.
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

create or replace function public.redeem_mfa_backup_code(p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  normalized text := upper(trim(coalesce(p_code, '')));
  matched_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if current_session_id is null then raise exception 'SESSION_REQUIRED: no session context' using errcode = '28000'; end if;
  if normalized = '' then raise exception 'INVALID_CODE: enter a backup code' using errcode = '22023'; end if;

  select id into matched_id from public.mfa_backup_codes
    where user_id = actor and used_at is null and code_hash = encode(extensions.digest(normalized, 'sha256'), 'hex')
    for update;

  if matched_id is null then
    raise exception 'INVALID_CODE: that backup code is invalid or has already been used' using errcode = '22023';
  end if;

  update public.mfa_backup_codes set used_at = now() where id = matched_id;

  insert into public.mfa_verified_sessions (session_id, user_id, verified_via)
  values (current_session_id, actor, 'backup_code')
  on conflict (session_id) do update set verified_at = now();
end;
$$;

revoke all on function public.redeem_mfa_backup_code(text) from public;
grant execute on function public.redeem_mfa_backup_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_mfa_status -- the one function both the settings page and the app's MFA gate
-- (checked server-side on every protected request) read to decide what to show/enforce.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_mfa_status()
returns table (
  totp_enrolled boolean,
  current_aal auth.aal_level,
  session_verified boolean,
  remaining_backup_codes integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  has_totp boolean;
  current_aal_value auth.aal_level := coalesce((auth.jwt() ->> 'aal')::auth.aal_level, 'aal1'::auth.aal_level);
  verified_via_backup boolean;
  remaining int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select exists(select 1 from auth.mfa_factors f where f.user_id = actor and f.factor_type = 'totp' and f.status = 'verified') into has_totp;
  select exists(select 1 from public.mfa_verified_sessions v where v.session_id = current_session_id and v.user_id = actor) into verified_via_backup;
  select count(*) into remaining from public.mfa_backup_codes where user_id = actor and used_at is null;

  return query select has_totp, current_aal_value, (current_aal_value = 'aal2' or verified_via_backup), remaining;
end;
$$;

revoke all on function public.get_my_mfa_status() from public;
grant execute on function public.get_my_mfa_status() to authenticated;
