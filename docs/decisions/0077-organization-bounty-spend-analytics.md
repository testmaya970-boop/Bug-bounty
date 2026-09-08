# 0077: Organization bounty spend analytics

## Context

The organization Analytics page (`app/organizations/[organizationId]/analytics/page.tsx`)
already covers report volume, severity/status breakdown, and resolution performance
(0004's own migration), plus a per-program "which program needs attention" comparison
table. It had no aggregate view of what the organization has actually **paid**
researchers — the one gap identified when extending the org tier's HackerOne-style
feature set toward a real analytics dashboard.

`public.report_bounty_decisions` (0013, the bounty decision engine) already carries every
real finalized payout: `final_amount_minor_units`, `currency`, `finalized_at`,
`finalized_by`. No new table was needed — only new read-only RPCs over data that already
exists.

## Decision

Three new RPCs, following 0004's own "one RPC per real question" pattern:

- `get_organization_bounty_spend_summary` — total paid, payout count, and severity
  breakdown, one row per currency.
- `get_organization_weekly_bounty_spend` — trailing 12 weeks, one row per (week,
  currency), mirroring `get_organization_weekly_report_volume`'s shape.
- `get_organization_program_bounty_spend` — per-program totals, feeding the existing
  program comparison table's new "Spend" column.

**Currency is never summed across rows.** `program_bounty_policy_versions.currency` is a
free-text `^[A-Z]{3}$` code (0013), not drawn from a fixed list, so two programs in the
same organization can genuinely use different currencies. Every RPC groups by currency;
the UI renders one tile/chart per currency rather than fabricating a blended total.

Only `state = 'finalized'` rows count as real spend. `'calculated'` is a recommendation
range, not money paid or owed; `'ineligible'` has no amount at all.

Read gate reuses `private.authorize_organization_analytics_read` verbatim (any active
organization member, matching the Analytics page's existing broad-read posture for
descriptive data).

## Consequences

- New component `components/organizations/organization-bounty-spend.tsx`: per-currency
  spend tiles (total paid, payout count, severity mix) plus a per-currency weekly trend
  chart. Renders nothing when the organization has never finalized a payout — an org still
  configuring bounty policy shouldn't see a fabricated "$0 paid" panel.
- `lib/money.ts` gained `formatMoney(amountMinorUnits, currency)`, the single-value
  counterpart to the existing range-only `formatBountyRange`.
- The per-program comparison table on the Analytics page gained a "Spend" column, reusing
  the same per-organization RPC result (no N+1 per-program query).
