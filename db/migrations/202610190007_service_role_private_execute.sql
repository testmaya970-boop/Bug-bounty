-- Fixes a regression from 202610160006. Revoking EXECUTE on private functions from PUBLIC was
-- right for authenticated sessions, but the server's own service_role also relied on that
-- PUBLIC grant: public.complete_outbox_event (run by the outbox worker as service_role, not
-- SECURITY DEFINER) calls private.outbox_backoff_seconds, so a failed event could no longer be
-- rescheduled ("permission denied for function outbox_backoff_seconds", seen live) and stayed
-- stuck in processing until its lease expired. 104 of 109 private functions were affected.
--
-- service_role is the server itself: it bypasses RLS and already has full table access, so
-- executing private helpers adds nothing an attacker without it could use. Authenticated
-- sessions keep only the 11 RLS helpers from 202610160006. scripts/check-authz-catalog.mjs now
-- also fails if service_role cannot execute any private function.
grant execute on all functions in schema private to service_role;
alter default privileges for role sentinel_app grant execute on functions to service_role;
