# 0013: Bounty decision engine — versioned per-severity policy ranges, a calculated recommendation distinct from the final decision, no payment integration

Date: 2026-08-28
Status: Accepted

## Context and the boundary this slice draws

`DOMAIN.md` already states the invariant this slice exists to satisfy: *"Bounty decision, financial transaction, researcher balance, and payout remain separate concepts, never one mutable browser-controlled value."* A bounty is not a property of a report (`reports.bounty_amount` was never on the table) — it is the output of evaluating a report's frozen facts (severity, classification/status) against a program's bounty policy, which itself can change over time without altering decisions already made under an earlier version. This slice builds exactly that evaluation boundary and stops: no payment provider, no payout, no reputation, no negotiation infrastructure beyond the report communication system that already exists.

## Competitor research and what Sentinel adopts

Public program documentation from HackerOne, Bugcrowd, and YesWeHack converges on the same underlying mechanics, independent of each platform's own UI:

- **A reward is a range per severity tier, not a fixed number.** Staff pick a final amount within (or, for exceptional impact, outside) the published range. Adopted: `program_bounty_policy_severity_ranges` stores `min`/`max` per severity, and `finalize_bounty` accepts any non-negative amount — the range is a recommendation, never an enforced ceiling, because "exceptional reward" is a real, common, legitimate outcome on every platform studied.
- **Policy is scoped per program, not global.** Adopted directly — `program_bounty_policy_versions.program_id`.
- **Duplicate/Informative/Not-Applicable/Rejected reports are not bounty-eligible by default; a validated-and-addressed report is.** Adopted: eligibility is gated to `status = 'resolved'` specifically — the one terminal outcome `DOMAIN.md` already treats as "the organization has confirmed this finding was addressed," the same reasoning every platform researched uses to gate payment.
- **A program may simply offer no monetary reward at all (a pure disclosure program).** Adopted by omission: a program with no policy version has nothing to calculate against, and its reports are treated exactly like reports on any other terminal status until a policy is configured — no `bounty_enabled` boolean was needed.
- **Money is always integer minor units with an explicit currency, never a float.** Adopted directly (task-mandated and industry-universal).
- **Reward negotiation happens, but always resolves to one authoritative record.** Adopted: no new negotiation workflow was built — the existing `report_messages` communication system (`0010`) is already the right place for that conversation; the bounty engine only records the outcome.
- **Not adopted in this slice**: per-asset/per-scope-entry reward overrides (a real, deferred capability — nothing in this schema blocks adding a `program_scope_entry_id` column to the severity-range table later), CVSS-to-severity auto-mapping (task-forbidden and already deferred by `0009`), a formal researcher-acceptance/dispute workflow (deferred — see below), and multi-currency programs (one currency per policy version, deferred to a future slice if ever needed).

## First principle, restated as the actual data model

`REPORT FACTS` (frozen `status` and `confirmed_severity`, both already immutable post-finalization per `0012`) `+ PROGRAM POLICY` (`program_bounty_policy_versions`/`..._severity_ranges`) `+ ORGANIZATION DECISION` (`report_bounty_decisions`) `= BOUNTY DECISION`. Three tables, not one, precisely so a future payment system can consume the third without ever needing to re-derive it from the first two.

## Policy versioning: immutable versions, never edited in place

