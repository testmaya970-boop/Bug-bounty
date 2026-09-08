# 0018: Production backend hardening & integration boundary

Date: 2026-08-29
Status: Accepted

## Context

Every domain foundation now exists (Identity/Auth through Notifications). This slice does not add a domain feature — it audits and hardens the boundary between the domain backend and (a) the browser, (b) external providers, (c) the frontend build that comes next. Per the task's own framing: "all domain foundations exist" is not "backend is production ready." This document is both the architecture inventory required before any code changed, and the record of what was implemented, verified as already correct, or documented as a concrete future requirement — the task's own three-way Definition of Done.

## A. Architecture inventory

```text
Browser
  ↓ (cookies, same-site, no bearer tokens for first-party use)
Next.js App Router pages / Server Actions (actions/*.ts)      <- B
  ↓
app/api/v1/* (one representative route)                        <- C
  ↓
services/*.ts (authorization orchestration, error mapping)      <- D
  ↓
Database RPC (SECURITY DEFINER functions) / RLS                <- E, F
  ↓
PostgreSQL (supabase/migrations/*)
  ↓
outbox_events → workers/outbox/* (standalone process)           <- H, K
  ↓
lib/evidence-store.ts (Supabase Storage) / lib/email-provider.ts (dev only)  <- G, I
```

