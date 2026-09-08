# 0061 — A real Bounties page, replacing the /settings/payments stopgap redirect

Related: [[0013-bounty-decision-engine]], [[0014-payment-ledger-and-payout-orchestration]],
[[0016-reputation-ledger-foundation]].

## The problem

The sidebar's "Bounties" nav item (`components/app-shell-client.tsx`'s `MAIN_NAV`) pointed
at `/settings/payments` -- a real page, but one buried inside Settings and titled "Rewards
& Payments," not a dedicated Bounties destination. This was a disclosed, deliberate
stopgap from the redesign that introduced the nav item ("until a dedicated route exists"),
but a top-level nav entry that lands a researcher inside Settings instead of a real
Bounties page is a genuinely confusing redirect, not a minor cosmetic gap -- flagged
directly by the user.

## What changed

**`app/bounties/page.tsx`** (new): a real top-level route reading the exact same data
`/settings/payments` already read -- `listMyPaymentObligations()` (RLS-scoped to
`researcher_id = auth.uid()`, `services/payments.ts`, unchanged) -- no new query, no
second source of truth for the same facts.

**`components/payments/bounty-track-record.tsx`** (new, shared): the actual track-record
rendering, used by both `/bounties` and `/settings/payments` now, so the two entry points
can never drift into showing different numbers for the same researcher. Two parts:

1. A summary (`Verified earnings`) computed from the exact same rows the list below
   renders -- bounties paid (count), total paid per currency, and pending-per-currency.
   Amounts are summed as integer minor units per currency, **never blended across
   currencies into one fabricated total** (a researcher paid in both USD and EUR gets two
   real numbers, not one misleading blended one). Only currencies/categories with real,
   nonzero data render at all -- no "$0.00" filler row.
2. The full ledger itself, one row per real `payment_obligations` entry, newest first
   (unchanged ordering from the original `/settings/payments` list) -- report title,
   organization/program, date, amount, and status.

**`components/ui/badge.tsx`**: added `PaymentObligationStatusBadge`, following the exact
existing pattern every other status badge in this file uses (`MemberStatusBadge`,
`KycStatusBadge`, `ProgramStatusBadge`, ...) -- its own tone map, its own labels ("Pending,"
"Processing," "Paid," "Failed," "Cancelled"), not a borrowed/misapplied `StatusBadge`
report-lifecycle label. `processing` gets the bold-reskin's `glow-pulse` accent
([[0057]]) as a bounded, 2-iteration highlight, decorating (never replacing) the text
label.

**`app/settings/payments/page.tsx`**: unchanged in URL and purpose (still the real
"Rewards & Payments" Settings subpage, still linked from `components/settings/settings-
nav.tsx`), refactored to render `BountyTrackRecord` instead of a second, hand-duplicated
row list -- with a one-line pointer to `/bounties` for the fuller view.

**`components/app-shell-client.tsx`**: `MAIN_NAV`'s "Bounties" entry now points at
`/bounties`. No nav-grouping change otherwise -- `/bounties` is a distinct route from
every other `MAIN_NAV`/`SYSTEM_NAV`/`ORGANIZATION_NAV` href, so it introduces no risk of
the duplicate-active-item bug [[0059]] fixed.

## What this does not change

No new database table, RPC, or write path. `payment_obligations` rows are still only
created by an authorized organization manager via `createPaymentObligationAction`
(`components/reports/payment-status.tsx`) after a bounty decision is finalized -- a
finalized bounty decision (`report_bounty_decisions`) is still never itself a payment, per
[[0014]]'s own foundational distinction. A researcher whose accepted reports have
finalized bounty *decisions* but no `payment_obligations` row yet (the demo seed account's
actual state at the time this was built) correctly sees the honest "No bounties yet" empty
state on `/bounties` -- this is accurate, not a bug: no real payment obligation exists yet
for that account.

## Verification

`npm run typecheck`, `npm run lint`, and `npm test` (1096/1096) all pass. A clean
`npm run build` (`.next` removed first) succeeds with `/bounties` compiled as a real route
(44/44 static pages generated) alongside the unchanged `/settings/payments`. Rendered live
against the seeded demo account in Chromium: the sidebar's Bounties item highlights
correctly on `/bounties`, and the page shows its real (currently empty, per the demo
account's actual data) track record with no console errors.
