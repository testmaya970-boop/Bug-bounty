# 0001: Organization membership mutations go through authenticated-role RPC functions, not a service-role client

Date: 2026-08-26
Status: Accepted

## Context

Phase 1's `organization_members` migration left a comment that writes to organization
membership, roles, organizations, and audit logs were "service-only initially" — implying
mutations would go through a server-side Supabase client using the `SUPABASE_SERVICE_ROLE_KEY`,
which bypasses Row Level Security entirely. `SECURITY.md` requires that key be minimized and
isolated, and `README.md` already flags it as bypassing RLS.

Phase 2 needed to implement seven membership mutations (invite, accept, cancel, change role,
suspend, reactivate, remove), each with authorization rules and a last-active-owner invariant
that must hold under concurrent requests.

## Decision

Every mutation is a single `SECURITY DEFINER` Postgres function (`plpgsql`, `search_path = ''`,
schema-qualified names throughout) granted `EXECUTE` only to the `authenticated` role. Each
function re-derives the acting user from `auth.uid()` — never from a client-supplied id — and
re-checks the actor's current membership/role against the database before writing anything. The
last-active-owner check locks the organization's owner rows (`for update`) before counting, so
two concurrent demotions/removals cannot both succeed. Application code (`services/organization-members.ts`)
calls these through the ordinary request-scoped, cookie-authenticated Supabase client — the
service-role key is not used anywhere in this slice.

Reads (listing members, invitations, audit activity) still go through RLS policies, using
`SECURITY DEFINER` helper functions (`is_org_member`, `has_org_role`, `shares_organization_with`)
to avoid Postgres's "infinite recursion detected in policy" error that a naive self-referencing
policy on `organization_members` would hit.

## Consequences

- The service-role key stays unused for this entire feature, directly satisfying `SECURITY.md`'s
  minimization requirement — there is less to isolate and less blast radius if it ever leaked.
- Authorization is enforced in exactly one place per mutation (the function), checked against
  live state at call time, rather than trusted from whatever the application layer computed
  moments earlier — closing the gap a check-then-act race could otherwise open.
- The trade-off: business logic that would otherwise live in TypeScript now lives in `plpgsql`,
  which is less familiar to most contributors and harder to unit-test directly (see `AGENTS.md`'s
  testing note on this — these functions are reviewed carefully but not yet exercised against a
  live database in this environment). `services/authorization.ts` mirrors the same rules in
  TypeScript for UI copy and fast client-side checks, which introduces a duplication the two
  layers must be kept in sync deliberately, by design (defense in depth), not by accident.
- Every function is written defensively assuming its authorization check is the one that
  matters, on the theory that a UI-layer mistake should degrade to a clear, safe server error
  rather than a silent authorization bypass.
