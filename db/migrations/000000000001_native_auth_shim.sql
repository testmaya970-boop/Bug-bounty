-- NATIVE-POSTGRES MIGRATION (new, not from supabase/migrations/): auth.uid()/auth.jwt()
-- compatibility shim. See db/migrations/README.md for the full migration-off-Supabase
-- rationale.
--
-- Every RLS policy and the vast majority of the ~256 SECURITY DEFINER functions in the
-- migrations that follow this one call auth.uid() (as an RLS predicate, or as
-- `declare actor uuid := auth.uid();`) and, in one file, auth.jwt() (for two claims:
-- session_id and aal). On Supabase, both are real functions provided by the platform
-- (GoTrue/PostgREST), reading PostgREST-injected `request.jwt.claims` GUCs that this app
-- never set itself. On vanilla Postgres neither exists at all.
--
-- Rather than rewrite ~230 call sites, this file recreates auth.uid()/auth.jwt() (and
-- auth.role(), unused today but kept for completeness) as thin wrappers around a single
-- app-owned GUC, app.current_claims, holding a JSON object shaped like a minimal JWT
-- claims set: {"sub": "<user-id>", "session_id": "<session-id>", "aal": "aal1"|"aal2",
-- "role": "authenticated"|"anon"|"service_role"}. lib/db/pool.ts's withActorTransaction
-- sets this GUC via `SET LOCAL` at the start of every request's transaction, immediately
-- after session validation -- SET LOCAL is scoped to that transaction only and is
-- guaranteed cleared on COMMIT/ROLLBACK, so a connection returned to the pool can never
-- leak one request's claims into the next request that reuses it (verified live: see the
-- migration plan's own note on this exact risk).
--
-- This means every RLS policy and function body below this migration in the sequence
-- survives completely unmodified -- the shim is the entire adaptation.

-- Postgres roles referenced by every GRANT/REVOKE/CREATE POLICY ... TO statement in the
-- migrations that follow. These are plain non-login roles here exactly as they are on
-- Supabase (PostgREST assumes them via role-switching; there is no PostgREST here, but
-- the app's own connection layer performs the equivalent `set role` after validating a
-- session -- see lib/db/pool.ts). service_role additionally bypasses RLS, matching
-- Supabase's own service_role, since it is used only by the app's trusted server-side
-- code paths (never reachable from a browser), identical to today's service-role-key use.
-- Created FIRST, before anything below grants on them.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.current_claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'role'
$$;

-- The application's own runtime login role (sentinel_app_runtime, created by
-- db/init/01-app-role.sql -- see that file's own comment for why this must NOT be the
-- migration-running/bootstrap role) must be able to become any of the three roles above
-- via `set role` -- grant membership rather than superuser, matching least-privilege.
-- Conditional on the role existing: a from-scratch schema build against a fresh
-- database created by something other than db/init/01-app-role.sql (e.g. a CI job that
-- provisions its own runtime role under a different name) should not fail here --
-- whatever process manages that role is responsible for this same grant in that case.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sentinel_app_runtime') then
    grant anon, authenticated, service_role to sentinel_app_runtime;
  end if;
end
$$;

-- On Supabase, the platform itself grants USAGE on the public schema to
-- anon/authenticated/service_role as part of its own provisioning (never expressed in
-- this app's own migrations -- 202608260002_data_api_table_grants.sql's own header
-- comment is explicit that only the missing table-level GRANTs were a real bug; schema
-- USAGE was already implicitly present). Vanilla Postgres has no such implicit grant, so
-- it must be established explicitly here, once, for the table/function-level GRANTs the
-- migrations that follow already contain to have any effect at all.
grant usage on schema public to anon, authenticated, service_role;
