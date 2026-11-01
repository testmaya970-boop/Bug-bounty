# 0012: Report resolution and classification — the final decision is already the status; two new integrity rules make it trustworthy as a future bounty input

Date: 2026-08-28
Status: Accepted

## The primary question this slice had to answer: is classification a new field?

No. `DOMAIN.md`'s own words: *"Alternative terminal outcomes are `DUPLICATE`, `INFORMATIVE`, `NOT_APPLICABLE`, and `REJECTED`."* Terminal outcome and classification are the same concept in this domain — a report's `status` reaching one of these four values **is** the organization's classification decision, exactly as `RESOLVED` **is** the decision that the report was valid and addressed. Adding a second `classification` column that mirrors `status` would create the identical concept in two places, with no mechanism keeping them in agreement — exactly the redundancy the task warned against. No new column was added.

This is a different concept from `DOMAIN.md`'s *other* use of the word "classification" in its Reports field list (*"title, classification, affected asset, description, ... severity/CVSS, status, ..."*), which names a **vulnerability-type taxonomy** (XSS, SQLi, IDOR, CWE id) as a distinct, future field. `0008` already deferred that taxonomy explicitly ("the task explicitly forbids inventing a taxonomy"), and this slice does not revisit that deferral — it remains out of scope, for the same reason. Two different things share an English word here; only one of them is this slice's subject, and this ADR uses "classification" throughout to mean the terminal-status sense, matching how this task's own prompt used it.

## Is `resolution_summary` sufficient?

Yes. `DOMAIN.md` names "resolution" once, as a single concept in a report's field list, with no sub-structure. `resolution_summary` (added in `0009`) already answers "what was the organization's final decision" in the one way `DOMAIN.md` actually asks for — a required, length-bounded narrative, set exactly once (the `resolve_report` RPC requires it and only that RPC writes it), never overwritable after (no update path exists, and `resolved` is terminal). Adding `resolution_reason`/`resolution_type`/a `resolution` JSON blob would be inventing structure `DOMAIN.md` does not name. No new field was added.

## Severity becomes fixed once a report reaches a terminal state — the one genuinely new rule this slice adds

`0009` made `confirmed_severity` mutable at any status, reasoning correctly that nothing in `DOMAIN.md` restricted re-assessment *during* triage. This slice adds one constraint `0009` did not need yet: **`set_report_severity` now rejects (`SEVERITY_LOCKED`) once the report has reached any terminal state** (`resolved`, `duplicate`, `informative`, `not_applicable`, `rejected` — checked generically, as "no outgoing row exists for this status in `private.report_status_transitions`," not a hardcoded list, so it can never drift from the actual transition table). This is not stated verbatim in `DOMAIN.md`; it is a considered default justified by this task's own explicit "10× future economics" requirement: *"The eventual bounty engine must be able to consume ... confirmed severity ... without rewriting the report schema."* A bounty calculation that reads `confirmed_severity` after a report is finalized must be able to trust that value never quietly changes out from under it later — the same principle `DOMAIN.md`'s "Reputation and financial integrity" section already states for money (*"never one mutable browser-controlled value"*), applied one step earlier in the pipeline to the fact a future payout decision will be computed from. Every prior severity change remains fully reconstructable from `audit_logs`' existing `report.severity_set` events (`previous_severity`/`new_severity` per change) — no new history table was needed for this either.

## Duplicate semantics: same-program/self-duplication rules are unchanged; reciprocal cycles are now prevented

