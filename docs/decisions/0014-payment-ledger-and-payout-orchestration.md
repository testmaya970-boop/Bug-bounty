# 0014: Payment ledger & payout orchestration — a financial state machine behind a provider-neutral adapter, no provider integration

Date: 2026-08-29
Status: Accepted

## Context and the boundary this slice draws

`0013` deliberately stopped at `report_bounty_decisions.state = 'finalized'` — a bounty decision, not a payment. This slice builds what sits between that decision and an eventual real payout: `Final Bounty Decision → Payment Obligation → Payment Attempt(s) → (Provider Transaction) → Settlement → Audit`. `report_bounty_decisions` is never altered by this migration — not one column added, not one row ever updated by any function in it. No Stripe, Razorpay, PayPal, bank API, or cryptocurrency integration exists here; the goal is the internal domain and the adapter seam a real provider would later plug into.

## Research: how serious platforms and payment-system design separate these concepts

HackerOne/Bugcrowd/YesWeHack documentation and general payment-system references converge on a small set of mechanics:

- **A payout decision and a payout transaction are different records.** The decision (what is owed) rarely changes once made; the transaction (whether it was actually paid) has its own lifecycle, retries, and failure modes. Adopted directly as `payment_obligations` (the decision-derived snapshot) vs. `payment_attempts` (the transaction history).
- **Idempotent payment creation is two separate problems**, not one: (1) never create two internal records for the same source event, and (2) never cause a payment provider to move money twice for what Sentinel considers one attempt. Adopted as two independently-enforced mechanisms — see "Idempotency" below.
- **Payment state machines keep "terminal" states genuinely terminal** (a succeeded charge is never un-succeeded without a distinct refund/reversal domain) but keep failure **retryable** by default, since most real payout failures (wrong account details, temporary provider outage) are correctable, not permanent. Adopted: `succeeded`/`cancelled` are the only truly terminal obligation states; `failed` is a resting state a new attempt can retry.
- **Provider webhooks are asynchronous and must be idempotent**, resolved via a provider-supplied reference id mapped back to an internal record, never trusted at face value without signature verification. Documented as a future extension point (§ "Webhook boundary" below); not implemented, since no real provider exists to send one.
- **Reconciliation exists because a database transaction cannot atomically span an external provider.** Documented as a disclosed, deferred gap (§ "Reconciliation" below) rather than pretended away.
- **Monetary amounts are always integer minor units with an explicit currency.** Continued unchanged from `0013` — `lib/money.ts` is reused as-is.

## Architecture

```text
Final Bounty Decision (report_bounty_decisions, state='finalized')
        ↓  create_payment_obligation (copies amount/currency once, under a lock)
Payment Obligation (payment_obligations: pending/processing/succeeded/failed/cancelled)
        ↓  initiate_manual_payment_attempt (hardcodes provider='manual')
Payment Attempt(s) (payment_attempts: requires_operator_action/succeeded/failed)
        ↓  record_manual_payment_result (the ONLY path to succeeded/failed)
Settlement (= the attempt's/obligation's own 'succeeded' state; no separate table -- see below)
        ↓
Audit (audit_logs, entity_type='report' -- reused, not a new ledger table)
```

`services/payments.ts` (the domain) never imports a provider SDK — it imports only `lib/payment-provider.ts`'s `PaymentProvider` interface and the currently-active implementation, exactly mirroring `lib/evidence-store.ts`'s `EvidenceObjectStore` seam from `0011`. "Provider Transaction" is not a fourth table: `payment_attempts` rows already carry `provider`, `provider_reference_id`, and state — a real async provider would populate the same columns via the same shape, not a parallel structure. "Settlement" is not a fifth table either: nothing in this manual-only slice needs to distinguish "attempt succeeded" from "funds settled" as separate facts; a future async-provider slice that needs its own reconciliation trail can add one without altering this shape (see "Reconciliation").

## State machine

