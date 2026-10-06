# 0082 — Payout lifecycle: gates, splits, confirmation, recovery

Status: accepted (2026-10-06) · Migration: `db/migrations/202610060008_payout_lifecycle.sql`

## Context

The ledger (`report_bounty_decisions` → `payment_obligations` → `payment_attempts`, 0013/0014)
recorded awards and manual payouts, but a payout could start for a researcher with no
payout method or tax form, collaborator splits were stored and never paid, a cancelled
obligation blocked the award forever, nothing notified anyone about money, and org
analytics labelled finalized awards as "paid".

## Decision

- **Payout gate, in the database.** `initiate_manual_payment_attempt` refuses
  (`PAYOUT_NOT_READY`) until the recipient has a payout method, a **verified** tax form, and
  — when the program requires it — verified KYC (`private.payout_blockers`). Creating an
  obligation is still allowed: it records a debt, it moves no money.
- **Tax forms are reviewed by platform admins** (`review_tax_form`, queue on `/platform/kyc`).
  Before this, nothing could mark a form verified.
- **Splits are paid.** `create_payment_obligation` creates one obligation per recipient:
  each collaborator's `bounty_split_percent` (floored to the minor unit), the remainder to
  the submitter. Fee is 20% of each share. The FK that pinned `researcher_id` to the
  submitter is replaced by a trigger (submitter or collaborator only).
- **Recovery.** Uniqueness is one *live* obligation per (decision, recipient). Once every
  obligation on a bounty is cancelled, the amount can be adjusted and obligations re-issued.
  A paid obligation is never re-issued.
- **Researcher response.** The submitter confirms the current amount (`accept_bounty`;
  `bounty_acceptances` keyed to the amount, so an adjustment needs a new confirmation) or
  disputes it through the existing mediation (`disagree_with_bounty`). An open or escalated
  bounty dispute blocks creating obligations and starting payouts. Confirmation is not a
  precondition for payment.
- **Notifications** reuse the audit-log → outbox → router pattern (202609250007):
  `payment_scheduled/succeeded/failed/cancelled` and `bounty_adjusted` go to the
  obligation's recipient (mandatory, like `bounty_finalized`); `report_mediation_opened`
  goes to the organization.
- **Accounting.** The org spend summary reports awarded, paid (succeeded obligations) and
  outstanding separately.
- **Provider call order.** The attempt row is created first; the provider receives the
  attempt id as its idempotency key.

## Not decided here

- Who executes a manual transfer. The paying organization never sees payout destinations;
  only platform admins can. If payouts are run by the platform (consistent with the fee
  being billed to the org), the finance RPCs should move to platform staff — a product
  decision, not made in this change.
- Payout threshold and schedule are still stored but not consulted.
- Collaborators can't open the report's bounty card (the decision table's RLS excludes
  them); they follow their share on `/bounties` and by notification.
