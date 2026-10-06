-- Runs once, automatically, on first container startup (docker-entrypoint-initdb.d).
-- Creates the role the application actually connects as (DATABASE_URL) -- a plain
-- login role with NO superuser/BYPASSRLS privileges, so RLS is genuinely enforced for
-- every query this role runs, exactly as it would be against a real production Postgres
-- instance. It becomes `authenticated`/`anon`/`service_role` only via an explicit
-- `SET ROLE` per transaction (see lib/db/pool.ts's setActorClaims), never automatically.
--
-- The bootstrap superuser (POSTGRES_USER, sentinel_app) still owns every table/schema
-- (migrations run as that role) -- RLS does not apply to a table's owner by default
-- either, but that role is never the one the app connects as, so this is moot for the
-- app's own queries.
create role sentinel_app_runtime with login password 'sentinel_dev_password';
grant connect on database sentinel to sentinel_app_runtime;

-- Local dev only: the KYC/payout field encryption key (202610050002 fails closed without
-- one). This is the same public dev string earlier migrations used as a silent fallback,
-- so existing dev rows stay decryptable. Production sets its own secret and boot refuses
-- this value (lib/startup-check.ts).
alter database sentinel set app.settings.kyc_encryption_key = 'sentinel-local-dev-only-insecure-key-do-not-use-in-production';
