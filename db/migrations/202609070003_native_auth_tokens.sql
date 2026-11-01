-- NATIVE-POSTGRES MIGRATION (new, not from supabase/migrations/): email verification and
-- password reset tokens, replacing Supabase Auth/GoTrue's own token_hash-based signup
-- confirmation and recovery links. See db/migrations/README.md.
--
-- Both tables follow the same shape/convention as mfa_backup_codes and
-- organization_invitations already in this schema: the token itself is a CSPRNG value
-- generated in the app layer (lib/auth/tokens.ts), shown to the user exactly once (as a
-- link), and only its SHA-256 hash is ever persisted -- a leaked database row alone can
-- never be replayed as a valid token. Single-use (consumed_at), time-limited
-- (expires_at), and every issuance/consumption goes through service_role only (identical
-- pattern to mfa_challenges) since these are inherently pre-authentication operations
-- with no real "actor" for RLS to scope by.

create table public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  -- Carries signUpAction's own `intent`/`companyName` choice across the unauthenticated
  -- confirm-email redirect, replacing what used to be Supabase Auth signup metadata
  -- (raw_user_meta_data) read back by app/auth/confirm/route.ts. Never trusted for
  -- anything beyond picking a post-confirmation destination/auto-creating an
  -- organization -- identical scope to the original metadata-based mechanism, which
  -- itself never granted or changed any capability (see actions/auth.ts's own comment).
  metadata jsonb not null default '{}'::jsonb
);
create index email_verification_tokens_user_idx on public.email_verification_tokens(user_id) where consumed_at is null;

alter table public.email_verification_tokens enable row level security;
revoke all on public.email_verification_tokens from anon, authenticated;
grant select, insert, update, delete on public.email_verification_tokens to service_role;

create table public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index password_reset_tokens_user_idx on public.password_reset_tokens(user_id) where consumed_at is null;

alter table public.password_reset_tokens enable row level security;
revoke all on public.password_reset_tokens from anon, authenticated;
grant select, insert, update, delete on public.password_reset_tokens to service_role;

-- Sign-in rate limiting (check_sign_in_rate_limit) was originally implemented against
-- Supabase-specific request context in a prior migration -- verify it has no such
-- dependency (it doesn't: confirmed by inspection, it is a plain public.users/attempts
-- table check with no auth.*/extensions.* reference) so no edit is needed there. Nothing
-- else in this migration touches it.

-- Every migrated user (scripts/migrate-users-data.mjs) got a sentinel, never-verifiable
-- password_hash and needs a forced reset before they can sign in at all -- this column
-- lets the app distinguish "needs forced reset" from "chose not to reset yet" without
-- guessing from password_hash's own opaque value.
alter table public.users add column must_reset_password boolean not null default false;
