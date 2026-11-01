-- 202610210001 left submission_restrictions without a service_role grant, so server-only
-- callers (the E2E seed resetting its flagged researcher, future workers) were refused.
grant select, insert, update on public.submission_restrictions to service_role;
