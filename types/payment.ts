/**
 * A finalized bounty decision is not a payment. payment_obligations is the financial
 * snapshot derived from exactly one finalized report_bounty_decisions row; payment_attempts
 * is that obligation's payout attempt history. Neither table is ever read by, nor writes
 * to, report_bounty_decisions. See docs/decisions/0014-payment-ledger-and-payout-orchestration.md.
 *
 * pending: created, no attempt yet. processing: an attempt is in flight. succeeded:
 * terminal -- paid. failed: a resting state, not terminal -- a new attempt may retry it.
 * cancelled: terminal -- an authorized actor decided no payout will occur.
 */
export type PaymentObligationStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled";

/**
 * requires_operator_action is the manual provider's only honest non-terminal state: it
 * never claims success until an explicit operator action records one. succeeded/failed
 * are terminal for the attempt (not necessarily for the obligation, which may retry after
 * a failed attempt). A future async-provider state (e.g. provider_pending) does not exist
 * yet -- nothing in this slice can produce it; see the migration's own note.
 */
export type PaymentAttemptState = "requires_operator_action" | "succeeded" | "failed";

/** No organizationId/programId/researcherId -- the caller already has these from the
 * report context, the same minimal shape ReportBountyDecision already established. */
export type PaymentObligation = {
  id: string;
  reportId: string;
  /** Who this obligation is owed to: the submitter or a collaborator (split, 202610060008). */
  researcherId: string;
  bountyDecisionId: string;
  /** The finalized bounty -- the researcher receives all of it. The organization pays this
   * plus platformFeeMinorUnits (db/migrations/202609250010). This
   * is what the org confirmed and what docs/decisions/0077's org spend analytics reads;
   * it is never reduced by the fee. */
  amountMinorUnits: number;
  /** Billed to the organization ON TOP of the bounty, never deducted from the researcher.
   * Frozen at obligation-creation time (see db/migrations/202609250001_platform_fee_on_
   * payouts.sql) -- a later change to the platform's fee rate never retroactively alters
   * an obligation that already exists. */
  platformFeeMinorUnits: number;
  currency: string;
  status: PaymentObligationStatus;
  createdAt: string;
  updatedAt: string;
};

/** Manager-facing only -- RLS never grants a researcher a row of this table at all (not
 * merely a redacted column), since failure_code/failure_message/provider_reference_id are
 * internal operational detail. */
export type PaymentAttempt = {
  id: string;
  paymentObligationId: string;
  attemptNumber: number;
  provider: string;
  state: PaymentAttemptState;
  requestedAmountMinorUnits: number;
  currency: string;
  providerReferenceId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};