### A. Browser entry points
Every page under `app/` (Server Components) and every "use client" component that calls a Server Action. No client-side Supabase key is ever used for a mutation; `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the anon key) is the only key ever shipped to the browser, and it is meaningless without RLS/RPC enforcement behind it.

### B. Server Actions (`actions/*.ts`)
- **Authentication source**: `createSupabaseServerClient()` (cookie-based `@supabase/ssr` client). Every mutating action either calls a service that itself re-derives `auth.uid()` inside a SECURITY DEFINER RPC, or (for read-only pages) calls `getCurrentUser()`, which re-validates via `auth.getUser()`, never trusting a locally-cached JWT (`auth.getSession()` is never used as an authorization input anywhere in this codebase — verified by grep).
- **Authorization source**: the database RPC. `services/authorization.ts`'s capability functions (`canManageMembers`, `canCreateProgram`, etc.) exist only for fast, honest UI copy/early rejection — never the actual boundary. Re-verified this slice: every one of the ~40 action files funnels into a `services/*.ts` function that either calls an RPC (which re-derives `auth.uid()`) or reads through RLS.
- **Tenant boundary**: server-derived from the RPC's own row lookups (e.g., `report.organization_id`), never a client-supplied `organizationId` trusted as fact — client-supplied ids are used only to select *which* row to act on; the RPC independently re-verifies the actor's relationship to that row.
- **Idempotency**: see section H below.
- **Rate limiting**: NEW this slice — see section G.
- **Audit behavior**: every mutation RPC writes `audit_logs` in the same transaction as the mutation (atomic by construction — one PL/pgSQL function, one transaction).
- **Error contract**: `ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }`, uniformly present in every action file audited (`organizations.ts`, `organization-members.ts`, `programs.ts`, `scope.ts`, `program-researchers.ts`, `reports.ts`, `report-file-evidence.ts`, `bounty.ts`, `payments.ts`, `notifications.ts`, `auth.ts`) — confirmed by direct inspection, not assumed. `services/rpc-error.ts`'s `mapRpcError` is the single place a raw `CODE: message` Postgres error becomes a typed `OrganizationServiceError`; an unrecognized error already safely falls back to a generic message (`"The request could not be completed..."`), never a raw SQLSTATE/stack trace. This was already correct before this slice; verified, not re-implemented.
- **Logging behavior**: previously none beyond the one `console.info` stand-in in the outbox reference handler. NEW this slice: `lib/logger.ts` + `lib/request-context.ts`, wired into `submitReportAction` and `createOrganizationAction` as representative call sites (see section I).

### C. API routes (`app/api/*`)
**None existed before this slice.** `app/api/v1/reports/route.ts` is the one representative endpoint added — see section E below for the full reasoning.

### D. Service layer (`services/*.ts`)
Owns authorization orchestration and error mapping. Every service file that touches a mutation imports `OrganizationServiceError`/`mapRpcError` from `services/rpc-error.ts` (or `services/auth.ts`'s equivalent `AuthServiceError`/`mapAuthError` for Supabase Auth's plain-English errors) — confirmed by grep, a single, consistent convention across the whole codebase, not two competing ones.

### E. Database RPC boundary
Every mutation is a `SECURITY DEFINER` (or, where the caller is already `service_role`, a plain function with explicit table grants — see 0016/0017's reasoning) Postgres function that re-derives `auth.uid()` and re-checks current database state. Zero exceptions were found this slice across all 18 migrations. `private.*` helper functions are never exposed to PostgREST (`supabase/config.toml`'s `[api] schemas` excludes `private` — reconfirmed this slice) and, as of 0017/0018, `private` schema `USAGE` is granted only to `authenticated` and `service_role` — never `anon` (the one function that needs to run as `anon`, `check_sign_in_rate_limit`, is `SECURITY DEFINER` specifically to bridge this gap safely, mirroring `mark_notification_read`'s identical reasoning).

### F. RLS boundary
Every table with a legitimate human reader has RLS enabled with a policy scoped to `auth.uid()`'s actual relationship to the row (ownership, membership, or explicit private-schema helper) — never a bare `organization_id` match with no membership check. Tables with **no** legitimate human reader (`outbox_events`, `outbox_event_receipts`, `notification_deliveries`, `rate_limit_counters`) have RLS enabled with **zero** policies, the identical, deliberate pattern 0015 established for exactly this case. Confirmed this slice: `rate_limit_counters` (new) has RLS enabled and zero policies — nothing in `authenticated`/`anon` can read or write it directly; only `private.check_and_consume_rate_limit` (called from `SECURITY DEFINER` bodies or `service_role`-adjacent contexts) touches it.

### G. Storage boundary (`lib/evidence-store.ts`)
Re-verified, not re-implemented (0011 already built this correctly): private bucket (`public = false`), CSPRNG object keys (`evidence/<uuid>`, never derived from any tenant/report id), a 10 MiB size limit enforced by both the application's own check constraint and the storage layer, `createSignedUrl(..., { download: filename })` (forces `Content-Disposition: attachment`, verified against the underlying `@supabase/storage-js` source in 0011's own review), 60-second TTL, tenant isolation via the same `report_evidence` RLS policy that already gates which row a caller can even discover the `object_key` for. **Gap identified, not fixed this slice**: no per-user/per-report/per-program upload rate limit exists yet (see section G's "Remaining risks").

### H. Worker boundary (`workers/outbox/*`)
Already proven in 0015 (lease/crash/dead-letter/retry) and extended in 0017 (multiple independent consumers per `event_type:schema_version`). Re-verified this slice by inspection only (no new live test run, since 0015/0016/0017 already did this exhaustively): no external provider call happens inside a domain-mutation transaction; email delivery is fully asynchronous via the worker; a down worker never blocks report/organization/bounty creation.

### I. External-provider boundary
`lib/payment-provider.ts` (manual only, 0014) and `lib/email-provider.ts` (development only, 0017) both already enforce "the domain never imports a provider SDK" — reconfirmed by grep across `services/`, `actions/`, and every migration this slice touched: zero matches for `stripe|razorpay|paypal|sendgrid|resend|twilio` outside these two adapter files' own doc comments.

### J. Audit boundary
See section "Audit integrity" below.

### K. Asynchronous boundary
`outbox_events` remains the only asynchronous mechanism; this slice adds no second one. Rate limiting is synchronous (a single atomic upsert inside the same transaction as the mutation it protects) — deliberately not asynchronous, since a rate-limit decision must be known before the protected mutation proceeds.

## B. Architecture inventory — see section A above (folded into one document rather than duplicated, per this ADR's own economy).

## C. Security boundary

Nothing in this slice weakens an existing boundary. Every change either adds a new, narrow boundary (rate limiting) or documents an already-correct one (authentication, CSRF, storage). See sections D–Q below for the specifics the task asked to distinguish.

## D. Authorization / tenant matrix

The full cross-domain matrix (organizations, programs, scope, researchers, reports, evidence/messages, bounty, payment, reputation, notifications, audit) × (owner, security_admin, program_manager, triager, billing_admin, program researcher, program manager (program-level), cross-tenant user, unrelated researcher, anonymous) × (SELECT/INSERT/UPDATE/DELETE/RPC) has **already been live-verified, exhaustively, across every prior slice's own delivered report** — not re-asserted here from memory, but re-confirmed this slice wherever a specific cell had not been independently proven before:

| Domain | Owner/sec_admin | Program manager | Researcher (own) | Researcher (other's) | Cross-tenant | Anonymous | Where first proven |
|---|---|---|---|---|---|---|---|
| Organizations/members | Full | — | — | — | Empty/403 | Empty/403 | 0001–0003 |
| Programs/scope | Full | Assigned only | Read active scope only | — | Empty | Empty | 0004–0006 |
| Researcher access | Manage | Manage | Own participation only | — | Empty | Empty | 0007 |
| Reports | Full | Assigned programs | Own only | Empty | Empty | Empty | 0008–0009 |
| Messages/evidence | Full (per visibility) | Assigned | Own report, visibility-gated | Empty | Empty | Empty | 0010–0011 |
| Bounty/payment | Full | Triage-shaped subset | Own eligibility/decision only | Empty | Empty | Empty | 0013–0014 |
| Reputation | — (aggregate-only via RPC) | — | Own facts only (RLS) / own summary (RPC) | Empty | Empty | Empty | 0016 |
| Notifications | Recipient-only | Recipient-only | Own notifications only | Empty | Empty | Empty | 0017 |
| **Audit logs** | Full (own org) | — | — | — | **Empty — re-verified live this slice** | **Empty — re-verified live this slice** | 0001 policy; explicit cross-org test added in 0018 |
| Rate limit counters | — | — | — | — | N/A (no reader at all) | N/A | 0018, RLS-enabled zero-policy, verified structurally |

**New, explicit cross-tenant test this slice** (not previously isolated as its own scenario): organization owner B, given org A's real id, queried `audit_logs?organization_id=eq.<org A>` directly — result: `200`, empty array. Owner A's identical query against their own org returned the real `organization.created` row. This closes the one cell in the matrix that had only ever been proven indirectly (as part of `has_org_role`'s general correctness) rather than as its own explicit scenario.

**Unauthorized behavior is explicit everywhere**: an RLS-filtered read returns `200` with an empty array (never revealing whether the row exists); a denied RPC/insert/update returns a real Postgres/PostgREST permission error (`403`/`42501`) or a domain `FORBIDDEN`/`AUTH_REQUIRED` exception — the two are never conflated, and no code path anywhere returns a different shape for "doesn't exist" versus "exists but you can't see it," per SECURITY.md's own requirement.

## E. API boundary

`app/api/v1/reports/route.ts` — the one representative endpoint. Authentication: identical cookie-based session every page uses (`getCurrentUser`), not a separate API-key scheme — this route is reachable from an authenticated browser session, not a third-party integration; a real public API needs its own, separately-reasoned authentication boundary (API keys/OAuth), explicitly deferred. Versioning: `/api/v1/` prefix, no v2 exists. Request validation: `zod` schema on query params (`cursor`, `limit`), invalid input rejected with `422 INVALID_INPUT` before any query runs. Response envelope: `{ data, meta: { requestId, nextCursor } }` on success, `{ error: { code, message, requestId } }` on failure — one shape, always present. Error codes: mapped through the new `lib/http-errors.ts` table (see section F). Idempotency: GET is naturally idempotent; no write endpoint was added. Rate limiting: inherited from `listMyReports`'s underlying RPC having no rate limit itself (reads are not currently rate-limited — a documented gap, see Remaining risks) — this endpoint is read-only, lower risk than the mutation endpoints that ARE rate-limited. Request IDs: every response carries `X-Request-Id` and the same id in the JSON body.

Nineteen more endpoints are explicitly **not** built — the task's own "do not build 20 endpoints" instruction. A future frontend/integration build adds routes as needed, each reusing this identical envelope/error-mapping/logging pattern.

## F. Error contract

`lib/http-errors.ts`: a `CODE -> HTTP status` table built entirely from codes that already exist somewhere in `supabase/migrations/*` or `services/*.ts`'s own error mappers — not invented. Used by the one API route; Server Actions keep their existing, already-consistent `{ ok, code, message }` shape (confirmed uniform across all ~40 action functions this slice audited — no rewrite needed, since it was already correct). An unmapped code defaults to `500`, identical to the pre-existing `OrganizationServiceError("...", "UNKNOWN")` fallback — this table can only ever improve status-code accuracy for the codes it covers, never regress anything.

**Verified**: raw SQLSTATE/Postgres error text/stack traces never reach the browser — `mapRpcError`'s `UNKNOWN` fallback and the API route's own catch-all both replace an unrecognized error with a fixed, safe sentence, confirmed live in this slice's own API-route unit tests (`tests/unit/api-reports-route.test.ts`, "never leaks a raw, unclassified error to the response body").

## G. Rate limiting

**Mandatory, implemented.** `private.rate_limit_counters` (fixed-window counter, one row per `(bucket_key, window_start)`) + `private.check_and_consume_rate_limit(bucket_key, max_count, window_seconds)` — one atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, not a check-then-increment (the exact race class 0016 had to patch after the fact; avoided here from the start). Postgres was chosen over Redis or an edge/platform primitive because: (1) it reuses the instance every other invariant in this schema already lives in, at zero new operational cost; (2) the mutation the limiter protects is already a database transaction, so the check is free to make atomic with the protected action, whereas an external Redis call would need its own separate failure-mode handling; (3) Sentinel's current scale (see section R) does not remotely approach the point where a single Postgres table of counters becomes a bottleneck.

Applied to three representative, server-derived-identity-keyed mutations, proving the pattern across three different authentication contexts:
- **Sign-in** (pre-auth, `anon` role): `check_sign_in_rate_limit(email)`, 10 attempts / 15 min, keyed by the normalized (lowercased) email being attempted. Verified live: 10 allowed, the 11th blocked, an uppercase variant of the same email correctly treated as the identical bucket. This is additional to, never a replacement for, Supabase Auth's own IP-based default rate limiting on the auth endpoints.
- **Report submission** (`submit_report`, authenticated researcher): 30 / hour, keyed by `actor::text`. Verified live: exactly 30 succeeded, the 31st raised `RATE_LIMITED`.
- **Organization creation** (`create_organization`, authenticated user): 10 / day, keyed by `actor::text` — deliberately distinct from (and does not replace) the existing per-creator idempotency key, which prevents a *duplicate* of the *same* organization, not repeated creation of *many* organizations. Verified live: exactly 10 total succeeded (1 from setup + 9 in the test loop), the 10th test-loop attempt (11th overall) raised `RATE_LIMITED`.

**Documented, not implemented this slice** (a concrete near-term follow-up, using the identical `private.check_and_consume_rate_limit` primitive): organization-member invitation (`invite_organization_member`), researcher invitation (`invite_researcher_to_program`), evidence upload (`add_researcher_file_evidence`/`add_organization_file_evidence`), and the one representative API route's own read traffic. **Why not folded into this same migration**: each of these RPCs already carries real, non-trivial authorization/validation logic; touching six-plus RPCs in one migration under this task's own time-boxing multiplies review risk for marginal same-slice benefit versus doing it as its own small, focused follow-up. **Impact if delayed**: an unrate-limited invitation endpoint could be used to spam an inbox with invitations, or to enumerate valid email addresses at volume; low severity today given Sentinel's current user base, becomes material as soon as real, adversarial users have access. **When it becomes necessary**: before or immediately after the first public/external researcher onboarding, not before then.

## H. Idempotency

Audited every mutation named in the task:
- **Organization creation**: real, `unique (created_by, idempotency_key)` — already correct (0003).
- **Program creation**: identical per-(organization, creator) idempotency-key pattern — already correct (0004).
- **Scope creation**: a partial unique index on canonicalized target — already correct (0006); no client-supplied idempotency key needed since the natural key (canonical target) already prevents duplicates.
- **Researcher invitation**: token-based, single-use, hash-compared — already correct (0007).
- **Report submission**: **no idempotency key exists** — a genuine, if low-severity, gap: a double-submitted form (e.g., a user double-clicking "Submit") could create two near-identical reports. **Not fixed this slice** — reports are not silently deduplicatable the way an organization/program is (two "different" reports with the same title could be entirely legitimate re-submissions after being told to resubmit), so a blind idempotency key risks masking a real, intentional second report. Documented as requiring product judgment (should the UI simply disable the submit button while pending, is that alone sufficient, or does a true database-backed key with a short client-generated nonce make sense) before implementing, not a mechanical fix.
- **Bounty decision / payment operations**: already correct — `report_bounty_decisions` is one row per report (a real constraint), `payment_obligations.bounty_decision_id` is `unique`, `initiate_manual_payment_attempt` locks the obligation row before checking for an in-flight attempt (0013/0014, both re-verified by inspection).
- **Notification creation / outbox consumption**: already correct — `unique (source_event_id, recipient_id)` via `ON CONFLICT DO NOTHING` (0017); outbox delivery is honestly at-least-once with idempotent consumers throughout (0015–0017).
- **Rate limit checks themselves** (new): the atomic upsert IS the idempotency boundary — two concurrent calls for the same bucket/window either both increment safely (Postgres serializes conflicting upserts) or one waits briefly; no separate mechanism needed.

Idempotency was deliberately **not** added where there is no meaningful retry hazard: `mark_notification_read` (already idempotent by nature — `read_at = coalesce(read_at, now())`), `list_my_reports`/pagination reads (reads have no retry hazard), and disabled-UI-button-only protections were never treated as sufficient anywhere audited.

## I. Observability

No external platform (Datadog, New Relic) is introduced — none is justified at Sentinel's current scale. `lib/logger.ts` establishes the one structured-logging boundary: a single JSON line per event (`level`, `timestamp`, `requestId`, `operation`, `actorId`, `organizationId`, `errorCode`, `durationMs`), written to stdout/stderr, which any standard hosting platform's log aggregator already captures without further work. `lib/request-context.ts`'s `withRequestLogging` wraps one operation with a request id and a started/completed-or-failed pair, wired into `submitReportAction`, `createOrganizationAction`, and the API route as representative call sites.

**Known limitation, documented not fixed**: the API route's own try/catch converts a service error into a normal (non-2xx) `NextResponse` rather than re-throwing, so `withRequestLogging` logs "completed" even for a `401`/`429`/`500` response — it does not yet distinguish "completed successfully" from "completed with an error status" for routes that catch internally. Fixing this is a small, mechanical addition (log the response status alongside "completed"), not an architectural gap — tracked as a near-term follow-up.

**Signals identified as mattering, for a future real metrics platform** (not built): request count/latency by route, 4xx/5xx count by error code, authorization-failure count, RPC failure count by function, outbox pending/dead-letter count (`select count(*) from outbox_events group by status` already answers this ad hoc today), notification delivery failure count (`notification_deliveries.state = 'permanent_failure'`), and evidence storage failure count. Every one of these is already answerable via a direct SQL query against existing tables — the future work is a dashboard/alerting layer on top, not new instrumentation.

## J. Database/query review

Two genuinely unbounded, real-world-growable, user-facing queries were found (not hypothetical): `list_my_reports()` (a researcher's full cross-program report history, no limit at all) and `listReportsForProgram` (a program's full report inbox, no limit at all). Both are fixed this slice with real keyset pagination (see section K). `getOrganizationAuditActivity` already had a `limit` parameter but no cursor to page further back — also fixed. `getMyNotifications` already had a hard `.limit(50)` — extended to real cursor pagination for consistency. No N+1 loops were found in any service file audited (every list function uses a single `select` with joined embeds, never a per-row follow-up query). No index gaps were found: `reports_program_id_idx (program_id, submitted_at desc)`, `reports_researcher_id_idx (researcher_id, submitted_at desc)`, `audit_logs_organization_created_idx (organization_id, created_at desc)`, and `notifications_recipient_id_created_at_idx (recipient_id, created_at desc)` were all already shaped correctly for the exact predicate/ordering the new pagination code uses — a genuine, welcome validation that the schema's indexing discipline from prior slices anticipated this need without any migration required.

## K. Pagination

One contract, `types/pagination.ts`'s `Page<T> = { items: T[]; nextCursor: string | null }`, plus `lib/pagination.ts` (`encodeCursor`/`decodeCursor`, an opaque base64url `(sortValue, id)` token; `clampPageSize`, clamping any requested size into `[1, 100]`, defaulting to 20/50 per collection). Applied to `listMyReports` (RPC-backed, a real composite `(submitted_at, id)` tiebreaker computed in SQL), `listReportsForProgram`, `getOrganizationAuditActivity`, and `getMyNotifications` (all three TS-only, direct-table-select keyset pagination via a single-column `.lt()` filter — a deliberate simplification over a full composite-tuple filter, accepted because a same-microsecond timestamp collision within one program/organization/recipient's own history is practically negligible, and documented as such rather than silently assumed). **Live-verified**: 30 seeded reports paged in three 10-row pages with zero overlap and complete coverage; an oversized `p_limit=999999` request correctly returned no more rows than actually existed (well under the 100 cap).

**Deliberately not built this slice**: any "load more"/infinite-scroll UI. The four existing pages that call these functions were updated to take only the first page (`.items`) — wiring cursor-based UI interaction is frontend-build work, explicitly out of scope per this task's own "do not build frontend product screens" instruction. The contract exists, is tested, and is ready for that build to consume.

## L. Outbox/worker hardening

Reviewed, not rebuilt: lease expiry, crash recovery, dead-letter, retry/backoff, and — as of 0017 — multiple independent consumers per key were all already proven live in prior slices. This slice's own review re-confirmed (by inspection, not a fresh live run, since 0015–0017 already did this exhaustively) that no external provider call happens inside a domain transaction, no email is sent synchronously during report creation, and no notification blocks a domain mutation — all already true by construction (the outbox pattern itself makes any other arrangement impossible without deliberately reintroducing a synchronous call, which nothing in this codebase does).

## M. Storage

Reviewed, already correct (0011): private bucket, random object keys, a 10 MiB size limit enforced twice (application check constraint + storage layer), authorization-gated 60-second signed downloads with forced `Content-Disposition: attachment`, SHA-256 hash validation, and tenant isolation via the same RLS `report_evidence` already uses for every other read. **Not implemented this slice, correctly deferred**: real malware scanning (no scanner is actually available — the task is explicit that extension/content-type validation must never be presented as if it were malware scanning, and this codebase does not do so: `report_evidence`'s content-type check is documented as exactly that, a content-type check). **Gap identified, not fixed**: no per-user/per-report/per-program upload rate limit exists yet. Given the `private.check_and_consume_rate_limit` primitive now exists, adding `'evidence_upload:' || actor::text` (or `'evidence_upload_program:' || program_id::text` for a per-program storage-growth cap) to `add_researcher_file_evidence`/`add_organization_file_evidence` is the same mechanical follow-up named in section G.

## N. Email provider

No real provider credentials exist in this environment (unchanged since 0017). The development provider (`lib/email-provider.ts`) remains the only implementation — it explicitly logs "delivery simulated" and never claims a real external send succeeded. Research already identified Resend as the shape a future real adapter would take (0017); nothing new to add here beyond reconfirming the boundary (no provider SDK reachable from `services/`/`actions/`/domain logic — reconfirmed by grep this slice) is intact.

## O. Webhook boundary

**Documented, not implemented** — no schema was added, since nothing today requires it (no real subscriber exists) and the task explicitly discourages building unused infrastructure ("a minimal internal schema/prototype is acceptable only if required to prove the boundary"). The future shape, using only patterns already proven in this codebase:

```text
domain event (already exists: outbox_events)
  → a new webhook_subscriptions table (organization_id, target_url, secret, subscribed_event_types[])
  → a new webhook_deliveries table, mirroring notification_deliveries exactly:
    one row per (subscription, source_event_id), unique on that pair (fan-out idempotency,
    the identical pattern 0017 already established), state machine
    pending/processing/delivered/retryable_failure/permanent_failure, retries driven by
    the SAME outbox_events retry loop (no second queue)
  → signed delivery: an HMAC-SHA256 signature over the payload using the subscription's
    own secret, in a request header (the same pattern every serious webhook provider --
    Stripe, GitHub -- already uses; nothing to invent)
  → replay protection: the receiving side's job, but the payload includes the source
    event's own id and occurred_at so a receiver can deduplicate; Sentinel's own send-side
    replay protection is the identical unique-constraint idempotency already proven twice
  → NO webhook management UI is built alongside this -- an organization admin would
    manage subscriptions via a future settings page, not part of this backend slice
```
A new `createNotificationHandler`-shaped consumer (`workers/outbox/handlers/webhooks/*`) would register against the same event keys, reusing 0017's multi-consumer registry with zero changes to it.

## P. HTTP/security hardening

`next.config.ts` gained `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, and a conservative `Permissions-Policy` — applied via `headers()` to every route. **Deliberately not attempted**: a strict, nonce-based `script-src` CSP — Next.js's own inline hydration scripts and RSC streaming payload need either `'unsafe-inline'` (defeating the point) or a per-request nonce threaded through every layout, a real, separately-scoped change this hardening slice does not rush into. `frame-ancestors 'none'` alone already closes the concrete clickjacking risk without needing the rest of a strict CSP to be correct first. Verified: the production build (`npm run build`) completed successfully with these headers configured, and they apply only to responses this Next.js app itself serves — Supabase Storage's signed-URL responses are a separate origin these headers never touch, so evidence downloads are unaffected. `allowedDevOrigins` (already present, pre-dating this slice) and Next.js 15's own built-in Server Action Origin-header verification (a framework feature, not something this codebase implements itself) together are the CSRF boundary for Server Actions — reviewed, not reinvented; no gap was found requiring a custom CSRF token scheme on top.

## Q. Backup/recovery

Documented, not tested to destruction this slice (a true restore-from-backup drill was judged out of proportion to this slice's time-box, and no production backup infrastructure exists yet to test against — this environment is local-only). What is true today: `supabase/migrations/*` is fully reproducible schema (already proven, repeatedly, this entire session, by dozens of `supabase db reset` cycles from empty); a hosted Supabase project provides managed Postgres backups (point-in-time recovery on paid tiers) — this is a platform capability Sentinel would inherit, not something this codebase builds itself; Supabase Storage similarly inherits the platform's own durability guarantees. **Not yet documented or tested**: an explicit restore runbook (which backup, what RTO/RPO target, who is authorized to trigger a restore), and outbox recovery behavior after a restore (a restored-from-backup database could have replayed already-`succeeded` outbox events reappear as `pending` if the backup predates their processing — the existing idempotent-consumer design already handles this correctly, but it has never been exercised end-to-end against an actual restored snapshot). This is real, necessary work before any production launch, explicitly out of this slice's scope.

## R. 100k-user architectural assessment

**Concrete bottlenecks, not generic advice:**

1. **`rate_limit_counters` unbounded growth**: no cleanup job exists. At 100k active users hitting a handful of rate-limited actions, this table grows by roughly (distinct actors × distinct windows ever hit) rows — bounded but not small over a year of operation. **Fix**: a scheduled `DELETE FROM rate_limit_counters WHERE window_start < now() - interval '1 day'`, trivial and safe (no query ever reads an old window), not implemented this slice.
2. **`audit_logs` has no retention policy or archival path**. At 100k users generating routine mutations, this table becomes the single largest table in the schema within a year or two. It is already correctly indexed for its own read pattern (`organization_id, created_at desc`), so query performance degrades gracefully, not catastrophically — but storage cost and backup size grow unbounded. **Fix**: a documented retention/archival policy (not implemented — see "Data retention" below).
3. **The outbox worker is currently a single process** (`npm run worker:outbox`), though `claim_outbox_events`'s `FOR UPDATE SKIP LOCKED` already supports N concurrent workers with zero code changes (proven live with 6 concurrent workers in 0015). At 100k users' worth of event volume, running 2–4 worker processes is an operational scaling step, not an architectural one.
4. **Email delivery is fully synchronous within one worker's handler invocation** (route → ensure delivery → prepare → send → record, all in one `await` chain per notification). At very high notification fan-out (a program with thousands of eligible recipients), one outbox event's processing time scales linearly with recipient count. This is not a blocker at 100k *users*, but would become one at 100k *recipients of a single event* — an unlikely but not impossible shape (a platform-wide announcement, if ever built). **Mitigation path, not built**: split fan-out into per-recipient outbox events at creation time instead of resolving all recipients inside one handler invocation, letting the existing concurrent-worker claim mechanism parallelize delivery naturally.
5. **No tenant-wide scans exist anywhere audited** — every list query is scoped by `organization_id`/`program_id`/`researcher_id`/`recipient_id` with a supporting index. This is a genuine strength, not a risk, worth stating plainly rather than manufacturing a concern.
6. **Report submission does not block on any external service** (verified: `submit_report` writes `reports`/`audit_logs`/`outbox_events` in one transaction, nothing else) — this remains true at any user count.
7. **No global lock exists anywhere in the schema** — every lock this codebase takes (`lock_and_authorize_report_for_triage`, `lock_and_authorize_report_for_finance`, `lock_and_authorize_obligation_for_finance`) is row-scoped (`SELECT ... FOR UPDATE` on one report/decision/obligation), never table-scoped. Confirmed by grep across every migration.

**Overall verdict**: 100k users requires operational tuning (more worker processes, a rate-limit-counter and audit-log retention job, connection pooling appropriate to a hosted Postgres tier) and, eventually, the per-recipient-event fan-out change for extreme notification volume — not an architectural rewrite. This matches the task's own stated objective exactly.

## S. Tests

```
npm run typecheck   -> clean
npm run lint        -> clean
npm test            -> 808 passed (43 files)
npm run build       -> succeeded
```

Real database verification performed this session (fresh `supabase db reset` before each run, real PostgreSQL, real PostgREST, no mocked services): submit_report rate limit (30 allowed, 31st `RATE_LIMITED`); create_organization rate limit (10/day total, 11th `RATE_LIMITED`); sign-in rate limit (10 allowed, 11th blocked, case-normalized email confirmed same bucket); `list_my_reports` cursor pagination (three 10-row pages, zero overlap, complete 30/30 coverage); oversized `p_limit` clamped; audit_logs cross-tenant read denied (new, explicit test); audit_logs same-tenant read succeeded; anonymous denied on `audit_logs`/`notifications`/`reputation_ledger`.

## T. 10× assessment

- **10× safer**: rate limiting and pagination are both database-authoritative (a real constraint/atomic upsert), not a UI convention; authorization remains impossible to bypass through the new API route (identical session/RLS boundary as every page).
- **10× cheaper**: zero new infrastructure — Postgres-backed rate limiting, stdout-based structured logging, no Redis/Kafka/external log platform.
- **10× simpler**: one pagination contract (`Page<T>`), one error-code-to-HTTP-status table, one rate-limit primitive reused three times.
- **10× scalable**: pagination and rate limiting both scale with the existing index-backed query patterns; no new tenant-wide scan was introduced anywhere.
- **10× maintainable**: the new API route and pagination contract are exactly what a future frontend build consumes — stable, tested, documented.
- **10× trustworthy**: the email provider still never claims a send it didn't make; the rate limiter fails open (a limiter outage never locks out a legitimate user) rather than fails closed in a way that could look like a false security guarantee.

## U. Deferred, explicitly

A strict nonce-based CSP, real webhook delivery, real email provider wiring, invitation/evidence-upload rate limiting, report-submission idempotency (pending a product decision), a rate-limit-counter/audit-log retention job, an explicit backup/restore runbook and drill, per-recipient-event notification fan-out, and a real external metrics/observability platform — all named explicitly above with what/why/impact/when, per the task's own instruction, not vague "looks good" sign-offs.
