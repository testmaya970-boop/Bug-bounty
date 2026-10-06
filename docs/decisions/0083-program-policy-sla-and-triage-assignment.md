# 0083 — Program policy, SLAs, report assignment, and the one reopen path

Status: accepted (2026-10-06) · Migrations: `202610060009_program_policies_and_sla.sql`,
`202610060011_report_assignment_and_triage.sql`

## Program policy

- `program_policy_versions` is append-only (only `superseded_at` may change; a trigger refuses
  edits and deletes), one effective version per program — the same shape as the bounty policy
  (0013). A version holds rules of engagement, a safe-harbor commitment (to the platform's
  `/safe-harbor` terms), a disclosure policy (coordinated + days / full / none) and optional
  SLA targets (first response h, triage h, resolution d).
- Published by owners, security admins or the program's manager (the existing lifecycle
  authorization), audited as `program.policy_published` with the version.
- Visible before anyone joins: signed-out public program pages, the joined researcher's
  program page (which also shows the description again) and the report form.

## Acknowledgement is enforced by the database

Every report is bound at insert to the effective version (`reports.policy_version_id`). The
insert trigger refuses the report (`POLICY_NOT_ACKNOWLEDGED`) unless the transaction-local
`app.acknowledged_policy_version` equals that version. `services/reports.ts submitReport` sets
it in the same transaction as `submit_report`, so a policy republished between page load and
submit is refused, not silently bound. Programs without a policy need no acknowledgement.
Anything else that inserts reports (seed scripts) must set it too.

## SLA

`private.report_sla` measures each report against the targets of the version it was submitted
under: first response = first researcher-visible organization message or any triage/outcome
action; triage = first `report.triage_started`; resolution = first terminal action. An unmet
target past due counts as breached. Shown on the report page and as per-program missed counts
in org analytics. Reports submitted before a policy existed have no targets.

## Assignment

`reports.assignee_id`, set by `assign_report` by anyone who may triage the report. Assignable
people are exactly those who could triage it themselves (org owners/security admins and the
program's team) and never the report's researcher or a collaborator. Audited and notified
(self-assignment notifies nobody). An assignee who loses access is unassigned automatically
(audited with no actor, reason `access_lost`). Queues filter by Me / Unassigned / person.

## Retests, mediations, reopen

- Retests and mediations are decided by the program's whole triage team (previously managers
  only), through the same triage authorization, so never by the report's own researcher.
- **There is no free-form reopen.** A retest decided *still vulnerable* returns the resolved
  report to *accepted* (`report.reopened`). The status machine is unchanged — `resolved` stays
  terminal for severity, disclosure, bounty and mediation checks — and the exception lives
  only for that statement (`app.reopening_report`). A report with an approved public
  disclosure must be unpublished first. The bounty is untouched by a reopen.
- Notifications: assignment → assignee; retest requested / mediation opened → the triage team;
  retest decided / mediation answered / reopened → the researcher.

## Not done here

- No SLA sort or SLA column in queues yet (rows would need per-report audit lookups).
- The program Inbox (split view) has no filters; assignment filters are on Reports and Findings.
