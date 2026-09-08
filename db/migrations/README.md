# db/migrations

This directory replaces `supabase/migrations/` as the source of truth for the schema, as
part of migrating Sentinel off Supabase onto a standalone native PostgreSQL instance. See
the migration plan for full context and phasing.

## What's here

Every file from `supabase/migrations/` was copied here unchanged except where it relied
on something only Supabase's platform provides. Each such edit is marked inline with a
`-- NATIVE-POSTGRES MIGRATION EDIT` (or, for wholly new files, `-- NATIVE-POSTGRES
MIGRATION (new, not from supabase/migrations/)`) comment explaining exactly what changed
and why. Everything else — every RLS policy, nearly every SECURITY DEFINER function body,
every table/enum/constraint — is untouched.

The concrete adaptations, in the order they matter:

1. **`000000000001_native_auth_shim.sql`** (new, sorts first): recreates `auth.uid()`,
   `auth.jwt()`, `auth.role()` as thin wrappers around an app-owned GUC
   (`app.current_claims`, a JSON claims blob), plus the `anon`/`authenticated`/
   `service_role` Postgres roles PostgREST used to provide implicitly. This is what lets
   ~230 `auth.uid()` call sites and 31 RLS policies survive completely unmodified. See
   `lib/db/pool.ts`'s `withActorTransaction` for how the app sets this GUC per request,
   scoped via `SET LOCAL` so it can never leak across pooled connections.
2. **`202608250001_initial_identity_rbac.sql`**: `public.users` becomes the root identity
   table (gains `password_hash`, `email_verified_at`, its own `gen_random_uuid()`
   default) instead of FK'ing to Supabase Auth's `auth.users`. `pgcrypto` is installed
   into an explicit `extensions` schema (matching Supabase's own layout) so the many
   `extensions.digest(...)`/`extensions.pgp_sym_*(...)` call sites elsewhere need no
   changes.
3. **`202608260001_organization_membership_lifecycle.sql`**: the `after insert on
   auth.users` / `after update of email on auth.users` triggers are dropped (nothing
   inserts into `auth.users` anymore) and replaced with an explicit
   `public.create_user(...)` function, called directly by the signup code path in the
   same transaction. `202609010003_signup_identity_choice.sql`'s later
   username-choice logic is folded into this same function; that file is kept as an
   intentional no-op so the migration sequence/count stays stable and auditable.
4. **`202608270005_binary_evidence_storage.sql`**: the `insert into storage.buckets`
   (Supabase Storage's own control table) is dropped — bucket provisioning for the new
   S3-compatible backend happens outside SQL, via env vars.
5. **`202609020001_account_security_mfa_sessions.sql`**: a genuine rewrite, not a
   mechanical port. `auth.sessions`/`auth.mfa_factors`/`auth.aal_level` (Supabase
   Auth/GoTrue-owned) become new `public.sessions`/`public.mfa_factors`/
   `public.aal_level`, and MFA changes from TOTP to email-delivered OTP codes (a new
   `public.mfa_challenges` table) — a deliberate product decision, not a side effect of
   the platform migration. Functions that used to read `auth.jwt() ->> 'session_id'` now
   take `p_session_id` as an explicit parameter, since there's no more JWT for a claim to
   live on.
6. **`202609020003_settings_platform_expansion.sql`**: `deactivate_my_account` deletes
   from `public.sessions` instead of `auth.sessions`.
7. **`202609050001_ctf_server_verification_and_reputation.sql`**: ~29 bare `digest(...)`
   calls schema-qualified to `extensions.digest(...)` — these only worked on Supabase
   because its database-level default `search_path` includes `extensions`, a
   platform-specific default this migration silently relied on.

Two grants exist only because Supabase's platform provisions them implicitly and this
app's own migration history never had to state them: `grant usage on schema public/auth
to anon, authenticated, service_role` (in `000000000001_native_auth_shim.sql` and
`202608250001_initial_identity_rbac.sql` for the `extensions` schema). Confirmed missing
by testing against a fresh vanilla Postgres instance, not assumed.

## Running against a fresh database

```
DATABASE_URL=postgres://user:pass@host:port/db node scripts/run-native-migrations.mjs
```

Applies every `*.sql` file in filename order, each in its own transaction, matching the
original `supabase/migrations/` convention of no db-side migration-tracking table and
"apply in order." Intended for a fresh database (Phase 1 verification, CI, local dev
reset) — it is not an incremental migrator.

## Verifying against the original Supabase schema

After running the migrations, table/RLS-policy counts should match the live Supabase
instance except for three new tables (`sessions`, `mfa_factors`, `mfa_challenges`)
replacing the removed `auth.sessions`/`auth.mfa_factors`. Function signatures differ only
for the handful of functions listed in adaptation #5 above (lost their JWT-sourced
`session_id` claim, now an explicit parameter) plus `create_user` (new) replacing
`handle_new_auth_user`/`handle_auth_user_email_sync` (dropped). `scripts/
smoke-test-native.mjs` and `scripts/smoke-test-rls-isolation.mjs` exercise the shim and
RLS tenant-isolation live against a running instance.
