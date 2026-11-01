# 0017: Notification routing + preferences + delivery foundation — a channel-neutral domain, reusing the outbox

Date: 2026-08-29
Status: Accepted

## Context and the boundary this slice draws

Unpatched now has two independent outbox producers (`report.created` from 0015; the five report-outcome events plus `bounty.finalized` from 0016) and zero real consumers beyond a reference stand-in and the reputation ledger. This slice builds Unpatched's first real notification platform capability: routing a domain event to the right, already-authorized recipients, respecting their preferences, and delivering an email through a provider-neutral adapter — all durable, all idempotent, all reusing the outbox exactly as built. No Slack/Teams/push/SMS, no digest engine, no analytics dashboard, no AI prioritization, no webhooks (documented as a future extension point, not built).

## Research: event-driven notification systems, recipient resolution, and delivery semantics

- **Recipient resolution must never become a second authorization system.** The safest, simplest rule found across serious platform architectures is: a notification's eligible audience is *exactly* the set of people already authorized to see the underlying object, computed by re-running the object's own existing authorization predicate — never a parallel, divergent "who should be notified" rule that could drift from "who can actually see this." Adopted directly: `private.resolve_report_organization_recipients` and `private.can_currently_read_report` both reuse the identical predicate the `reports` table's own RLS policy (0008) already expresses.
- **Transactional vs. informational, and the unsubscribe distinction.** Real-world email-compliance practice (CAN-SPAM and equivalent regimes) draws a line between promotional/marketing messages (which require an unsubscribe mechanism) and strictly transactional/administrative messages (receipts, security alerts, account notices), which are commonly exempt. This is the precedent for treating `bounty_finalized` — a financial-outcome notice functioning like a payment receipt — as mandatory, while `report_activity` (informational updates about report/triage activity) is optional. This is a documented precedent this session is applying, not a legal conclusion being asserted as settled law.
- **Notification deduplication / idempotency has (at least) four distinct boundaries**, not one: outbox delivery (inherited unchanged from 0015), notification creation (a real unique constraint), delivery-attempt tracking (a real unique constraint plus terminal-state checking), and provider-operation idempotency (a Unpatched-generated key passed through to the provider). Conflating these into a single "we checked first" flag was explicitly avoided.
- **Fan-out is a router's job, not a broadcast.** A single event with N eligible recipients should resolve to N independently-authorized, independently-delivered notifications, never one email with N people in the recipient list (which would leak each recipient's identity to the others and collapse N independent authorization decisions into one). Adopted directly — see "Fan-out" below.
- **Recipient identity is a historical fact once assigned**, mirrored from how this codebase already treats other historical decisions (e.g. 0016's reputation facts): a notification's recipient is fixed at creation time and never re-resolved when the notification is later viewed. But *content disclosure* at delivery time is a separate question — see "Authorization race" below, where the research (and the task's own instruction to favor the safer model for sensitive vulnerability information) led to a **two-layer** answer rather than picking one of "event-time" or "delivery-time" alone.

## Core architectural separation

```text
report.resolved (domain event, unchanged, from 0016)
      ↓
outbox_events (unchanged, from 0015)
      ↓
route_and_create_notifications        <- recipient resolution + preference check (the "policy")
      ↓
notifications (the fact: who, what, when -- never report content)
      ↓
ensure_email_delivery / prepare_notification_email / record_email_delivery_result
      ↓
lib/email-provider.ts (channel-neutral -- currently only 'email' is real)
```

No report RPC (`submit_report`, `resolve_report`, `finalize_bounty`, etc.) is touched by this slice — they already emit the outbox events this slice consumes (from 0015/0016). This slice is **purely additive on the consumption side**: zero changes to existing domain mutation logic, zero new authorization gates on the report/bounty domain itself.

## A genuine architectural gap found and fixed: the outbox needed multi-consumer support

Mapping the existing outbox before implementing (per this task's own instruction) surfaced a real problem: `report.resolved:1`, `report.duplicate:1`, `report.informative:1`, `report.not_applicable:1`, `report.rejected:1`, and `bounty.finalized:1` **already** have a registered reputation consumer (0016). This slice needs a **second**, independent consumer on the *identical* keys. The existing registry (`workers/outbox/registry.ts`) mapped each `event_type:schema_version` key to exactly **one** handler — registering a second handler for an already-occupied key would have silently overwritten (not added to) the reputation consumer via a plain `Map.set`, breaking an already-shipped, already-verified feature.

This was caught by tracing the registration list before writing any handler code, not discovered by a failing test later. The fix: `registerHandler`/`getHandlers` (renamed from `getHandler`) now map each key to a **list** of independent handlers; `workers/outbox/worker.ts`'s `processEvent` runs every handler for a key concurrently (`Promise.allSettled`) and computes one overall outcome — success only if every handler succeeds; dead-letter only if every failure is permanent; otherwise retry the whole event. This is safe specifically *because* every handler in this codebase is already required to be idempotent (a requirement that existed before this slice, for the sequential-redelivery case) — a retry caused by one consumer's failure re-invoking an already-succeeded sibling consumer is exactly the scenario that requirement was for. Verified live: a deliberately malformed event produced **both** consumers' independent rejection messages, joined, and the event correctly dead-lettered since both were permanent — a genuine proof of the new fan-out mechanism, not merely a unit-test assertion.

## Event → recipient routing (the policy layer)

`route_and_create_notifications` (plain, not `security definer`, service_role-only — mirroring `record_reputation_fact`'s identical reasoning: its only caller already bypasses RLS via the `service_role` role attribute, so the real boundary is the explicit grant, not an elevated function body) is the sole insertion path:

1. Re-derives the report row; re-verifies the claimed `notification_type` against the report's actual current status (report-outcome types) or a real finalized bounty decision (`bounty_finalized`) — the identical `PROVENANCE_MISMATCH` pattern 0016 established. Never trusts the event payload for anything beyond "which report."
2. Resolves the eligible recipient set: `report_created` → the organization side (`private.resolve_report_organization_recipients`: program managers ∪ organization owner/security_admin — exactly the audience the report's own RLS policy already grants read access to); every other type → the report's own `researcher_id` (a single recipient — their own report/bounty activity).
3. Checks each recipient's **effective** preference for the resulting category (mandatory categories bypass this check entirely — see "Preferences" below).
4. Inserts with `on conflict (source_event_id, recipient_id) do nothing` — a real atomic upsert, not a separate check-then-insert (a design choice made *because* 0016's equivalent RPCs needed a follow-up fix for exactly this race; this slice avoided that class of bug from the start rather than repeating it).
5. Returns every notification row for this source event (both newly-inserted and pre-existing), so a caller resuming a redelivered event can pick up delivery for rows it already created on an earlier, incomplete pass.

## Notification schema: content-free by design

`notifications` stores only identifiers and the fact itself — `recipient_id`, `organization_id`/`program_id`/`report_id` (tied together by the identical composite FK pattern 0016 established against `reports`), `category`, `notification_type` (with a shape-check constraint tying the two together deterministically), `source_event_id` (`unique` together with `recipient_id` — the fan-out idempotency boundary), `occurred_at`, `created_at`, `read_at`. **No report title, description, or bounty amount is ever denormalized onto this table.** Rendering a title — in-app or in an email — always goes back through the authoritative, currently-enforced authorization boundary (the reports table itself, or `prepare_notification_email`'s own re-check), so a recipient who later loses access to a report also loses the ability to see anything about it beyond "you were notified," with no special-case code required anywhere.

Unlike 0016's `reputation_ledger` (which ties `researcher_id` to the report's own researcher via a composite FK), `notifications.recipient_id` is deliberately **not** constrained to the report's researcher — an organization-side recipient (a program manager) is a legitimate, different recipient for the same report. This is a real, reasoned divergence from 0016's tighter model, not an oversight: recipient legitimacy is enforced by the routing RPC's own logic (drawing only from the authorized-recipient set at insert time) and by RLS, not by a static schema constraint that would be wrong for this table's actual audience.

## Delivery schema / state machine

`notification_deliveries`: one row per (notification, channel) — currently only `'email'` is a valid channel. In-app "delivery" has no row of its own: it is definitionally synchronous and cannot fail (it is just the `notifications` row existing plus RLS-scoped visibility), so giving it a delivery row would be a state with no possible transition — exactly what this task's own "do not create states without a reason" warns against.

States: `pending → processing → delivered` (terminal) or `→ retryable_failure` (stays available for the next outer-event retry) or `→ permanent_failure` (terminal — either the caller says the failure can never succeed, or this delivery's own `attempts` reaches `max_attempts`). `record_email_delivery_result` is the only transition path. **No separate scheduling/lease mechanism exists for this table** — retries are driven entirely by the existing `outbox_events` retry/backoff loop: if any delivery for an event is still non-terminal when the handler finishes, it throws `RetryableHandlerError` so the whole event is retried later, at which point already-terminal deliveries (delivered or permanently failed) are skipped and only genuinely-still-pending work repeats. This was a deliberate choice to avoid "a second outbox framework," reusing the one Unpatched already has.

## Idempotency (all four boundaries verified live)

1. **Outbox delivery** — unchanged, inherited from 0015 (at-least-once, never exactly-once).
2. **Notification creation** — `unique (source_event_id, recipient_id)`, enforced via `on conflict do nothing`. Verified live under genuine, simultaneous concurrent calls (two truly parallel HTTP requests against a fresh, never-before-processed event id): both calls returned the identical row; exactly one row exists afterward — safe by construction (a real atomic upsert), unlike 0016's original check-then-insert pattern, which needed a follow-up fix for exactly this race.
3. **Delivery-attempt tracking** — `unique (notification_id, channel)`, plus explicit terminal-state checking (`delivered`/`permanent_failure`) before any send is attempted again. Verified live: redelivering an already-processed `report.resolved` event left the delivery's `attempts` unchanged at 1 — the send was correctly skipped, not repeated.
4. **Provider-operation idempotency** — every send is given a Unpatched-generated idempotency key (the delivery row's own id), which a real future provider adapter would pass through to the provider's own idempotency mechanism, mirroring `lib/payment-provider.ts`'s identical `idempotencyKey` reasoning.

## Preferences: two categories, explicit defaults, a mandatory category enforced by the RPC itself

`report_activity` (optional, default enabled) and `bounty_activity` (mandatory, always enabled) — not four. `triage_activity`/`researcher_activity` were considered and rejected for this slice: no shipped event currently backs either (researcher access changes — invitations, suspensions — are not yet instrumented with outbox events), and a category with no real event behind it would be exactly the "50 toggles" anti-pattern this task warns against.

`notification_preferences` is a **sparse override table** — a row exists only when a user has actively changed a category away from its default, never one row per user per category at signup. Defaults live in exactly one place (`get_my_notification_preferences`'s own SQL), never duplicated in TypeScript. `set_notification_preference` rejects any category other than `report_activity` by name (`CATEGORY_NOT_CONFIGURABLE`) — this is the actual enforcement that a mandatory category can never be disabled, not a UI convention; verified live. Disabling `report_activity` was verified live to suppress the notification **entirely** (both in-app and email), not merely its email channel — the product framing is "you won't be notified about this," not "you won't get an email about it."

## Provider abstraction

`lib/email-provider.ts` defines `EmailProvider` (a `send(message)` method taking `{to, subject, text, idempotencyKey}`); the notification domain and worker handler never import a concrete SDK. Research surveyed transactional email providers for a development-safe sandbox, documented idempotency-key support, retry semantics, and webhook/event support; **Resend** was the provider this seam's shape was researched against (a documented `Idempotency-Key` header, a `delivered@resend.dev` sandbox mode, straightforward HTTP API, reasonable pricing/DX for a transactional-app use case) — but per this session's own precedent (0014's manual-only `PaymentProvider`, shipped without an untestable real Stripe/Razorpay adapter) and this environment's lack of real credentials, **only the interface and a deterministic development provider are implemented**. `devEmailProvider` explicitly logs `"delivery simulated"` and returns success with a deterministic reference derived from the idempotency key — it never claims a real external send succeeded. Wiring a real adapter is next-slice work requiring real credentials to test honestly, not something this slice fakes.

Note: `lib/email-provider.ts`/`lib/email-render.ts` deliberately omit `import "server-only"` (unlike `lib/payment-provider.ts`) — this module is reachable from the standalone outbox worker process, not just Next.js Server Components/Actions, and the `server-only` guard throws unconditionally outside webpack/Turbopack's special resolution. This was caught live: the real worker crashed immediately on import until the guard was removed, since no client component ever imports this module directly anyway (the guard's actual purpose was already satisfied without it).

## Failure / retry behavior

Distinguished per this task's own framing: provider timeout/temporary failure → `retryable_failure` (verified live: two consecutive temporary failures against a `max_attempts=2` delivery correctly transition `retryable_failure → permanent_failure` on exhaustion, even though the caller never asserted "this is permanent"); an explicit permanent rejection (e.g. an invalid address) → `permanent_failure` immediately, regardless of attempts remaining (also verified live). A permanently-failed *individual delivery* does **not** cause the outer outbox event to dead-letter on its own — the handler only re-throws `RetryableHandlerError` if some delivery is still genuinely retryable; an event whose every delivery reached a terminal state (delivered or permanently failed) is considered successfully processed, since the notification/delivery layer's own terminal states already capture the real outcome.

## Authorization / privacy — the two-layer answer to the "authorization race"

The task explicitly asks whether notification authorization should be event-time, delivery-time, or both, favoring the safer model for sensitive vulnerability information. This slice answers **both**, at two different layers:

- **Recipient existence is resolved at processing time** (as close to "event time" as an async system honestly gets) and is then a fixed, historical fact once a `notifications` row exists — never re-resolved when later viewed, matching the task's own "the notification recipient is a historical decision" instruction. A manager removed before the event is ever processed simply never receives a notification in the first place (the safer outcome).
- **Content disclosure is re-verified immediately before rendering**, independently of recipient-existence. `prepare_notification_email` calls `private.can_currently_read_report(report_id, recipient_id)` — the identical reports-RLS predicate — right before returning any content; if authorization has been lost since the notification was created, it marks the delivery **permanently failed** with a safe reason (`RECIPIENT_NO_LONGER_AUTHORIZED`) and returns no content at all. **Verified live**: a notification was created for an organization owner while they were still a member; their membership was then revoked; `prepare_notification_email` was called and returned `deliverable: false` with every content field `null` — no title, no program name, no organization name ever left the function. This is the single most important correctness property of this slice, proven against real Postgres, not merely designed on paper.

## Tenant isolation and cross-audience separation

Every notification's `organization_id`/`program_id`/`report_id` is tied together by the same composite-FK pattern 0016 established — a notification can never reference a report belonging to a different program or organization at the constraint level. Researcher and organization audiences are naturally separated by the recipient-resolution logic itself (organization-side events resolve to `program_members`/org owner-or-security_admin; researcher-side events resolve to the report's own `researcher_id`) — no shared "notify everyone" path exists anywhere in the routing RPC.

## RLS / security

`notifications`: RLS enabled, one policy (`recipient_id = auth.uid()`) — a single universal rule that already covers both audiences correctly, since an organization-side recipient is just a user like any other; no special-casing was needed. Verified live across four identities: the owning recipient (sees their own rows), an unrelated researcher (empty, not an error), a cross-tenant organization owner (empty), and anonymous (empty). `notification_deliveries`: RLS enabled with **zero** permissive policies and zero grants to `authenticated`/`anon` — mirroring `outbox_events`'s own reasoning from 0015 exactly, since delivery mechanics have no legitimate human reader in this slice. `notification_preferences`: RLS scoped to `user_id = auth.uid()`, select-only for `authenticated` (all writes go through the `security definer` `set_notification_preference` RPC). Every service-role-only RPC (`route_and_create_notifications`, `ensure_email_delivery`, `prepare_notification_email`, `record_email_delivery_result`) was confirmed live to reject a direct authenticated call with `403`. Direct `PATCH` attempts against real, existing `notifications` and `notification_deliveries` rows (from the owning recipient's own token) were confirmed live to change **zero rows** — genuine denial against real data, not an empty-table false positive.

## Client-facing mutation surface

`mark_notification_read(p_notification_id)` is the only mutation an ordinary authenticated user may perform on `notifications` — `security definer`, re-derives the recipient from `auth.uid()`, takes no recipient-id parameter a client could substitute, and is a safe, idempotent, one-way transition (`read_at` is set once, never cleared). Verified live: a second call is a harmless no-op, and a different researcher attempting to mark the same notification read is rejected with `NOTIFICATION_NOT_FOUND` (their query for "my notification with this id" correctly finds nothing).

## Webhook architecture (documented, not built)

A future `webhook` channel would add one more `channel` check-constraint value on `notification_deliveries`, a new `infrastructure`-style adapter parallel to `lib/email-provider.ts`, and a new branch in the handler's per-notification delivery loop — the routing RPC, the `notifications` table, and the idempotency/retry machinery would not change at all. Not built in this slice, per the task's explicit instruction.

## Audit boundary

`set_notification_preference` writes an `audit_logs` row (`notification_preference.updated`) — a deliberate, self-service change to how a user receives security/business-relevant communication is worth a durable trail. Nothing else in this migration writes to `audit_logs`: routine email delivery attempts, retries, successes, and failures are recorded in `notification_deliveries` (operational history), not `audit_logs` (business/forensic history) — the identical audit-vs-outbox distinction 0015 already established, applied here to audit-vs-delivery-history instead.

## 10× assessment

- **10× safer**: no notification can bypass report authorization — every recipient-resolution and content-disclosure path re-runs the report's own existing authorization predicate, never a parallel rule.
- **10× more trustworthy**: every notification traces to the exact domain event, report, and category that produced it — a user can always understand why they were notified.
- **10× cheaper**: reuses the existing Postgres instance and the existing outbox worker (now genuinely multi-consumer); zero new infrastructure, zero new queue.
- **10× simpler**: one notification domain, multiple delivery channels behind one interface — adding a channel means a new adapter and one new branch in the delivery loop, never a change to routing, preferences, or the report/triage/bounty domain.
- **10× scalable**: fan-out is fully asynchronous (recipient resolution and delivery happen in the worker, never inside the report transaction) and rides the already-proven multi-worker `SKIP LOCKED` claim mechanism unchanged.
- **10× more useful**: a researcher now learns their report was resolved or their bounty was finalized without polling the platform; a program manager learns a new report needs attention without checking the inbox manually.

## Deferred, explicitly

Slack/Teams/mobile push/SMS integration, a notification analytics dashboard, marketing/campaign automation, a digest engine, AI-driven notification prioritization, a real webhook delivery channel, a real (non-development) email provider adapter, researcher-access-change notifications (invitations/suspensions — not yet instrumented with outbox events), and a full in-app notification center UI — all named out of scope by the task, and none of them require this slice's schema or RPCs to change when eventually built.
