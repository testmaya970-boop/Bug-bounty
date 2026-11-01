# Known issues

Disclosed, not fixed this release. Each entry says what's real, what's missing, and
what would make it worth revisiting.

## Same-pattern stale-filter risk in two other tables (fixed only in Findings)

Turn 8's E2E journey suite caught a real bug in `OrganizationFindingsTable`: its
`reports`/`nextCursor` state was seeded once via `useState(initialReports)`, which (by
design -- a React useState initializer never re-runs on a prop change alone) does not
update when a filter change re-renders the parent Server Component with fresh
`initialReports`. Changing a filter updated the URL and the dropdown's own displayed
value, but the rendered list silently kept showing the PREVIOUS filter's results. Fixed
by keying the component instance by its filter values (`key={programId:status:severity}`
on the parent page), forcing a clean remount on any filter change -- confirmed live via
the E2E suite.

The identical `useState(initial...)` pattern exists in `components/reports/
report-inbox-table.tsx` (rendered by `.../programs/[programId]/reports/page.tsx`) and
`components/organizations/organization-assets-table.tsx` (rendered by `.../assets/
page.tsx`) -- neither is exercised by a filter-change assertion in this release's E2E
suite, so neither is confirmed broken OR confirmed fixed. Same fix (a `key` prop keyed by
the filter values) would apply if a future test proves the same staleness there.

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

## Log-only email delivery (real notifications, simulated send)

Every notification-producing event in this system (now including
`report.message_posted`, `report.triage_started`, and `report.accepted` -- closed by
Turn 8, see `db/migrations/202609090007_message_and_triage_notifications.sql`) resolves
through `workers/outbox/handlers/notifications/notification-handler.ts`'s
`createNotificationHandler`, which genuinely calls `activeEmailProvider.send(...)` --
but `activeEmailProvider` resolves to the `"dev"` provider (log-only, not a real send)
unless `EMAIL_PROVIDER=resend` is explicitly set in the environment. It is not set in
this environment. So every notification-producing event is
real-pipeline-but-simulated-delivery, not "nothing happens" -- the full
`route_and_create_notifications` → `ensure_email_delivery` → `prepare_notification_email`
→ provider `.send()` → `record_email_delivery_result` chain runs for real, and the
in-app notification row is real and RLS-scoped; only the actual outbound email is
simulated. Set `EMAIL_PROVIDER=resend` (plus `RESEND_API_KEY`/`EMAIL_FROM`) to switch to
real delivery -- no code change required.

As of Turn 8, no notification-producing event is audit-log-only anymore.
`report.message_posted` routes actor-scoped (whoever did not post the message is the
recipient; an `internal`-visibility message from the organization notifies nobody, since
the researcher has no RLS access to read it); `report.triage_started`/`report.accepted`
route to the report's own researcher, matching every other single-recipient type.