**`payment_obligations.status`** (five states, all reachable by this slice's own RPCs):

```text
pending  -----------------> processing  -----------------> succeeded  (terminal)
  |         initiate               |         record result
  |                                └-------------------------> failed  (retryable, not terminal)
  |                                                              |
  └---------------------------------> cancelled (terminal) <-----┘
                cancel (legal only from pending/failed)
```

`processing` cannot be cancelled directly — an in-flight attempt must resolve (succeed or fail) first, so an obligation is never cancelled out from under an attempt an operator believes is still running. `succeeded` has no exit — no refund/reversal domain exists in this slice, so it is unconditionally terminal, per the task's own requirement. `failed` is deliberately **not** split into "retryable" vs. "permanent" sub-states: deciding a payout will never be retried is an operational judgment call an authorized actor makes explicitly, by cancelling — the system does not infer it.

**`payment_attempts.state`** (three states — deliberately not five):

```text
requires_operator_action  --->  succeeded  (terminal for this attempt)
                          --->  failed     (terminal for this attempt; the obligation may get a new attempt)
```

`provider_pending` (an async provider's "submitted, outcome not yet known" state) is **not** included in the check constraint. Nothing in this slice can ever produce it — only the manual provider exists, and its `createPayment` always returns synchronously. Adding it now would be exactly the "state that sounds useful" anti-pattern the task warns against; a future async-provider slice adds it in its own migration, the identical precedent `202608270004` already set for `report_evidence_type`'s `'file'` value arriving in its own migration ahead of the constraint that uses it.

## Database

Two new tables. `payment_obligations`: `organization_id`/`program_id`/`report_id`/`researcher_id`/`bounty_decision_id`/`amount_minor_units` (bigint, `> 0`)/`currency` (ISO-shape-checked)/`status`/timestamps. `payment_attempts`: `payment_obligation_id`/`attempt_number`/`provider`/`state`/`requested_amount_minor_units`/`currency`/`provider_reference_id`/`failure_code`/`failure_message`/`started_at`/`completed_at`. A shape check constraint on `payment_attempts` enforces exactly one valid column combination per state (mirroring `0013`'s `report_bounty_decisions_shape_check`). Composite FKs: `(report_id, program_id, organization_id) → reports(id, program_id, organization_id)` (reusing `0010`'s constraint); `(report_id, researcher_id) → reports(id, researcher_id)` (new — added by this migration specifically so a payment obligation's researcher can never be substituted); `(bounty_decision_id, report_id) → report_bounty_decisions(id, report_id)` (new — so a decision from a different report can never be attached). `payment_obligations.bounty_decision_id` is `unique` — the one-to-one invariant, enforced by Postgres, not application code. RLS is enabled on both tables with no service-role-only tables left unprotected.

## Authorization

Every payment mutation reuses **narrow** finance authorization — `has_org_role(organization_id, ['owner','security_admin'])` only, the identical predicate `0013` established for `finalize_bounty`/`adjust_bounty`, extended via a new obligation-keyed sibling helper (`private.lock_and_authorize_obligation_for_finance`) for every RPC keyed by obligation/attempt id rather than report id. No new role or capability was invented; `billing_admin` gains nothing here, consistent with `services/authorization.ts`'s existing, explicit "billing capabilities are intentionally not implemented" note.

| Action | Who |
|---|---|
| Create a payment obligation | Org Owner / Security Admin only |
| Initiate (or retry) a payout attempt | Org Owner / Security Admin only |
| Record a payout attempt's result | Org Owner / Security Admin only |
| Cancel a payment obligation | Org Owner / Security Admin only |
| View an obligation's aggregate status | The obligation's own researcher, org oversight, or a program manager |
| View attempt-level detail (failure code/message, provider reference) | Org oversight or a program manager only — never the researcher |

Committing to a payment obligation, and especially initiating a real payout attempt, is at least as sensitive as finalizing a bounty — never less. A `program_members` manager who is not also an org owner/security admin can see that a payout is pending (a report-scoped visibility read every studied platform grants staff), but cannot create, initiate, record, or cancel one.

## Financial invariants (database-enforced unless noted)

- `amount_minor_units > 0` / `requested_amount_minor_units > 0` — check constraints.
- Currency is copied from the finalized decision, never a client parameter — `create_payment_obligation` takes only `target_report_id`.
- Report belongs to program belongs to organization — composite FK.
- Obligation's researcher matches the report's researcher — composite FK (new).
- Obligation's bounty decision belongs to the same report — composite FK (new).
- Duplicate obligations impossible — `unique(bounty_decision_id)`, proven under concurrency (below).
- Client cannot choose amount/currency/researcher/organization/bounty-decision-id — none of these are RPC parameters.
- **RPC-enforced, not schema-enforced** (Postgres cannot express a conditional/partial foreign key): only a `state = 'finalized'` bounty decision may create an obligation; a decision finalized at exactly zero cannot (`NOTHING_TO_PAY` — nothing to pay out). Both are checked under the same row lock that also guards the duplicate-obligation check, so the check cannot race a concurrent `finalize_bounty`/`adjust_bounty`/`create_payment_obligation` call.

## Idempotency — two separate problems, solved at two separate layers

1. **Sentinel payment-obligation idempotency**: at most one obligation per finalized bounty decision (`unique(bounty_decision_id)` plus a pre-check performed under a row lock on the decision), and at most one in-flight attempt per obligation (`initiate_manual_payment_attempt` rejects with `PAYMENT_ALREADY_PROCESSING` while `status = 'processing'`). Both are real database guarantees, proven under genuine concurrency below — not "the button is disabled."
2. **Provider-operation idempotency**: a real provider's `createPayment` call, if retried by a flaky network or a service restart, must not create two provider-side charges. `lib/payment-provider.ts`'s `PaymentProvider.createPayment` accepts an `idempotencyKey` — the Sentinel-generated `payment_obligations.id` — that a real adapter must forward to the provider's own idempotency mechanism (every provider surveyed supports one). The manual provider has no external system to call and therefore no real exposure to this problem, but the interface signature already carries the key so a future real adapter's signature never has to change.

## Concurrency

Two genuinely concurrent `create_payment_obligation` calls against the same finalized decision: the second blocks on the decision row's `for update` lock held by the first, then re-reads and finds the obligation the first transaction already committed, and is rejected with `OBLIGATION_ALREADY_EXISTS` — never two rows. Two genuinely concurrent `initiate_manual_payment_attempt` calls against the same obligation: the second blocks on `private.lock_and_authorize_obligation_for_finance`'s row lock, then re-reads `status = 'processing'` (set by the first) and is rejected with `PAYMENT_ALREADY_PROCESSING` — never two in-flight attempts. Verified live (see the engineering report's PostgreSQL verification section).

## RLS

`payment_obligations`: the obligation's own researcher (their own row only), org oversight, or a program manager. `payment_attempts`: org oversight or a program manager only — no `researcher_id` path exists in that policy at all, so a researcher is denied the entire table, not merely specific columns. A cross-tenant request gets `[]`, identical to a nonexistent id — the same existence-hiding convention every prior slice established.

## Researcher visibility

A researcher sees their own obligation's safe aggregate status — "Payment pending" / "Payment processing" / "Payment completed" / "Payment failed" / "Payment cancelled" — and the amount/currency they already see via the finalized bounty decision. They never see `payment_attempts` at all (no row is ever returned, not merely redacted columns), so failure codes, failure messages, provider reference ids, and who initiated/recorded/cancelled anything are structurally invisible to them, not just hidden by the UI.

## Provider abstraction and why adding Stripe/Razorpay later does not touch domain logic

`PaymentProvider` (`createPayment`/`getPaymentStatus`/`cancelPayment`) is the entire surface a real adapter must implement. `getPaymentStatus`/`cancelPayment` are declared but unused by any RPC in this slice — reserved for a future reconciliation slice and for cancelling a real in-flight provider-side payment respectively, neither of which this slice needs. Adding a real provider means: (1) a new `PaymentProvider` implementation in `lib/`, (2) a new `initiate_<provider>_payment_attempt` RPC (never a parameter added to the existing manual one — the same "no generic `initiate(provider)`" discipline `0009` already established for report status), and (3) a webhook route that authenticates the provider's signature and calls a to-be-written `record_<provider>_payment_result`-shaped RPC. `payment_obligations`, `payment_attempts`, every RLS policy, and every existing RPC are untouched.

## Webhook boundary (documented, not implemented)

```text
provider webhook → authenticate provider signature → resolve provider_reference_id to a
Sentinel payment_attempts row → verify the attempt is still requires_operator_action (or
its future async equivalent) → transition → audit
```

No route or verification code exists in this slice — there is no real provider to send a webhook, and implementing fake signature verification would be worse than not implementing it. The shape above is what a future real-provider slice must satisfy; it is idempotent by construction because it resolves to the same attempt-id-keyed transition guard `record_manual_payment_result` already uses (`ATTEMPT_ALREADY_RESOLVED` on replay).

## Reconciliation

Sentinel's database and a payment provider are two separate systems; no transaction spans both. `payment_obligations.status = 'processing'` while the provider's own record says something else (succeeded, failed, or doesn't exist) is a real, disclosed possible divergence this slice does not resolve automatically. For the manual provider this gap is inherent and acceptable — there is no external system to diverge from; the human who performs the transfer is also the one who calls `record_manual_payment_result`. A real async provider would need either scheduled reconciliation (poll `getPaymentStatus` for any attempt stuck in an in-flight state past a timeout) or, more robustly, the webhook path above. No reconciliation table or job exists yet; this is a named deferral, not a silent gap.

## Deferred, explicitly

Stripe/Razorpay/PayPal/bank/cryptocurrency integration, real payouts, a payment-provider webhook route, scheduled reconciliation, refunds/reversals (and therefore any state beyond `succeeded` being non-terminal), multi-attempt provider fan-out, a financial dashboard or transaction-history UI, researcher payout-method configuration (bank details, wallets), notifications, reputation, and anything else named out of scope by the task.

## Supabase/infrastructure coupling (portability)

This slice adds no new Supabase-specific coupling. `payment_obligations`/`payment_attempts`, their RLS policies, and every RPC live in plain PostgreSQL exactly like every other domain table in this codebase — this was already the system of record, not a new choice made here. The only new infrastructure-shaped file is `lib/payment-provider.ts`, which is explicitly the swappable seam (mirroring `lib/evidence-store.ts`) — it does not call any Supabase-specific payment feature, because none exists; there is nothing Supabase-specific to decouple from in the payment domain itself. DOMAIN (the state machine, invariants, RLS, authorization) is entirely Postgres; INFRASTRUCTURE (which concrete provider answers `PaymentProvider`) is entirely `lib/payment-provider.ts`, unchanged in shape regardless of which provider is active.

## Scale

All correctness guarantees (the one-to-one invariant, no double-initiation, idempotency-as-rejection) come from real database unique constraints and row locks (`SELECT ... FOR UPDATE`), never an in-process mutex, cache, or singleton. The design is correct under multiple concurrent application server instances/processes by construction, not by assumption.
