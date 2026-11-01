# Unpatched Backend Architecture Decision (paused/superseded)

Status: **Superseded before completion.** A subsequent task explicitly settled this question without needing the remaining sections: Unpatched stays on Supabase (Auth + PostgreSQL + RLS + Storage), no Clerk, no Neon. See `docs/decisions/0002-authentication-and-backend-boundary.md` for the decision actually recorded and acted on.

This document is left as-is, in the state it was in when superseded (repo audit, Phase 2 SQL audit, provider-boundary model, and migration matrix are complete and were genuinely useful research inputs; the Options A/B/C recommendation sections were never finished). It is kept for reference in case this question is ever reopened — the repo-native sections (§17–20) in particular remain accurate and were not invalidated by the decision.

~~This document is the deep analysis behind `docs/decisions/0002-backend-platform-decision.md`. That file has the final recommendation and is the one to read first; this one is where the evidence lives.~~ (That filename was never created; `0002` now refers to `docs/decisions/0002-authentication-and-backend-boundary.md` instead.)

---

## 1. Executive summary

*(Pending — written last, once the recommendation is final.)*

## 2. Current architecture

Unpatched is a Next.js 15 / React 19 / TypeScript App Router application on Supabase: Postgres for all authoritative data, Supabase Auth (GoTrue) for identity/sessions, and Row Level Security plus `SECURITY DEFINER` RPC functions for authorization. Deployment target is Vercel-compatible; there is no separate backend service. Phase 1 built identity/tenant/RBAC/audit scaffolding; Phase 2 built a complete organization-membership vertical slice (invite/accept/role-change/suspend/reactivate/remove, all through RPC, all audited). No file/object storage, realtime, or background-job infrastructure has been used yet — Storage and Realtime are provisioned by the platform but Unpatched has not written a line of code against either.

## 3. Unpatched requirements (what actually matters for this decision)

Derived from `SECURITY.md`, `DOMAIN.md`, and what Phase 2 already had to solve in practice, not generic SaaS requirements:

- **Tenant isolation is the single highest-stakes property.** A researcher's private report, or one organization's programs, must be structurally unreachable by another tenant — not just hidden in the UI. Phase 2 already required solving this at the database layer (RLS + RPC), not the application layer.
- **Confidential evidence** (reproduction steps, PoC files, screenshots) needs authorization-gated storage, not just authenticated storage — a valid session isn't enough, the session's *specific* authorization within a *specific* report/program must be checked before any byte is served.
- **A five-role, two-level authorization graph already exists** (organization role today; program/asset/report scoping is Phase 3+) and needs to keep working as it grows — see §8/§17.
- **Auditability of every sensitive mutation**, transactionally with the mutation itself — already a hard requirement Phase 2 met at the database level, not just from application code that could be bypassed.
- **Small team, AI-agent-assisted development.** Whatever is chosen needs to be debuggable and buildable by an agent working primarily from documentation and the existing codebase, not tribal knowledge of a specific platform's dashboard.
- **Pre-revenue / early-stage economics** matter now; the cost model in §14 has to be honest about that instead of only modeling steady-state scale.

## 4–6. Option A / B / C analysis

*(Pending research — see §7–16 for the evidence these sections will be built from.)*

## 7–16. Security / authorization / database / storage / realtime / DX / AI-agent-compatibility / cost / lock-in / migration-complexity comparisons

*(Pending research, except §8, completed below since it follows from the codebase rather than external documentation.)*

## 8. Authorization comparison — the provider-boundary model and why it mostly doesn't matter which option wins

