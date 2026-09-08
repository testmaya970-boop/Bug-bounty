# 0047 — Scope-filter scroll fix + composer weakness/impact/severity fields

Related: [[0009-report-triage-state-machine]], [[0042-researcher-product-completion]],
[[0043-researcher-visual-identity-pass]].

## A. Bug: the scope filter scrolled the researcher back to the top of the page

`app/organizations/[organizationId]/programs/[programId]/page.tsx`'s "In scope"/"Out of
scope" filter links navigate to a new URL (same route, different `?scope=` query string).
Next.js's default post-navigation behavior scrolls to the top of the page on any such
navigation with no hash fragment -- so every click yanked the researcher away from the
Scope section they were looking at. Fixed with `scroll={false}` on the filter `Link`s,
which keeps the current scroll position across the navigation. Searched the rest of the
app for the same pattern (any `Link` doing query-string-only filtering, matching on
`aria-current`/`aria-label="Filter..."` conventions) -- this was the only occurrence.

Verified live: scroll position before and after clicking a filter stays in the same
region of the page (confirmed via a real click, not just reading the prop) -- it no
longer resets anywhere near the top.

## B. Composer fields: Weakness type, Impact, researcher's own severity

The user asked for a HackerOne-like Asset/Weakness/Severity/Description/Impact/
Attachments composer. Asset and Attachments already existed in full (Target section with
real scope-validated matching; the evidence/attachment composer from 0028/0042) and were
left untouched. Three real, backend-level additions:

1. **`weakness_type`**: a fixed, real 16-category vulnerability taxonomy
   (`report_weakness_type` enum) the researcher selects at submission -- required,
   validated server-side (`INVALID_WEAKNESS_TYPE`), pure metadata with no authorization
   weight.
2. **`impact`**: split out of the single `description` column into its own required
   field -- Description is now framed as "Reproduction" (how to reproduce), Impact is a
   separate "why does it matter" field, both required, both validated server-side the
   same way title/description already were.
3. **`researcher_severity`**: the researcher's own suggested severity -- explicitly a
   **second, distinct column from `confirmed_severity`**, never a replacement for it.

### Does this reopen 0009's severity deferral?

No. 0009 deferred researcher-proposed severity because conflating an unverified
researcher claim with the organization's authoritative decision was the real risk, not
the mere existence of a researcher opinion. This slice keeps that boundary intact by
construction: `researcher_severity` is optional (`Not set` is a real, valid choice, not a
missing one), advisory-only, and **read by nothing** -- no authorization check, no bounty
calculation, no reputation fact, no badge anywhere reads it except the one clearly-
labeled "Researcher's severity assessment" display next to (never inside) the
organization's own "Confirmed severity." `confirmed_severity` remains the sole value any
downstream logic trusts. This is the same "hacker suggests, triager decides" split every
real bounty platform studied uses -- an addition, not a reversal.

## C. Exact backend change

New migration `supabase/migrations/202609010001_report_weakness_impact_severity.sql`:
new `report_weakness_type` enum; `reports` gains three nullable columns
(`weakness_type`, `impact`, `researcher_severity` -- nullable at the schema level so
pre-migration reports are never retroactively invalidated); `submit_report` redefined
(old 5-parameter signature explicitly dropped, not left dangling) to require
`weakness_type`/`impact` and accept an optional `researcher_severity`, with every other
line (rate limiting, authorization, program-status check, title/description validation,
scope matching, the audit log row, the `report.created` outbox event) copied verbatim
from its actual current definition, not a stale earlier one.

## D. Frontend changes

`components/reports/create-report-form.tsx`: Finding section gains Weakness type
(required select) and "Your severity assessment" (optional select, "Not set" default)
beside Title; Reproduction and Impact are now two separate labeled sections instead of
one merged "Reproduction & impact" textarea; Review summary reflects both new fields
live. Report detail page (`.../reports/[reportId]/page.tsx`) displays Weakness type and
"Researcher's severity assessment" in the submission metadata grid (degrading to "Not
specified"/"Not set" for a report that predates this migration) and renders Impact as its
own section, distinctly labeled from Reproduction.

## E. Tests, build, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1021/1021, 63 files), `npm run build`
all pass. Live Chromium verification (real account, real program, real scope-matched
target): submitted a report through the actual composer with all three new fields, the
Review summary reflected live selections, the submission succeeded through the real RPC
end-to-end, and the resulting report detail page correctly showed the real weakness type,
the real researcher severity assessment (distinctly labeled from confirmed severity), and
Impact as a genuinely separate section from Reproduction. Separately verified the
scope-filter scroll fix with a real click in a short viewport forcing real scrollable
overflow.

## F. Exact files changed

`supabase/migrations/202609010001_report_weakness_impact_severity.sql` (new);
`types/report.ts` (`ReportWeaknessType`, `Report.weaknessType/impact/researcherSeverity`);
`lib/report-weakness-labels.ts` (new); `services/reports.ts` (`REPORT_SELECT`,
`mapReportRow`, `submitReport` signature); `actions/reports.ts` (`submitSchema`,
`submitReportAction`); `components/reports/create-report-form.tsx`;
`app/organizations/[organizationId]/programs/[programId]/reports/[reportId]/page.tsx`;
`app/organizations/[organizationId]/programs/[programId]/page.tsx` (the scroll fix);
`tests/unit/reports-ui.test.tsx`, `tests/unit/reports-service.test.ts`,
`tests/unit/program-report-list-ui.test.tsx`, `tests/unit/report-inbox-table-ui.test.tsx`
(fixture/assertion updates for the new fields).
