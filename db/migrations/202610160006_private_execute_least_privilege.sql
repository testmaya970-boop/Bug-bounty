-- Audit P3 (defense in depth), found again while building the authorization catalog check:
-- every function in the private schema kept PostgreSQL's default EXECUTE-to-PUBLIC grant, and
-- the authenticated role has USAGE on private (RLS policies need it). So any authenticated
-- database session able to run raw SQL could call private helpers directly -- including
-- private.decrypt_sensitive_field (KYC / payout details) and private.insert_report_message,
-- which trusts a caller-supplied report row. The app never exposes raw SQL, so this was not
-- reachable through it, but the database should not depend on that.
--
-- Now: nothing in private is executable by PUBLIC (today or for functions created later), and
-- authenticated gets back exactly the helpers its RLS policies call (computed from pg_policy,
-- column defaults and check constraints -- no public invoker function calls into private).
-- SECURITY DEFINER functions and trigger functions run as their owner and need no grant.

revoke execute on all functions in schema private from public;
alter default privileges in schema private revoke execute on functions from public;

grant execute on function
  private.has_org_role(uuid, public.organization_member_role[]),
  private.is_org_member(uuid),
  private.is_platform_admin(),
  private.is_program_member(uuid),
  private.is_program_triager(uuid),
  private.is_report_collaborator(uuid),
  private.is_invited_researcher_for_program(uuid),
  private.is_manager_or_admin_of_my_program(uuid),
  private.is_researcher_authorized_for_program(uuid),
  private.is_researcher_in_my_programs(uuid),
  private.shares_organization_with(uuid)
to authenticated;
