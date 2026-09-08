# 0002: Supabase remains the backend foundation; authentication is built directly on Supabase Auth

Date: 2026-08-26
Status: Accepted

## Context

A separate architecture spike (research into Supabase, Clerk, and Neon — see `docs/architecture/backend-decision.md`, left in draft since this decision superseded it) was underway when this task explicitly settled the question: Sentinel's backend stays Next.js + Supabase Auth + Supabase PostgreSQL + Supabase RLS + Supabase Storage, domain authorization stays inside Sentinel/Postgres, and no new provider (Clerk, Neon) is introduced. That spike's own repository audit had already found the load-bearing fact that makes this an easy decision to accept rather than defer: `services/authorization.ts` and every `SECURITY DEFINER` RPC function in `supabase/migrations/202608260001_organization_membership_lifecycle.sql` implement Sentinel's authorization graph independently of the identity provider — `auth.uid()` is the only place Supabase Auth specifically is threaded through, and it appears in exactly one non-database file, `lib/auth/current-user.ts`. Switching identity providers later, if ever warranted, remains a bounded, well-understood change; it is not a reason to delay building an authentication foundation now.

This task also required auditing the Phase 2 migration specifically for `SECURITY DEFINER` exposure risk, independent of the platform question.

## Security finding discovered during this review

`is_org_member`, `has_org_role`, and `shares_organization_with` — the three RLS-recursion-breaking helper functions added in Phase 2 — were created in the `public` schema. Supabase's Data API exposes every function in `public` (and `graphql_public`) as a callable RPC endpoint (`/rest/v1/rpc/<function>`), gated only by `GRANT EXECUTE`. Because `EXECUTE` had to be granted to `authenticated` for RLS policy evaluation to work at all, any authenticated Sentinel user — not just organization members — could call these functions directly with an arbitrary `organization_id`/`user_id` and receive a real answer, since each function is `SECURITY DEFINER` and therefore reads `organization_members` bypassing that table's own RLS. This is an information-disclosure gap (membership/role/co-membership existence oracle), not a mutation or privilege-escalation risk — all three functions are read-only. Full detail, including the answer to each of the nine questions this task asked, is in `docs/security/phase-2-rpc-review.md`.

## How the boundary was corrected

All three functions were moved to a new `private` schema (`create schema if not exists private`), which is not listed in `supabase/config.toml`'s `[api] schemas = ["public", "graphql_public"]` and is therefore never routed to by PostgREST, regardless of grants. `authenticated` retains `USAGE` on `private` and `EXECUTE` on the three functions, because RLS policy evaluation genuinely requires it — the fix is schema exposure, not grants, which is exactly why grant-only hardening was insufficient in the first place. Every internal call site (four RLS policies, plus `invite_organization_member` and `cancel_organization_invitation`) was updated from `public.<fn>` to `private.<fn>`. The seven mutation RPCs remain in `public` deliberately: they are the intended API surface, and each independently re-derives and re-checks authorization from `auth.uid()`.

One related, lower-severity gap found in the same pass and fixed alongside it: Phase 1's `"organizations read if member"` RLS policy predated the `status` column and never excluded suspended/removed members from reading the organization row. It now uses `private.is_org_member(id)`, consistent with every other Phase 2 policy.

## What remains Sentinel-owned

- The entire authorization decision graph: role capabilities (`services/authorization.ts`), last-active-owner enforcement, invitation validity rules, and every mutation's authorization check (re-derived from `auth.uid()` inside each `SECURITY DEFINER` function, never trusted from a client parameter).
- The audit log and its transactional guarantee.
- The domain data model (`organization_members`, `organization_invitations`, and whatever Phase 3 adds).
- The `AuthenticatedUser` shape returned by `lib/auth/current-user.ts` (`id`, `platformRole`, `username`, `displayName`, `email`) — Sentinel's own profile fields (`public.users`), not a mirror of Supabase's internal auth user object.

## What remains Supabase-owned

- Credential storage, password hashing, session/JWT issuance and refresh, and email delivery for signup confirmation — all via Supabase Auth (`auth.users`, GoTrue).
- `auth.uid()` as the mechanism by which Postgres RLS and the RPC functions learn who the caller is.
- Account provisioning is a thin bridge between the two: the `handle_new_auth_user`/`handle_auth_user_email_sync` triggers (added in Phase 2) create and sync `public.users` from `auth.users`, so Sentinel's own domain tables never need to reach into the `auth` schema directly.

## Migration portability considerations (recorded, not acted on)

Every `auth.uid()` call site (14, across 3 helper functions, 7 mutation RPCs, and 4 RLS policies) is the actual coupling point to Supabase specifically, not the database engine or the application code above it. `services/authorization.ts`, all domain types, every UI component, and `actions/organization-members.ts` have zero Supabase imports today. If this decision is ever revisited, that recorded fact — not a fresh audit — is the starting point. No action is taken on this now; it is out of scope for this task and the decision above is not contingent on it.

## Update 2026-08-26: live database verification completed

The "not verified against a live database" risk below was accurate when this ADR was first written. Docker subsequently became available in this environment, and a full verification pass ran against a real local Supabase stack (`supabase start` + `supabase db reset`, all three migrations — including a new `202608260002_data_api_table_grants.sql` — applying cleanly from an empty database). This found and fixed two real bugs neither prior review caught:

1. **No base table grants existed for `authenticated`** (`GRANT SELECT` was simply never run on any table in either migration) — RLS was correctly configured but unreachable, so every read failed closed with `403` regardless of whether RLS would have allowed it. This would have affected any newly created hosted Supabase project too, not just local dev, since the auto-grant behavior it depended on is off by default on current projects.
2. **`remove_member` didn't clear `suspended_at`** when removing a currently-suspended member, violating a check constraint.

With both fixed, live testing confirmed: the direct-attack finding above (HTTP 404 from the client-facing API), full cross-tenant isolation, the complete five-role capability matrix, suspended/removed visibility, a genuine two-transaction concurrency test proving the last-owner invariant holds under real contention, all invitation edge cases (valid/expired/revoked/replay/wrong-identity), token-hash-only storage, and audit-mutation atomicity including an explicit rollback test. Real `Database` types were generated via `supabase gen types typescript --local` and wired into `lib/supabase/server.ts` and `services/organization-members.ts`, replacing several hand-written row types. A real Playwright browser test exercised the full authentication foundation end to end (sign-up → session → protected route → sign-out → rejected, plus wrong-password and open-redirect-protection cases) against the running Next.js dev server. Full detail is in `docs/security/phase-2-rpc-review.md`'s "DATABASE VERIFIED" section and this verification pass's engineering report.

## Unresolved risks

- **A hosted project's Dashboard API settings must independently match `supabase/config.toml`'s exposed-schema list.** The config file governs local dev and `supabase db push`; a hosted project's Data API exposure is a separate setting that must be confirmed manually against this same allowlist before this fix is meaningful in production. Not yet tested against any hosted project — only local.
- **No organization-creation flow exists.** A freshly signed-up user has nothing to do beyond seeing an empty organizations list, confirmed directly in the live browser test. This remains a deliberate scope decision — authentication itself is fully usable and demonstrable without it.
- **Load/scale behavior under production-level concurrency is untested.** The concurrency test used two simultaneous requests, proving the row-locking mechanism is correct, not its behavior under high contention.
