# 0027: Platform Operations Foundation — a real, narrow platform authority

Date: 2026-08-31
Status: Accepted

## Context

`docs/decisions/0024`–`0026` established that Unpatched behaves as `Researcher ↔ Organization` with no real third party, and that `platform_role`/`requirePlatformAdmin()` are confirmed dead scaffolding (never set to anything but the default, zero call sites). This slice makes the platform tier real for the first time — narrowly: one read-only operational queue (`Needs Recovery`) over data that already exists, plus exactly one recovery action, proven safe before being written.

## Why platform authority exists, and why not sooner

Every P0 item in `0026`'s roadmap (a real program-review gate, cross-program researcher suspension, payment-failure escalation) requires a real, audited platform-admin actor to exist first. Building any of those directly would mean inventing platform authority and a high-stakes capability in the same slice. This slice proves the authority model on the lowest-stakes, already-correct data (dead-lettered events, failed deliveries, failed payments) before it is ever extended to anything that mutates an organization's or researcher's standing.

## Existing dead scaffolding: left in place, not revived

`platform_role` (`202608250001`) has never been set to anything but its default `'researcher'` by any migration, RPC, or trigger — re-confirmed by grep before writing this slice's migration. Its non-default values (`organization_owner`, `program_manager`, `triager`) collide in name with unrelated `organization_member_role`/program-role values, which `0024` already flagged as confusing. This slice does **not** reuse or repair that column. It introduces a new, unambiguous concept instead: `public.platform_admins`, a real membership table (a row means membership; absence means none), following the exact shape `organization_members`/`program_researchers` already established, rather than a mutable flag on the user row. `platform_role` and `requirePlatformAdmin()` are untouched and remain dead code — resolving the naming collision is named in `0026` as a prerequisite for anyone building on `platform_role` later, and this slice sidesteps the question entirely by not building on it.

## Exact authority boundary

- **Membership, not a role column**: `public.platform_admins(user_id, granted_by, granted_at)`. RLS enabled, zero permissive policies — the same "absent, not narrow" precedent `outbox_events`/`notification_deliveries` already set — so even the fact of who is a platform admin is never directly queryable by any client. `private.is_platform_admin()` (SECURITY DEFINER) is the only way to check, and it only ever answers for the calling `auth.uid()`, never enumerates others.
- **Granting/revoking is `service_role`-only, with zero grant to `authenticated`.** There is no self-escalation path for a researcher or organization owner through any client-reachable code, at all — verified live (see below).
- **Every read is SECURITY DEFINER, independently re-checking `private.is_platform_admin()` inside the function body** — never assumed from merely having reached the function. Three narrow RPCs: `list_needs_recovery_outbox_events`, `list_needs_recovery_notification_deliveries`, `list_needs_recovery_payment_attempts`.
- **The one mutation**: `replay_dead_lettered_outbox_event(event_id, reason)` — resets a dead-lettered event to `pending`, letting the existing, unmodified worker claim/complete loop reprocess it. No new processing path, no bypass of `outbox_event_receipts`' idempotency guarantee.

## Exact non-authority

- **Never report content.** No RPC in this slice selects a report title, description, evidence, or message — only `organization_name`/`program_name`/`report_id` (an opaque identifier, not a link a platform admin can currently open, since they typically hold no `program_members`/organization membership of their own).
- **Never financial figures.** `list_needs_recovery_payment_attempts` deliberately omits `amount_minor_units`, `currency`, and `researcher_id` — confirmed both by unit test (a mocked row with those fields present still produces a mapped object without them) and live, against the real database, with a real failed payment attempt.
- **Never a payment mutation of any kind.** Payments are read-only this slice, full stop — see "Recovery actions" below for why.
- **Never impersonation.** No session-switching mechanism exists anywhere in this slice; there was nothing to remove.
- **Never a superuser/service-role-in-the-browser shortcut.** Every new RPC is its own narrowly-scoped `SECURITY DEFINER` function with its own explicit `is_platform_admin()` check — the same pattern every other authority boundary in this schema already uses (`private.has_org_role`, `private.is_researcher_authorized_for_program`, etc.) — never a blanket RLS bypass.

## Failure data surfaced, and why the recovery-action boundary falls where it does

Tracing the actual handler code, not assuming symmetry across the three failure types, produced three different, disclosed answers:

| Failure type | Existing safe retry mechanism? | This slice's action |
|---|---|---|
| Outbox event `dead_letter` | **Yes** — resetting to `pending` reuses `claim_outbox_events`/`complete_outbox_event` unmodified, protected by `outbox_event_receipts`' idempotent-consumer guarantee | Real recovery action: `replay_dead_lettered_outbox_event` |
| Notification delivery `permanent_failure` | **No** — reading `workers/outbox/handlers/notifications/notification-handler.ts` directly shows the *outbox event* for a permanently-failed delivery has already reached `succeeded` (a permanent delivery failure is not itself a handler failure), so there is no existing path to re-trigger just the email send | Observation only — "Recovery action unavailable" |
| Payment attempt `failed` | Out of scope regardless — payment mutation is explicitly excluded from this slice's authority | Observation only — "Recovery action unavailable" |

This matches the task's own "when uncertain, do not mutate" instruction precisely: one real action was implemented because tracing the code proved it safe; two were left read-only because tracing the code proved no existing safe path exists yet (notifications) or because mutation was out of scope from the start (payments).

## Visibility / privacy model

Every returned row is: an opaque failure identifier, a timestamp, an organization/program name and report id (locating context, not content), a provider/failure code, and an attempt count. Verified live with a real seeded failure per category that the returned row shape contains exactly this and nothing else (no title, no amount, no recipient).

## Recovery actions implemented

