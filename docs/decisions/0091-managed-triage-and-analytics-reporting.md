# 0091: Managed Triage and Analytics & Reporting

Status: accepted (2026-10-29). Migrations `202610290008_managed_triage.sql`, `202610290009_analytics_reporting.sql`.

## Managed Triage

Organizations buy triage done by Unpatched's own analysts, the service Bugcrowd and Intigriti
sell as their core offer and HackerOne sells as an add-on.

**Buying it.** An owner or security admin picks a plan (Standard: first response 24h, triaged
72h; Priority: 4h / 24h) and a currency on `/organizations/:id/managed-triage`. A platform admin
activates it on `/platform/managed-triage`, which charges the first month to the prepaid
balance; activation is refused if the balance can't cover it. The worker checks hourly and renews
each subscription once a month; a renewal the balance can't cover sets `past_due`, which stops
analyst access until an admin adds funds and resumes. Cancelling stops access immediately (the
current month is not refunded; the UI says so before confirming).

**Money is a real ledger entry.** `organization_service_charges` rows count in
`private.organization_balance` (as spent) and appear in the wallet statement, so the existing
"statement closes on the balance" invariant still holds. Charges take the same per-organization
advisory lock as awards, so a charge and an award can't spend the same money.
*Not done:* GST/tax invoices for service charges. Fee invoices (`issue_invoices_for_period`)
are built from payment obligations; a service-charge invoice line needs its own design.

**Analysts are platform staff**, added by a platform admin by email (`triage_analysts`), must not
belong to any organization, and only count on an MFA-verified session (the same bar as
`is_platform_admin`). They get one navigation entry, the triage queue (`/triage`).

**Access is one function.** `private.is_program_triager` now also returns true for an analyst
on any program of an organization with an *active* subscription. Every existing triage path
(reading the report and its evidence and messages, status transitions, duplicate marking,
severity/CVSS, researcher messages, internal notes, retests) works for analysts with the same
checks, audit rows and notifications, with no copy of that logic. Money never does: bounty
finalization, adjustments, bonuses and payouts go through `lock_and_authorize_report_for_finance`
and payment roles, which analysts don't pass. The report page also hides the organization's
integrations (Jira, GitHub/GitLab, ServiceNow) and disclosure decisions from analysts; the
database still allows a program triager to use those, which is accepted (they are triage-scoped)
but noted.

**Workflow added on top.** Claim/release/take-over (queue management), a validation assessment
(reproduced / not reproduced / needs information / out of scope, suggested severity, possible
duplicate, notes), and customer escalation (one open question per report; reason + question;
the organization's owners, security admins and program team are notified; their answer
notifies the analyst). Assessments and escalations are internal: the report's triage team reads
them, the researcher never does. Every action is an `audit_logs` row, so it shows in the
organization's audit log. The queue sorts by the nearest unmet plan SLA (first response, then
triage), counted from submission or activation, whichever is later; the organization page
shows on-time rates against the plan.

## Analytics & Reporting

**One dataset.** `list_organization_report_facts(org, from, to, programs, severities, statuses,
assets)` returns one row per report, built on the existing `private.report_response_timings`,
with the same readers and program scoping as the response-time metrics (owners and security
admins everywhere, program managers their programs; billing admins and triagers never).
`lib/analytics/report-metrics.ts` computes every KPI from those rows, and the page, the CSV, the
Excel workbook and the PDF all use it, so screen and files can't disagree.

Definitions: MTTA = median submission to first response; MTTR = median submission to
*resolved*; SLA compliance = met / (met + missed) checkpoints (first response, triage,
resolution) from each program's published policy, still-running checkpoints not counted;
validity = accepted or resolved over closed; asset coverage = in-scope assets with at least one
report in the period over in-scope assets (narrowed by the program and asset filters); program
health = 100 minus up to 40 for missed SLAs, 30 for open reports older than 30 days, 30 for
open critical/high. Money is never summed across currencies.

**Explore & export** (`/organizations/:id/analytics/explore`): workspace, date range (presets
or custom), program, severity, status and asset filters as a GET form (shareable URLs, removable
filter chips); KPI tiles; severity trend; MTTA trend; status; program health, researcher
performance, asset coverage and report tables. The existing Overview tab and its latency budget
are unchanged (one link row added, no queries).

**Exports.** CSV (report rows, BOM, formula-injection safe), Excel (Summary, Reports, Severity
trend, Program health, Researchers, Assets; a minimal OOXML writer on `fflate`, now a direct
dependency) and a PDF executive report (headline numbers, severity and volume charts, program
health, researchers, assets; a small PDF writer using the standard fonts, no PDF library).

**Scheduled exports** (`/organizations/:id/analytics/schedules`): weekly (Mondays 07:00 UTC,
previous week) or monthly (1st, previous month) for the current filters. The worker claims due
schedules (advanced in the same statement, so a slot runs once even with several workers), builds
the file *as the person who scheduled it* so the database re-checks their access each run (lost
access stops the schedule), stores the file in the database (kept 90 days; exports are small,
which also keeps object storage out of the worker), and emails that person a link that requires
signing in. No report data is in the email. Recipients are only the creator; adding other
members is a follow-up.