### Provider-boundary diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│ IDENTITY — "who is this request from?"                              │
│   Option A: Supabase Auth (GoTrue)      Option B/C: Clerk           │
│   Owns: credentials, sessions, MFA, social/SSO                      │
│   Produces: a verified user id (auth.uid() / Clerk user id)         │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ verified user id only — no role, no
                                 │ permission, no organization claim is
                                 │ ever trusted from this layer
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DOMAIN AUTHORIZATION — "what can this user id do?" — UNPATCHED-OWNED │
│   Lives in: services/authorization.ts (TS mirror, fast/UI-facing)   │
│             + SECURITY DEFINER RPC functions (real enforcement)     │
│   Re-derives the actor from the identity layer's verified id on     │
│   every call; re-checks current membership/role state; never        │
│   trusts a client-supplied role, org id, or target id.               │
│   THIS LAYER IS IDENTICAL REGARDLESS OF OPTION A/B/C.                │
└───────────────────────────────┬───────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DATA INTEGRITY — Postgres itself (RLS, FKs, checks, enums)          │
│   Option A: Supabase-hosted Postgres    Option C: Neon Postgres     │
│   Defense in depth even if the layer above has a bug.                │
└─────────────────────────────────────────────────────────────────────┘
        ↓                                              ↓
┌──────────────────┐                          ┌──────────────────────┐
│ OBJECT STORAGE    │                          │ REALTIME (not yet    │
│ A: Supabase       │                          │ used in the code)    │
│ B/C: S3-compatible│                          │ A: Supabase Realtime │
└──────────────────┘                          │ B/C: build later     │
                                                └──────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ BACKGROUND WORK (not yet used) — A/B/C: Vercel cron/functions first,│
