# 0045 — Researcher showcase data and real charts

Related: [[0016-reputation-ledger-foundation]], [[0042-researcher-product-completion]],
[[0043-researcher-visual-identity-pass]].

## A. The tension this task sits on

The user asked for "mockup data" and "fancy charts" to showcase the platform. Three
earlier tasks in this same project (0016, 0042, 0043) explicitly and repeatedly forbid
fabricated data reaching the live product -- no invented researcher counts, response
rates, scores, or rankings, ever shown to a real signed-in user. Those constraints stand;
they were not reversed. The resolution: **showcase content, not fabricated UI text**. A
seed script creates real rows through the product's own real RPCs (the identical
`create_organization`/`submit_report`/`resolve_report`/`finalize_bounty` calls a real
organization and researcher would trigger) -- the same way any SaaS product seeds a demo
account for a sales call or a screenshot. Every number a researcher later sees is a real
`COUNT`/aggregate over real rows, not a hardcoded string in JSX. Nothing here reintroduces
a score, a rank, or a leaderboard.

## B. Demo dataset

`scripts/seed-demo.mjs` (`npm run seed:demo`), a one-shot seeder for a fresh local
Supabase stack. Creates two organizations (Northwind Cloud Security, Vantage Retail),
four programs spanning public/private and with/without a bounty policy, one demo
researcher account joined to three public programs plus one pending direct invitation
(showcasing that flow too), and twelve reports deliberately spread across **every one of
the nine real report statuses** and **all four real severities**, including two finalized
bounties. Every mutation goes through the real RPC layer -- scope matching, triage state
machine, and bounty calculation all had to be satisfied for real, including two real
target-validation errors caught and fixed while writing it (a URL target cannot carry a
query string; a URL-type report needs a URL-type scope entry, not just a domain-type
one -- both are genuine product rules, not seed-script workarounds).

Login: `demo.researcher@sentinel.demo` / `SentinelDemo!2026` (plus two org-owner accounts,
printed by the script). Re-running the script requires a fresh database
(`npx supabase db reset --local` first) -- it is a one-shot seeder, not idempotent.

## C. Real charts, not decoration

Two dependency-free SVG primitives, `components/charts/bar-chart.tsx` and
`.../donut-chart.tsx` -- no charting library added; every value is a real, already-fetched
aggregate, and a scaled `<div>`/SVG arc is the entire mechanism (matches this codebase's
existing "no bloat" ethos -- the same reasoning 0043 gave for not installing a motion
library). Wired into three real pages:

- **Reputation** (`/researchers`): "Outcomes by type" (bar) and "Confirmed severity"
  (donut) -- both computed from the researcher's own true-total aggregates
  (`getMyReputationSummary`, and a new `getMyReputationSeverityCounts`).
- **My reports** (`/reports`): "Your reports by status" (bar), a new
  `getMyReportStatusCounts` -- the researcher's current work mix across every status, not
  only terminal outcomes (a genuinely different, real dataset from the reputation ledger).

Both new service functions mirror the exact existing pattern `getMyReputationProgramCounts`
already established (a plain `.select()` + `researcher_id`/`status` filter, aggregated in
JS, never a partial-page undercount) -- no new RPC, no schema change.

## D. A real, pre-existing bug found and fixed

Building the severity donut chart's legend surfaced a genuine, previously-undetected
rendering bug: `components/ui/badge.tsx`'s `dotToneFrom` derived a dot's `bg-*` class from
its `text-*` class at runtime via `.replace("text-","bg-")`. Tailwind's static content
scanner only generates CSS for class names it finds as literal text somewhere in the
scanned source -- a string built at runtime is invisible to it. `bg-warning` and every
`bg-severity-critical/high/medium/low/none` literal never appeared anywhere else in the
codebase, so those classes were never emitted in the compiled CSS at all. **Every status
dot for `triaging`/`needs_information`/`suspended`/`review` and every severity badge dot
had been rendering invisible this entire session, on every real page that shows one** --
a silent bug, not a crash, so nothing surfaced it until a chart legend made the missing
color impossible to miss.

Fixed at the root, not patched locally: `badge.tsx` now defines one `Tone = {text, bg}`
pair per semantic color, both written as literal strings in the same object (still one
edit site per tone -- no drift risk reintroduced, just no longer computed). `statusTone`/
`severityTone` are exported and reused directly by both new chart components, which had
independently reproduced the identical runtime-derivation mistake while I was building
them -- caught and fixed in the same pass, before shipping either.

## E. Tests, build, verification

`npm run typecheck`, `npm run lint`, `npm test` (1008/1008, 62 files), `npm run build` all
pass. Verified live: signed in as the seeded demo researcher, screenshotted Overview,
Reputation, My reports, and Programs -- confirmed the real notification ("1 report waiting
on you"), the real invitation count, all three charts rendering with correct real values
and now-correct colors, and the status/severity dot-color fix holding across both the new
charts and the pre-existing badges that use them.

## F. Exact files changed

`scripts/seed-demo.mjs` (new), `package.json` (`seed:demo` script);
`components/charts/bar-chart.tsx`, `.../donut-chart.tsx` (new);
`components/reputation/reputation-charts.tsx` (new), `.../reputation-ledger.tsx` (export
cleanup only), `.../reputation-summary.tsx` (`FACT_TYPE_LABELS` exported);
`components/reports/report-status-chart.tsx` (new); `app/researchers/page.tsx`,
`app/reports/page.tsx` (wiring + new data fetches); `services/reputation.ts`
(`getMyReputationSeverityCounts`), `services/reports.ts` (`getMyReportStatusCounts`);
`components/ui/badge.tsx` (the Tone refactor -- affects every badge in the product, all
verified unchanged in text/behavior, only the dot-color bug fixed).

## G. What was deliberately not built

No trend-over-time chart. Seed data is necessarily created in one real script run, so
every row's real timestamp clusters on one day -- a line chart over that would show one
flat point, which is honest but not useful; a genuine activity-over-time view stays a real
future feature once real usage naturally spreads across dates. No leaderboard, rank,
follower count, or researcher-comparison view of any kind -- explicitly out of scope per
0016, and this task did not reopen that decision.