One: `replay_dead_lettered_outbox_event`. Verified live, twice: once with a deliberately malformed payload (correctly re-dead-lettered by the real handler for a genuine, unrelated reason — proving the replay pipeline reached the real worker rather than silently no-opping), and once with a fully valid payload matching `ReportCreatedV1Payload`'s real shape (reached `succeeded`, with the real reputation/notification consumers firing and real simulated emails logged) — full end-to-end proof, not a status-flip assumption.

## Audit behavior

Every mutation writes a real `audit_logs` row: `platform_admin.granted`/`platform_admin.revoked` (actor_id null — a `service_role`/operational action, matching `audit_logs.actor_id`'s nullable, on-delete-set-null shape) and `platform.outbox_event_replayed` (actor_id = the calling platform admin's own `auth.uid()`, organization_id = the affected event's organization, metadata carrying the reason and event type). Read-only queue views write nothing, per the task's own explicit instruction not to manufacture audit rows for page views.

## Concurrency behavior

Live-tested: two genuinely simultaneous `replay_dead_lettered_outbox_event` calls against the identical dead-lettered event. Result: exactly one succeeded, the other cleanly rejected with `EVENT_NOT_DEAD_LETTER` (the `for update` row lock serializes the two calls; the second sees the row already moved to `pending`). No double-replay is possible.

## Authorization matrix — live-tested against real PostgreSQL

| Actor | Result |
|---|---|
| Platform admin | ALLOWED (all three reads; replay) |
| Researcher | DENIED (`FORBIDDEN`) |
| Organization owner | DENIED |
| Organization security_admin | DENIED |
| Organization program_manager | DENIED |
| Organization triager | DENIED |
| Organization billing_admin | DENIED |
| Stranger (zero relationships) | DENIED |
| Anonymous | DENIED (no grant to `anon` at all) |

Also verified live: the platform admin account holds **no** organization membership of its own (a dedicated, fresh account, deliberately not layered onto any existing org owner) — `platform_admin === organization.owner` was never true, by construction, not merely by convention. Cross-tenant: the platform admin's reads returned dead-lettered events from two distinct, unrelated organizations in the same result set. Existing org-scoped reads (an organization owner's own audit/report views) were not modified at all in this slice — their existing RLS policies are untouched, so an organization owner's own visibility is structurally unchanged.

## Browser verification (real Chromium)

Platform admin reaches `/platform/needs-recovery` (one `h1`, honest empty state when the real database is clean, real populated rows with a working "Replay" button when seeded, full click-through to "Queued for reprocessing"). A researcher and an organization owner both get a real **404** (not a "Permission denied" page — a non-admin should not learn this route exists at all). Existing researcher workflow (`/programs`) unaffected. Responsive at 1440/1280/1024/768/390/320 with no horizontal overflow.

## Accessibility verification

Exactly one `h1` (`Needs recovery`); each failure category is a real `<h2>` (`Outbox`/`Notifications`/`Payments`), associated to its `<section>` via `aria-labelledby`; the empty state's own `EmptyState` component already renders a semantic `<h2>`. Status is always conveyed by real text ("Dead lettered", "Delivery failed permanently", "Recovery action unavailable"), never color alone. The Replay button is a real `<button>`, keyboard-reachable and activatable by construction.

## Tests

968/968 unit tests pass (13 new: service-layer authorization/mapping/privacy-boundary tests, action-layer input/auth/error-mapping tests, one structural UI test for `ReplayButton`'s default render). `typecheck`/`lint`/`build` all clean.

## Files changed

New: `supabase/migrations/202608310001_platform_operations_foundation.sql`, `types/platform-operations.ts`, `services/platform-operations.ts`, `actions/platform-operations.ts`, `app/platform/needs-recovery/page.tsx`, `components/platform/replay-button.tsx`, three test files. Regenerated: `types/supabase.ts`. No existing file was modified — `components/app-shell.tsx` and every existing RLS policy/RPC are untouched.

## Newly discovered risks

None beyond what `0025`/`0026` already named. The naming collision between `platform_role` and organization/program role values remains unresolved (deliberately deferred — this slice's own authority does not depend on it).

## Explicitly deferred capabilities

Everything the task named as out of scope remains out of scope: program marketplace, public discovery, platform program approval, researcher platform bans, disputes, retesting, payment provider integration or mutation, fraud detection, analytics/charts, an organization or researcher health dashboard, managed triage, configurable RBAC, OAuth/MFA/passkeys. Also explicitly deferred within the platform-operations concept itself: `Needs Review`, `Needs Intervention`, `Needs Investigation` (named in `0026`'s information architecture, not built here — no dead navigation links were added for them).

## Updated launch-readiness assessment

Platform operations readiness moves from `0025`'s **5%** to a genuinely higher, still-early number — a real authority model now exists and is proven, but it covers exactly one queue out of the four `0026` named. Stage C ("Controlled organization/researcher beta") readiness improves concretely: a dead-lettered event or a permanently-failed notification is no longer invisible to everyone — a platform admin can now see and, for the outbox case, actually recover it. Stages D/E/F remain **NOT READY** for the same structural reasons `0026` already gave (no program visibility, no researcher-suspension escalation, no dispute mechanism) — this slice does not change that.

## Recommended next slice

Per `0026`'s own roadmap, the next highest-leverage step is **not** expanding this dashboard. It is either (a) the program-visibility column (the marketplace's actual structural blocker), now that a real platform admin exists to eventually gate it, or (b) platform-wide researcher suspension (the sharpest CONTROL gap named in `0025`), which can now be built with a real, audited actor behind it. Recommend (b) first: it is a smaller, more bounded change than a visibility model, and directly closes the single most concrete abuse vector this audit chain identified, using the exact authority/audit pattern this slice just proved.