│ a dedicated Redis/queue worker only once a workload proves it can't │
│ safely complete in a request (per ARCHITECTURE.md's own rule)       │
└─────────────────────────────────────────────────────────────────────┘
```

### Why this diagram is the most important artifact in this document

Unpatched already made the one authorization decision that matters most, in Phase 2, before this spike started: **domain authorization is enforced in Unpatched's own `SECURITY DEFINER` Postgres functions, re-checked against `auth.uid()` on every call — not delegated to Supabase Auth's JWT claims, and (critically) not something that would be delegated to Clerk's Organizations/roles feature either.** `services/authorization.ts` and every RPC function in `202608260001_organization_membership_lifecycle.sql` contain zero business-authorization logic that lives *in* the identity provider. The identity provider's only job, in every option, is answering "who is this" — a much narrower, much more replaceable responsibility than "what can they do."

The practical consequence: the five-role → (future) program-role → asset-scope → report-access → attachment-access graph in the task's "Eighth" section is enforceable with **equal correctness** under Option A, B, or C, because it is not implemented by any of the three platforms — it is implemented by Unpatched, in Postgres, and Postgres is present (as real Postgres, not a compatible-ish substitute) in all three options. This *does not* mean the three options are equivalent overall — see §7 (security), §9 (database), and §16 (migration complexity) for where they genuinely differ — but it means the authorization-correctness question, which sounds like it should be the deciding factor, is actually close to a wash. What differs between the options is the *plumbing* the graph sits on top of (how the current user id gets into a form Postgres RLS can check — `auth.uid()` natively under Supabase, vs. a session variable Unpatched would have to set explicitly under Clerk+Neon or Clerk+Supabase-DB-only), not whether the graph itself can be correctly expressed.

One caveat, not yet resolved without the in-flight Clerk research: whether Clerk publishes (or the community has established) a clean, documented pattern for injecting a Clerk-verified user id into Postgres RLS as reliably as `auth.uid()` does today. If that pattern is well-established and low-risk, the authorization-correctness case for staying on Option A weakens further (since it wouldn't be trading away anything Unpatched actually uses). If it's fragile or under-documented, that becomes a concrete point against Option B/C, not a hand-wavy "vendor lock-in" argument. This will be resolved in §7/§9 once the Clerk and Neon research returns.

## 7. Migration matrix

*(Pending final option confirmation for the "Supabase → Clerk+Neon" column's storage/realtime rows, which depend on the Neon/S3 research; everything else below is complete from the repository audit in §17.)*

| Component | Supabase → Clerk+Supabase(DB) | Supabase → Clerk+Neon | Why |
|---|---|---|---|
| Authentication | **Moderate** | **Moderate** | `lib/auth/current-user.ts` is the only call site; its *return shape* (`AuthenticatedUser`) is already provider-agnostic, so every caller in `services/*` is unaffected. The work is entirely inside this one file plus a new account-provisioning path (webhook instead of DB trigger — see Users row). |
| Users | **Moderate** | **Moderate** | `handle_new_auth_user`/`handle_auth_user_email_sync` triggers on `auth.users` don't exist without GoTrue; replaced by a Clerk webhook handler that upserts into `public.users`. Same work in both columns since neither keeps GoTrue. |
| Organizations | **Easy** | **Easy** | Zero Supabase-specific code — `organizations` table and its columns are plain Postgres, unaffected by identity or DB-host changes. |
| Memberships | **Easy** | **Easy** | Same — `organization_members` is plain Postgres/PostgREST-agnostic schema. |
| Invitations | **Easy** | **Easy** | `services/invitations.ts` (token gen/hash) is pure Node `crypto`; the `organization_invitations` table and its constraints are plain Postgres. |
| Roles | **Easy** | **Easy** | `services/authorization.ts` has zero provider imports today; nothing to migrate. |
| Permissions (future program/asset/report graph) | **Easy** | **Easy** | Not built yet; whatever gets built will follow the same "Unpatched-owned, Postgres-enforced" pattern established in Phase 2 regardless of platform (§8). |
| RLS | **Hard** | **Hard** | Every policy and helper function calls `auth.uid()` directly (14 call sites) — this is GoTrue-specific. Both non-Supabase-Auth options require replacing every one of these with a session-variable-based equivalent (e.g., `current_setting('app.user_id', true)::uuid`), plus a mechanism to reliably `SET LOCAL` that variable on every pooled connection before any query runs — new infrastructure neither column has today. Identical difficulty in both columns since the DB host (Supabase-DB vs. Neon) doesn't change what RLS needs from the identity layer. |
| RPC functions | **Hard** | **Hard** | Same root cause as RLS — all 7 mutation functions and 3 helpers call `auth.uid()` as their very first statement. Rewriting them to read a session variable instead is mechanical but touches every function in the file. |
| Audit | **Easy** | **Easy** | `audit_logs` table and the insert statements inside each RPC function are plain Postgres; unaffected once the RPC functions themselves are updated (see RPC functions row — the audit-insert lines don't change, only the `actor` variable's source does). |
| Storage | **Moderate** | **Moderate** | Not used yet (§2) — starting fresh either way. Supabase Storage is not currently a sunk cost. See §11/§14 once storage-economics research returns for which is actually cheaper/simpler for evidence files. |
| Realtime | **Easy** | **Easy** | Not used yet — no migration, a greenfield choice either way. |
| Server Actions | **Easy** | **Easy** | `actions/organization-members.ts` calls `services/*`, never a Supabase type; the zod validation and `ActionResult<T>` pattern are fully provider-agnostic. |
| Environment variables | **Easy** | **Easy** | `lib/env.ts` is a 3-field zod schema; swapping it for Clerk/Neon variables is a same-shape change. |
| Tests | **Moderate** | **Moderate** | `tests/unit/organization-members-service.test.ts` mocks `@/lib/supabase/server` at the module boundary — the mocking *pattern* survives, but every mocked `rpc`/`from` call site needs updating to whatever the new DB access layer looks like (raw SQL client instead of PostgREST, most likely, if moving off Supabase's DB). |
| CI/CD | **Easy** | **Easy** | No Supabase-specific CI steps exist today beyond `npm run lint/typecheck/test/build`, none of which reference a provider. |
| Observability | **Easy** | **Easy** | None has been built yet (`ARCHITECTURE.md` lists it as deferred) — a greenfield choice either way, not a migration. |

**Reading the matrix**: the two genuinely hard rows (RLS, RPC functions) exist in *both* non-Supabase-Auth columns, for the identical reason (`auth.uid()`), and cost roughly the same regardless of whether the database itself stays on Supabase or moves to Neon. That means, contrary to what the three-option framing might suggest, **the DB-host choice (Supabase-DB vs. Neon) is nearly free to defer or change independently of the identity-provider choice** — it's `auth.uid()`, not the Postgres host, that drives nearly all of this migration's difficulty. This is a load-bearing finding for §11 (recommendation).

---

## 17. Repository audit — what's actually coupled to Supabase today

This is a precise accounting from reading `services/`, `actions/`, `lib/`, `types/`, `supabase/migrations/`, and `components/`, not a general impression.

### 17.1 What is currently coupled to Supabase

| File / area | Coupling | How deep |
|---|---|---|
| `lib/supabase/server.ts` | `@supabase/ssr`'s `createServerClient`, Next.js `cookies()` | Deep — this is the one place a Supabase client is constructed. Replacing the DB host (Neon) means rewriting this file entirely; replacing only Auth (Clerk, DB stays Supabase) means this file mostly survives, minus session cookie handling. |
| `lib/env.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Shallow — three env vars behind a zod schema. Trivial to change. |
| `lib/auth/current-user.ts` | `supabase.auth.getUser()` | Deep — this is Unpatched's only integration point with an identity provider. A Clerk swap rewrites this one file's *implementation*; every caller (`services/*`) only depends on its *return shape* (`AuthenticatedUser`), which is already provider-agnostic. This is the single most important seam in the codebase for this decision. |
| `supabase/migrations/*.sql` | `auth.users`, `auth.uid()`, Postgres enums/RLS/`SECURITY DEFINER` functions | `auth.uid()` and the `auth.users` schema are Supabase/GoTrue-specific — the two account-provisioning triggers (`handle_new_auth_user`, `handle_auth_user_email_sync`) fire `after insert/update on auth.users`, which does not exist on Neon or any Auth-less Postgres. Every RLS policy and RPC function calls `auth.uid()` directly (7 RPC functions, 3 helper functions, 4 RLS policies — 14 call sites). This is the largest single migration cost if the identity provider changes (see §17.3). |
| `services/organization-members.ts`, `services/organizations.ts` | `supabase.rpc(...)`, `supabase.from(...).select(...)` (PostgREST query builder, including relationship-embed syntax) | Moderate — the *shape* of these functions (typed inputs, typed outputs, thrown `OrganizationServiceError`) is provider-agnostic; the *implementation* (PostgREST client, `.rpc()` calls, embed syntax like `profile:users!user_id(...)`) is Supabase-specific. Neon has no PostgREST layer, so these would become raw SQL (via `pg`/`postgres.js`/an ORM) rather than a client-library swap. |
| `next.config.ts`, `middleware` | None found | No Supabase-specific Next.js config exists. |

### 17.2 What is provider-independent

- **All authorization *logic***: `services/authorization.ts` (role capability matrix, `canManageMembers`/`canChangeRoles`/`canGrantRole`, `isLastActiveOwner`, `describeRoleChangeImpact`) is pure TypeScript with zero Supabase imports. This is Unpatched-owned by construction already.
- **All domain types**: `types/auth.ts`, `types/organization.ts` — plain TypeScript, no provider types leak into them.
- **`services/invitations.ts`**: token generation/hashing is Node `crypto`, provider-agnostic.
- **`actions/organization-members.ts`**: zod validation and the `ActionResult<T>` discriminated-union pattern don't reference Supabase; they call the `services/*` functions, which are the actual seam.
- **Every UI component** (`components/organizations/*`, `components/ui/*`): consumes typed props (`OrganizationMemberRecord`, `OrganizationRole`, etc.), never a Supabase type or client, directly.
- **The RLS/RPC *design pattern* itself** — "authorization re-checked inside a `SECURITY DEFINER` function against `auth.uid()`, not trusted from the client" — is portable to *any* Postgres with *any* mechanism that can inject the current user id into a session variable the function can read (see §17.3).

### 17.3 What would be difficult to migrate

Ranked by actual difficulty, based on the coupling above:

1. **The 14 `auth.uid()` call sites and the two `auth.users` triggers.** This is Postgres-native GoTrue integration; nothing else provides it out of the box. Any non-Supabase identity provider (Clerk) requires replacing `auth.uid()` with an equivalent — typically `current_setting('request.jwt.claims', true)::json->>'sub'` populated by `SET LOCAL` at the start of each request/transaction, which is a well-established pattern but is *new infrastructure Unpatched doesn't have today* (something has to set that session variable on every request, on every DB connection, correctly, or every RLS policy silently fails open to "no user"). This is the crux of the entire migration-complexity question for Option B/C.
2. **`handle_new_auth_user` / `handle_auth_user_email_sync` triggers.** These are Supabase-specific by definition (they fire on `auth.users`, a GoTrue-owned table). A Clerk-based option replaces them with a webhook handler (`services/organizations.ts`-style provisioning driven by Clerk's `user.created` webhook) rather than a database trigger — a different mechanism, not a drop-in replacement, and it changes the trust model (webhook delivery reliability vs. a synchronous DB trigger that can never "miss").
3. **PostgREST embed syntax** (`profile:users!user_id(...)`) in `services/organization-members.ts` and `services/organizations.ts` — has no Neon equivalent; becomes hand-written SQL joins.
4. **Supabase-CLI-driven local dev and migrations** (`supabase/migrations/`, `supabase gen types`, `supabase start`) — Neon has its own CLI/branching workflow; not a large rewrite, but a full tooling swap, not a config change.

### 17.4 What should remain Unpatched-owned regardless of provider

- The entire authorization *decision* (who can do what) — already true today (`services/authorization.ts`, and every RPC function re-deriving and re-checking, never trusting a client claim). No option under consideration should be allowed to change this; specifically, **Clerk's own Organizations/roles feature should not become Unpatched's authorization system** even if Clerk is adopted for identity — see §8.
- The audit log and its transactional guarantee (mutation + audit row in one transaction).
- The domain data model (`organization_members`, `organization_invitations`, future `programs`/`reports`/etc.) — this is Unpatched's actual product, and needs to live in Postgres Unpatched controls the schema of, under any option.

### 17.5 Which current implementation choices should NOT survive a future migration, regardless of which option wins

- **Hardcoded duplication of the 7-day invitation expiry** between the SQL default (`expires_in_hours integer default 168`) and the client-side preview in `invite-member-dialog.tsx` — should become a single shared constant (env var or a value the server returns) before this pattern is repeated for more mutations.
- **`organizations` table's Phase 1 RLS policy was not updated in Phase 2** to exclude suspended/removed members (see §18.3) — a real, if low-severity, inconsistency that should be fixed regardless of which backend wins.
- **No generated database types anywhere** — `services/organization-members.ts` hand-writes row types and casts (`as unknown as MemberRow[]`) instead of using `supabase gen types typescript` (Supabase) or an equivalent for Neon. This is pure technical debt independent of the platform decision.

---

## 18. Phase 2 SQL migration audit (`202608260001_organization_membership_lifecycle.sql`)

**Not verified against a live PostgreSQL/Supabase environment** — see §19 for exactly why and what was attempted. Everything below is a careful static read, not an execution result.

### 18.1 What is correct and worth keeping as a pattern

- **Enum evolution via rename→create→cast→drop** (lines 28–43) is the standard safe Postgres pattern for changing an enum's value set inside one transaction; it correctly avoids `ALTER TYPE ... ADD VALUE`'s can't-use-in-same-transaction restriction, which does not apply here since this is a full type swap, not an addition.
- **`search_path = ''` on every new function**, with every table/type reference schema-qualified. Consistently applied across all 10 new functions — no exceptions found.
- **`plpgsql`, not `sql`, for the three RLS helper functions** (`is_org_member`, `has_org_role`, `shares_organization_with`) — chosen based on last session's research into a secondary source (a GitHub discussion and a blog post) claiming a plain `language sql` function is inlining-eligible and can lose its `SECURITY DEFINER` context. **This session's direct read of Supabase's own current RLS documentation complicates that claim**: Supabase's own canonical example for this exact recursion-avoiding pattern uses `language sql security definer set search_path = ''`, not `plpgsql`. Reconciling the two: Postgres's planner excludes `SECURITY DEFINER` functions from inlining categorically, regardless of language (this is a documented planner behavior, not a per-language distinction) — if that's correct, the secondary source's specific inlining concern may not actually apply to a `SECURITY DEFINER` function at all, and both `sql` and `plpgsql` would be equally safe here. Practically: `plpgsql` is never a planner-inlining candidate under any circumstance, so it is the strictly more conservative choice regardless of which reading of the `sql`-inlining question is correct — there is no scenario where `plpgsql` reintroduces the recursion that `sql` would have avoided. **This is flagged, not silently resolved**: it is exactly the kind of subtlety that needs a live-database check (§19/§20), and the honest position is "our choice is safe either way; the specific claim that motivated it may have been an overstatement of a real but narrower risk."
- **Row locking for the last-owner invariant** (`perform 1 from organization_members where ... role='owner' and status='active' for update`) before counting remaining owners, in `change_member_role`, `suspend_member`, and `remove_member` — this locks the full set of an organization's owner rows before any count is taken, so two concurrent demotions/removals against the same organization serialize against each other rather than racing. The logic is sound on inspection; it has not been exercised under real concurrency (§19).
- **Row locking for invitation acceptance** (`select * from organization_invitations where token_hash = ... for update`) — correctly closes the replay-race window: a second concurrent `accept` call for the same token blocks until the first transaction commits, then observes `accepted_at is not null` and fails cleanly, rather than both succeeding.
- **Audit row written in the same function invocation as the mutation** — atomic by construction (a single function call is one transaction), satisfying "every mutation produces its audit event transactionally" without needing an explicit application-level transaction wrapper.
- **Every one of the 10 new functions is explicitly `revoke all ... from public` then `grant execute ... to authenticated`.** This matters more than it looks: Postgres grants `EXECUTE` on a new function to `PUBLIC` by default, so an unrevoked `SECURITY DEFINER` function in the `public` schema is reachable by the `anon` role over PostgREST — an easy, easy-to-miss way to expose an unauthenticated write endpoint. Cross-checked against Supabase's own published RLS/authorization guidance (`supabase/agent-skills`, `security-rls-basics.md`), which calls this out as a specific, named risk and recommends exactly this revoke/grant pattern plus hard-coding an internal `auth.uid()` check (which every mutation function here also does, as its first statement). This is independent confirmation that the file already follows the platform owner's own stated best practice here, not a newly-found gap.

### 18.2 Real findings — not hypothetical, specific and actionable

1. **`organizations` table's RLS policy from Phase 1 was never updated for the new `status` column.** `"organizations read if member"` still reads `exists (select 1 from organization_members m where m.organization_id = organizations.id and m.user_id = auth.uid())` with no `status = 'active'` filter — unlike every *new* Phase 2 policy, which correctly requires active status via `is_org_member`/`has_org_role`. Net effect: a **suspended or removed** member can still read the organization's `name`/`slug` row (not membership rows, not invitations, not audit logs — those are correctly gated). Low severity (org identity isn't confidential the way a report is), but a genuine inconsistency, and exactly the kind of drift a security-focused audit should catch rather than wave through. **Recommend fixing before Phase 3**, either by adding `and m.status = 'active'` or replacing the policy body with `using (public.is_org_member(organizations.id))` for consistency with the rest of the file.
2. **`invite_organization_member`'s `exception when unique_violation` block wraps the entire function body**, not just the `insert into organization_invitations` statement that can actually raise it. In the current schema this is harmless (no other statement in the function can raise `unique_violation`), but it's broader than the intent, and a future edit that adds another insert to this function could get its unique-violation silently mislabeled as `INVITATION_PENDING`. Low risk today, worth tightening if the function grows.
3. **`organization_invitations.invited_by` is `not null references public.users(id) on delete restrict`**, while `organization_members.invited_by` is nullable with `on delete set null`. Because `public.users` cascades from `auth.users` (`on delete cascade`), deleting a user's Supabase Auth account who has *ever sent an invitation* will fail with a foreign-key violation from `organization_invitations`, even though no account-deletion flow exists yet to hit this. Flagging now so whoever builds account deletion knows this constraint exists and either needs a "reassign or delete pending invitations first" step, or a deliberate decision to keep `RESTRICT` (arguably correct — you don't want to lose the audit trail of who invited whom by silently nulling it on account deletion).
4. **The 7-day invitation-expiry default is duplicated** between the SQL function signature and the TypeScript UI preview (see §17.5) — not a security issue, a maintenance one.
5. **No explicit `else` in the Phase 1→Phase 2 role-mapping `case` expression** (line 36–40): if `role::text` were ever a value outside `'owner'/'manager'/'member'`, the cast produces `NULL`, and the `NOT NULL` constraint on `role` aborts the migration — a safe failure mode, but a generic constraint-violation error rather than a clear "unexpected role value" message. Cosmetic.

None of these five are severe enough to block using this migration; #1 is the only one worth a follow-up migration before Phase 3 regardless of which backend platform wins.

---

## 19. Live database verification — what was attempted and the exact result

Per the task's explicit instruction not to fabricate credentials: this environment has **no live Supabase or Postgres instance available**, confirmed by direct checks, not assumption:

- Supabase CLI **is** installed and runs (`npx supabase --version` → `2.115.0`).
- `npx supabase projects list` → `LegacyPlatformAuthRequiredError` — no `supabase login` has ever been run in this environment and there is no `SUPABASE_ACCESS_TOKEN`; there is no linked project (no `supabase/config.toml`).
- `docker --version` → not recognized. Supabase CLI's local development (`supabase start`) requires Docker to run its Postgres/GoTrue/PostgREST/Storage containers; without Docker, local Supabase cannot start.
- `psql --version` → not recognized, and no `psql`/`postgres` binary found on `PATH`. There is no standalone local Postgres to apply the migration against directly, either.
- No `.env.local` exists, and one was not fabricated.

**Result: zero live database verification was possible.** None of the following from the task's "Sixth" section were executed: RLS authorized/unauthorized-read tests, RPC mutation tests, concurrent last-owner tests, invitation valid/expired/revoked/replayed/wrong-identity tests, or transactional-audit-event verification. §18 above is a static code review only. This is the most important open item in this whole document — see §20.

---

## 20. What remains unverified

- **Everything in §19** — no RLS policy, RPC function, or trigger in the Phase 2 migration has ever executed against a real Postgres engine. The `plpgsql`/`SECURITY DEFINER`/`search_path=''` recursion-avoidance pattern is based on documented Postgres/Supabase community guidance (cross-checked in this and the prior turn's research), not on this file specifically running successfully.
- The account-provisioning triggers (`handle_new_auth_user`, `handle_auth_user_email_sync`) have never fired against a real `auth.users` insert/update.
- PostgREST's interpretation of the `profile:users!user_id(...)` embed hint syntax against this exact schema has never been confirmed by an actual query response.
- Whatever Options A/B/C sections of this document end up saying about Clerk/Neon behavior is bounded by what their own published documentation states, not by hands-on testing of either platform against Unpatched's schema.

---

## 21. Next action

Complete §1, §4–16 once the in-flight research (Supabase, Clerk, Neon, storage/reference-repo findings) returns, then write the recommendation in `docs/decisions/0002-backend-platform-decision.md`. Independent of that recommendation, §18.2 finding #1 (the `organizations` RLS gap) is a small, low-risk fix worth making before Phase 3 regardless of which backend platform is ultimately chosen.
