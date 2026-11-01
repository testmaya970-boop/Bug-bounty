# 0069 — Exposing the existing CVSS score to the researcher who earned it

## Status

Accepted. Corrects an inaccuracy in this session's own earlier feature-parity gap list,
which claimed "no numeric CVSS calculator" exists. That was wrong: CVSS v3.1 base scoring
was already fully built (`supabase/migrations/202609030006_cvss_severity_scoring.sql`,
eight metric columns plus a server-computed `cvss_base_score`, following FIRST.org's own
formula) and `services/reports.ts`'s `getReport()` already returns `cvssMetrics`/
`cvssBaseScore` on the mapped `Report` — the researcher's own RLS-scoped read of their own
report already carries this data over the wire today. **The real, narrower gap is that
no component ever renders it to the researcher** — `components/reports/triage-actions.tsx`'s
`SeverityControl` is the only place `currentCvssBaseScore` is displayed, and it is
rendered exclusively inside the `canTriage` branch of the report detail page
(`app/organizations/[organizationId]/programs/[programId]/reports/[reportId]/page.tsx`),
which a researcher never satisfies.

## What changes

A new, read-only `CvssSummary` display in the researcher's own reading column (not the
organization's decision rail, which stays exactly as-is) — shown only once
`report.cvssBaseScore` is non-null, i.e. only once an organization has actually attached
CVSS metrics while setting severity. A report with no CVSS metrics (the large majority,
since CVSS is optional per 0061's original design) shows nothing new at all — no "CVSS
not yet assessed" placeholder, matching this codebase's existing discipline of never
displaying an absent-value placeholder for optional data (the same reasoning
`researcherBiography`'s conditional render already uses two sections above it on the
same page).

Shown: the base score itself (e.g. "7.5 — High"), and the six human-readable base metrics
(Attack vector, Attack complexity, Privileges required, User interaction, Scope, and the
three impact metrics summarized as one line) — giving the researcher the same real,
standardized justification for their severity rating that FIRST.org's CVSS specification
exists to provide, rather than a bare unexplained number.

## What does NOT change

- `confirmed_severity` remains the sole value any authorization/bounty/reputation logic
  reads — this is a pure additional read-side display, not a new input.
- No new RPC, no new column, no new migration — `getReport()` already returns everything
  needed.
- The organization-side `SeverityControl` CVSS line is untouched.
- CVSS stays exclusively organization/triager-set — a researcher still cannot self-assign
  or influence the CVSS metrics in any way, only read the ones an organization already
  attached to their own report. This matches Bugcrowd's own model exactly (per the
  feature-parity research: "The CVSS score is not visible to researchers" — Bugcrowd's
  policy is TO researchers being read-blind; this document's own choice is the opposite,
  read access without write access, which is a deliberate, narrower exposure than
  HackerOne's fully researcher-facing CVSS calculator).

## Severity-to-qualitative-rating mapping

FIRST.org's own published CVSS v3.1 qualitative severity rating scale, reused verbatim
(not invented): None (0.0), Low (0.1–3.9), Medium (4.0–6.9), High (7.0–8.9), Critical
(9.0–10.0). Displayed alongside the numeric score so a researcher unfamiliar with the raw
0–10 scale still gets an immediately readable label.