`program_bounty_policy_versions` rows are never updated after creation — `create_bounty_policy_version` always inserts a brand-new version (marking the program's previous effective version `superseded_at = now()` in the same transaction) rather than editing an existing one's ranges. `private.effective_bounty_policy_version(program_id)` reads the one row per program with `superseded_at is null`. A `report_bounty_decisions` row stores the exact `policy_version_id` it was calculated against (enforced by a composite foreign key to `program_bounty_policy_versions(id, program_id)`, so a decision can never reference a policy version belonging to a different program) — changing the program's policy afterward changes what a *future* calculation would produce, never what an already-calculated or already-finalized decision says. Verified live: after finalizing under Policy V1 (`High = 50000` minor units) and then creating Policy V2 (`High = 75000`), the V1 decision is unchanged and a fresh calculation on a different report correctly uses V2.

## The five severity tiers, not a new taxonomy

`program_bounty_policy_severity_ranges.severity` reuses `public.report_severity` (`none`/`low`/`medium`/`high`/`critical`, from `0009`) directly — the same taxonomy `confirmed_severity` already uses, never a second one. `create_bounty_policy_version` requires all five tiers' `(min, max)` explicitly, as ten plain numeric parameters (not a JSON array) — every tier is deliberately mandatory so eligibility logic never has to guess whether a missing tier means "not configured yet" or "the program pays nothing for this severity" (a program that pays nothing for `none`/`low` severity sets `min = max = 0` for those tiers explicitly, which is a real, recorded policy decision, not an absent one).

## Eligibility: computed once, stored as a durable fact — but only once the precondition facts genuinely exist

`calculate_bounty_recommendation` distinguishes two different kinds of "not ready yet": a **precondition** that is fixable and retryable (the report is not yet `resolved`; `confirmed_severity` has not been set) is a plain RPC rejection — no row is written, because nothing durable is true yet. A **permanent classification fact** (the report reached a terminal status other than `resolved`) is written as a real, stored `report_bounty_decisions` row with `state = 'ineligible'` and a safe, generic reason — permanent because `0012` already made every terminal `report_status` value immutable. This distinction keeps the table free of noise from retryable failures while still recording every genuine, final eligibility decision.

## Calculation is a recommendation; finalization is the actual decision

Exactly the architecture the task required: `calculate_bounty_recommendation` (broad triage authorization — any authorized manager/triager may request one, re-callable and overwritable as long as the decision has not yet been finalized) produces `state = 'calculated'` with a `min`/`max` range copied from the effective policy version. `finalize_bounty` (narrower authorization — organization Owner/Security Admin only, the same graduated authority `DOMAIN.md`'s existing role model already supports without inventing a new capability) is the only path to `state = 'finalized'`, requires a `calculated` decision to already exist, and accepts any non-negative amount — inside or outside the calculated range, so an exceptional reward is possible without lying about what the policy would have automatically produced.

## Immutability after finalization, and the explicit adjustment operation

Once `state = 'finalized'`, `finalize_bounty` called again is rejected (`BOUNTY_ALREADY_FINALIZED`) — idempotency-as-rejection, the identical choice `0009` made for report-status transitions and for the same reason: silently succeeding on a replayed call could mask a real client bug in a financial operation, where "did this get finalized once or twice" must never be ambiguous. Changing an already-finalized amount requires the separate, explicitly-named `adjust_bounty` operation (same narrow authorization, requires a non-empty reason, requires `state = 'finalized'` already), which writes the previous and new amounts into its own audit event rather than silently overwriting history — never a bare `UPDATE amount`.

## Money representation

Every amount is a `bigint` of integer minor units (cents, paise, etc.) with a separate `currency` column validated to ISO-4217 *shape* (`^[A-Z]{3}$`) — not validated against a real currency list, a disclosed, deliberate simplification matching `0011`'s "stored, not validated" treatment of content type. No floating-point arithmetic exists anywhere in this migration or its TypeScript layer; the calculation itself is a single, deterministic range lookup (`min`/`max` for one severity tier), not an arithmetic formula, so no rounding rule was needed — flagged for whichever future slice introduces percentage-based or formula-driven calculation.

## Concurrency and idempotency

Every bounty RPC locks the same `reports` row every other triage RPC already locks (`private.lock_and_authorize_report_for_triage` for the broad-authorization path; a new, narrower `private.lock_and_authorize_report_for_finance` for the Owner/Security-Admin-only path — same lock, stricter authorization predicate) — so two concurrent `finalize_bounty` calls on the same report serialize on that lock exactly like two concurrent triage transitions already do: the first commits, the second re-reads the now-`finalized` row and cleanly rejects. Verified live under genuine concurrency.

## Database invariants enforced by Postgres, not application code

A `report_bounty_decisions` row cannot reference another organization's or another program's report (composite FK to `reports(id, program_id, organization_id)`, the same tie `0010` established for messages/evidence) or another program's policy version (composite FK to `program_bounty_policy_versions(id, program_id)`). A check constraint enforces exactly one of the three valid shapes per `state` (`ineligible`/`calculated`/`finalized`), so a row can never claim to be finalized without a recorded amount, actor, and timestamp, or claim to be merely calculated while also having a final amount.

## Authorization

Policy configuration (`create_bounty_policy_version`) reuses the existing broad two-path program-management check (`has_org_role(['owner','security_admin'])` or `is_program_member`) — the same authority that already manages scope and triages reports. Calculating a recommendation reuses the identical broad check. Finalizing and adjusting a bounty require the narrower `has_org_role(['owner','security_admin'])` only — deliberately excluding a `program_members` manager who is not also an org owner/security admin, because committing an actual financial figure is a materially different, more sensitive action than triage, and `DOMAIN.md`'s own financial-integrity language singles out exactly this kind of decision for extra care. Billing Admin is excluded from every bounty operation and every bounty read, consistent with every other report-adjacent capability already denying that role.

## Researcher and organization visibility

A researcher sees their own report's full bounty decision (eligibility state, the ineligible reason if applicable, the calculated range, the final amount and currency once finalized) — this is their own report's outcome, the same transparency `0009`/`0012` already extend to status, severity, and resolution summary. A researcher does **not** see who specifically finalized or adjusted the amount (the same "decision actor is manager-facing context" boundary `0009` already drew for triage, applied identically here, not newly invented) — that remains visible to managers through the existing audit-based Decision History panel, extended with new `bounty.*` action labels rather than a second history mechanism. An active researcher may also read the program's *current* bounty policy (which severity pays what) — the same transparency every bounty program studied publishes to participating researchers, and the same widened-RLS pattern `0007` already established for active-researcher scope visibility.

## Payment boundary

Nothing in `services/`, `actions/`, or the database imports or references any payment provider SDK. `report_bounty_decisions.state = 'finalized'` plus its `final_amount_minor_units`/`currency`/`finalized_at` is the complete, stable contract a future payment service would consume — that service is explicitly not built here, and building it would only ever need to *read* this table, never restructure it.

## Deferred, explicitly

Payment provider integration (Stripe, Razorpay, bank payouts, cryptocurrency), payout/transaction/balance ledgers, researcher acceptance/decline/dispute workflow states, per-asset/per-scope-entry reward overrides, multi-currency policies, percentage- or formula-based calculation (and therefore rounding rules), an automated orphan/cleanup job, reputation, leaderboards, notifications, public disclosure — all named out of scope by the task.
