# Known issues

Disclosed, not fixed this release. Each entry says what's real, what's missing, and
what would make it worth revisiting.

## Residual ~5.5x middleware request amplification

Turn 6 cut speculative-prefetch-driven middleware invocations from ~17.7x real
navigation volume to ~5.5x by disabling `prefetch` on every gated nav link (sidebar,
org header tabs, program header tabs, account menu, org/program switchers) --
`prefetch={false}` on every `<Link>` in `components/app-shell-client.tsx`,
`components/organizations/organization-header.tsx`, and
`components/programs/program-header.tsx`.

The residual ~5.5x is not yet root-caused. Working hypothesis: some prefetch-eligible
`<Link>`s outside those three files (in-page content links -- report rows, program
cards, breadcrumb links, dashboard tiles) still default to `prefetch={true}` and are
visible in the viewport on a typical page, so the App Router still speculatively
prefetches them. Not audited or fixed this turn -- the three shared nav surfaces were
the highest-volume, present-on-every-page offenders, and fixing every content link
individually was out of scope for a turn budgeted at "systemic fixes + 7 new routes."

**Revisit when:** connection pool contention appears under concurrent real users (the
middleware gate queries are two real `pg` round trips per invocation, competing for
the same pool as every page's own data fetching), or when total middleware invocation
volume grows further (more routes, deeper nav) such that even 5.5x becomes a real cost
rather than a rounding error against real traffic.

## Mock-badged analytics sections

`components/reports/analytics/reports-analytics.tsx` (the researcher-facing Reports
page's own analytics surface) is explicitly labeled "Preview" and disclosed as
narrower-than-real mock data -- confirmed still real and disclosed as of this release,
not silently mock. The organization-side Analytics page
(`app/organizations/[organizationId]/analytics/page.tsx`) is real data end to end, not
mock -- listed here only to disambiguate from the researcher-side surface above, which
is the one open item.

## No per-viewer read state

Notifications (`services/notifications.ts`) and Hactivity
(`services/organization-members.ts`'s `getOrganizationAuditActivity`) both track
`readAt`/nothing at all respectively for the notifications table, but Hactivity's own
audit event feed has no read/unread concept -- every viewer sees the same feed with no
per-viewer "seen this" state. Not built this release; would need a
`hai_waitlist_entries`-style per-user junction table if ever wanted.

## Manual, off-platform payouts

No in-product payment processor exists (`docs/decisions/0063-real-payment-processing-scope.md`).
Every payout touch-point (FinalizeBountyDialog, the researcher's BountyDecisionSection,
`/settings/payments`) now says so explicitly: "Payouts are processed off-platform by
your program contact." (Turn 5/6, confirmed still landed at all three sites as of this
release.) The payment ledger records the decision; it does not move money.

## Log-only outbox events (no real email)

Every notification-producing event in this system resolves through
`workers/outbox/handlers/notifications/notification-handler.ts`'s
`createNotificationHandler`, which genuinely calls `activeEmailProvider.send(...)` --
but `activeEmailProvider` resolves to the `"dev"` provider (log-only, not a real send)
unless `EMAIL_PROVIDER=resend` is explicitly set in the environment. It is not set in
this environment. So every event below is real-pipeline-but-simulated-delivery, not
audit-log-only in the sense of "nothing happens" -- the full
`route_and_create_notifications` → `ensure_email_delivery` → `prepare_notification_email`
→ provider `.send()` → `record_email_delivery_result` chain runs for real; only the
actual outbound email is simulated.

Two real gaps exist independent of the email-provider question -- these event
categories never reach the outbox at all, real or simulated:

- **`report.message_posted`**: `post_organization_message`/`post_researcher_message`
  write only to `audit_logs`. No outbox event, no notification, in any configuration.
- **Report state transitions `start_triage`/`accept_report`**: audit-log only, same gap.

Not built this turn, per the turn's own instruction (verdicts only, no new handlers).
See the Turn 6 output for the full per-event RPC/outbox trace.