`0009`'s rules stand: same-program required, self-duplication rejected, the target's own status unrestricted (`DOMAIN.md` never requires a duplicate's target to already be in a specific state, and inventing that requirement now would still be inventing it). This slice closes one gap `0009` did not need to close yet: nothing previously prevented report A being marked a duplicate of report B while B was *also* marked a duplicate of A — a logically incoherent reciprocal relationship. `mark_duplicate` now also locks the target report row (`FOR UPDATE`, in addition to the source row `private.lock_and_authorize_report_for_triage` already locks) and rejects if the target is already recorded as a duplicate of the source. A longer transitive cycle (A→B, B→C, C→A) is not detected by this check — closing that fully would need either a recursive query on every write or a deferred constraint trigger, disproportionate to what this foundation slice actually needs; disclosed as a remaining risk, not silently assumed solved.

Genuinely concurrent reciprocal attempts (two managers, at the same instant, calling `mark_duplicate(A, B)` and `mark_duplicate(B, A)`) can deadlock at the database level (each holds one row and waits for the other) — Postgres's own deadlock detector aborts one side with `deadlock_detected` (`40P01`); this is caught and re-mapped to the same safe `INVALID_DUPLICATE_TARGET` message family rather than leaking a raw Postgres error, verified live under genuine concurrency (see the engineering report).

## No reopening — `DOMAIN.md` says so directly

*"Terminal outcomes have no arbitrary exit transition."* This is not domain silence to fill in; it is an explicit rule. No `reopen_report` operation was built, and none of `private.report_status_transitions`' rows point away from a terminal state. If a future slice needs reopening, it needs its own `DOMAIN.md`-level decision first, then a named, audited, authorized operation — never a generic status setter retrofitted onto this one.

## Authorization: unchanged, reused, not re-invented

Every RPC touched in this slice (`set_report_severity`, `mark_duplicate`) keeps `0009`'s exact authorization shape — the two-path manager check via `private.lock_and_authorize_report_for_triage` (owner/security_admin oversight, or a `program_members` row for that program). No new role distinction was introduced; the same disclosed `0004`/`0009` gap (org-level Program Manager/Triager roles have no assignment mechanism yet) applies identically here, not newly.

## Immutability boundary, restated precisely

Always immutable, unchanged since `0008`: `researcher_id`, `program_id`, `organization_id`, `title`, `description`, `target`, the scope snapshot. Immutable **after being set once**, unchanged since `0009`/`0010`: `resolution_summary`, `duplicate_of_report_id` (each written by exactly one terminal transition, never revisited). Immutable **after the report becomes terminal**, new in this slice: `confirmed_severity`. Deliberately still mutable regardless of report status, unchanged since `0010`: communication (`report_messages`) and evidence (`report_evidence`) — `0010` already decided communication is supporting data decoupled from report state, and nothing in `DOMAIN.md` says a researcher or organization must stop being able to add a closing remark or supporting artifact once a report is resolved; retroactively cutting that off now would be a new, undiscussed restriction, not a continuation of an existing one.

## Program and researcher lifecycle: unchanged, re-verified, not re-decided

`0009` already established triage (including reaching a terminal state) is not gated by program lifecycle, and a suspended/revoked researcher's historical report remains fully processable by the organization (read-vs-act was already the operative distinction, applied to the researcher's own actions only). This slice does not change either rule; it re-verifies both still hold with the two new checks in place (severity lock, duplicate-reciprocal check) — confirmed live.

## Researcher and organization visibility: unchanged

A researcher already sees status (with its plain-language meaning), `confirmed_severity`, `resolution_summary`, and the duplicate-of link where applicable (`0009`), and never sees the raw `audit_logs` trail or which specific staff member made a decision (manager-facing context, per `0009`'s existing reasoning — a "decision actor" is not withheld by omission, it is a deliberate confidentiality boundary already decided and unchanged here). Nothing in this slice narrows or widens either boundary.

## UI: the existing "Triage decision" card relabels itself once a report is terminal, rather than a fifth permanent card

`DESIGN.md`'s density and no-empty-decoration rules argue against a permanent, usually-empty "Final decision" card sitting beside an equally permanent "Triage" card for the common in-progress case. Instead, the same card that already shows status/severity/resolution/duplicate-of reframes its own eyebrow label from "Triage decision" to "Final decision" once `status` has no legal outgoing transitions (the identical predicate `TriageActionPanel` already uses to decide whether to show any action buttons at all — one source of truth, not two), and the severity control becomes a plain read-only value instead of an editable one at that point, matching the database's own new enforcement rather than presenting an interactive control that would only ever error.

## Future bounty input boundary (10× future economics)

A future bounty/payment slice can read, per report, without any report-schema change: `status` (classification and finality — terminal, and which terminal outcome), `confirmed_severity` (frozen once terminal), `resolution_summary` (the narrative decision), the scope snapshot (`0008`), and the full `audit_logs` history filtered to that report (who did what, when, including every severity change and the final decision's own actor and timestamp). Nothing about this slice's additions changes any existing column's type or meaning — only two new rejections (`SEVERITY_LOCKED`, the reciprocal-duplicate case) were added, both fail-closed, neither altering what a successfully-written row means.

## Deferred, explicitly

Reopening (`DOMAIN.md` forbids it), a vulnerability-type classification taxonomy (`0008`'s deferral, unchanged), transitive (3+ node) duplicate-cycle detection, CVSS calculation, bounty/payment/reputation/notification/disclosure/AI/search/analytics/integration — all named out of scope by the task.
