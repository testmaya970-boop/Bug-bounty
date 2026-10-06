# 0084 — Disclosure lifecycle and reputation integrity

Status: accepted (2026-10-06) · Migrations: `202610060012_disclosure_lifecycle.sql`,
`202610060013_reputation_integrity.sql`

## Disclosure

- **Only resolved reports** can be disclosed (previously any terminal report, rejected
  included), and only if the governing program policy allows it: the version the report
  was submitted under, else the program's current one. `none` refuses; `coordinated`
  schedules publication `disclosure_days` after the report was first resolved; `full` (or
  no policy) publishes on approval.
- **Write-up, not the report.** The researcher proposes a title and write-up with the
  request; the program's triage team can redact it, and the researcher can edit it while
  it is pending. Approval snapshots that text and the severity at that moment. Nothing
  else from the report is ever published.
- **Scheduling without a job.** `published_at` may be in the future; every public read
  filters `published_at <= now()`.
- **Unpublish** (owners, security admins, the program manager) requires a reason, is
  audited and notified; the researcher may ask again afterwards. A report with an approved
  disclosure must be unpublished before a retest may reopen it.
- **Public reads only through RPCs** (`list_public_disclosures`, `get_public_disclosure`),
  which carry no user ids. The direct anon read of `report_disclosures`, which exposed
  requester/decider ids, is revoked. The researcher is credited only via an opted-in
  public username.
- Approve/decline/unpublish refuse the report's own researcher and collaborators.

## Reputation

- **The ledger stays append-only.** Repeated facts already existed (one seeded report had
  38 `report_resolved` rows), so integrity is enforced in two places instead of by deleting:
  - read side — `private.effective_reputation_facts` counts each (report, fact type) once,
    its first fact, with the severity frozen then;
  - write side — the recorders return the report's existing fact for that outcome.
  This also makes resolve → reopen → resolve count once.
- **Provenance from history.** A fact is recorded if the report ever reached the outcome
  (audit row), not only if that is its current status, so a reopen can't lose a fact.
- **One scoring rule** (`private.reputation_fact_points`) for score, leaderboard, position,
  profile and badges: resolved by severity (critical 50, high 35, medium 25, low 15, none 5),
  non-zero bounty +10, rejected −5, not applicable −2, duplicate/informative 0, CTF solve +2.
  These weights are a product judgement and can be tuned in one place.
- Suspended/deactivated researchers are excluded everywhere; a score is only answered for
  yourself or an opted-in public profile; CTF event boards show non-opted-in solvers as
  "Anonymous researcher".
- Badges count distinct reports and the frozen severity; Prolific counts valid submissions
  only; new **High Signal** badge (valid share of decided reports, after 5 decisions).

## Not done here

- No platform-level review of suspicious outcomes (an organization resolving a friend's
  reports is not detected beyond the collaborator/self-dealing guards).
- The global CTF "practice ranking" remains a labelled preview; only event boards are real.
