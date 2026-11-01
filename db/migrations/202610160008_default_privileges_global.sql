-- 202610160006 and 202610160007 tried to stop new functions from being executable by PUBLIC
-- with `alter default privileges IN SCHEMA ... revoke`, which PostgreSQL ignores: per-schema
-- default privileges can only add to the built-in global defaults, never remove from them
-- (pg_default_acl stayed empty). The global form, for the role that runs migrations and owns
-- every function, does remove it. From here on, a new function in any schema is executable only
-- by what its migration explicitly grants (fail closed); `npm run check:authz` guards the rest.
alter default privileges for role sentinel_app revoke execute on functions from public;
