# 0062 — Bounties page falls back to a labeled mock preview when empty

Related: [[0054-public-program-discovery-redesign]], [[0055-full-settings-platform-and-copy-fixes]],
[[0061-bounties-track-record-page]].

## The request

On explicit instruction, `/bounties` ([[0061]]) shows sample bounty data when a
researcher has no real `payment_obligations` rows yet, rather than only the bare "No
bounties yet" empty state.

## What changed

**`lib/mock/bounty-track-record.ts`** (new): four entirely fictional `MyPaymentObligation`
rows (no real organization, program, report, or amount), following the exact isolation
convention `lib/mock/researcher-dashboard.ts` already established — one module, clearly
documented as fictional, so a later real query never needs this file touched to win.
Covers a spread of real statuses (`succeeded` ×2, `processing`, `pending`) across two
fictional organizations, so the preview demonstrates the summary math (per-currency
paid/pending totals) and every `PaymentObligationStatusBadge` tone, not just one flat case.

**`components/payments/bounty-track-record.tsx`**: `BountyTrackRecord` takes a new
`isMock` prop. When true, it renders a `Preview` banner — the identical pattern
`components/dashboard/preview-banner.tsx` already uses for the dashboard's own mock
data — directly above the summary/ledger, disclosing plainly that the researcher has no
real bounties yet and this is sample data. The banner and the mock rows are always
rendered together or not at all; there is no code path that shows mock rows without the
banner, or the banner without mock rows.

**`app/bounties/page.tsx`**: `isMock = obligations.length === 0`. When real obligations
exist, they always render exactly as before — the mock branch is unreachable the instant
one real `payment_obligations` row exists for that researcher, with no explicit
opt-out needed. When empty, `MOCK_BOUNTY_TRACK_RECORD` renders instead, with `isMock`
passed through so the banner shows.

## What deliberately did not change

**`/settings/payments` does not get the mock fallback.** It still shows the honest real
empty state when a researcher has no obligations. Settings is where a researcher checks
their actual, real account state — a "Rewards & Payments" settings page silently showing
fictional dollar amounts, even labeled, is a worse experience than the top-level
`/bounties` destination doing the same thing as an exploratory "here's what this looks
like" preview. The two pages share `BountyTrackRecord`'s rendering but now intentionally
diverge on this one call site's `isMock` argument (`/bounties` computes and passes it;
`/settings/payments` never does, so it defaults to `false`).

## Verification

`npm run typecheck`, `npm run lint`, and `npm test` all pass. Rendered live against the
demo account (which has zero real `payment_obligations` rows): `/bounties` shows the
Preview banner and four fictional rows with correct per-currency summary totals and status
badges; `/settings/payments` still shows the real "No bounties yet" empty state.
