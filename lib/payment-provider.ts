import "server-only";

/**
 * The domain (services/payments.ts, payment_obligations/payment_attempts) knows only
 * "payment provider" -- never a concrete SDK. This is the entire surface a future real
 * provider (Stripe, Razorpay, Wise, bank transfer) would need to implement to replace
 * manualPaymentProvider below; nothing else in the codebase may import a provider SDK.
 * See docs/decisions/0014-payment-ledger-and-payout-orchestration.md.
 *
 * Two separate idempotency problems, solved at two separate layers:
 * 1. Unpatched payment-obligation idempotency (at most one obligation per finalized bounty
 *    decision, at most one in-flight attempt per obligation) is a real database unique
 *    constraint and row lock -- see the migration, not this file.
 * 2. Provider-operation idempotency (the same createPayment call retried by a flaky
 *    network must not create two provider-side charges/payouts) is this interface's job:
 *    every call is given a Unpatched-generated idempotencyKey (the payment_attempts row's
 *    own id, minted durably before the provider is ever called) that a real adapter must
 *    pass through to the provider's own idempotency-key mechanism (every provider
 *    surveyed -- Stripe, Razorpay -- supports one). The manual provider has no external
 *    system to call, so it does not need this guarantee itself, but still accepts the key
 *    so a real adapter's signature never has to change.
 */
export type PaymentProviderResult = {
  /** The provider's own transaction/reference id, or null if none exists yet (the manual
   * provider never has one, since nothing external was called). Metadata only -- never
   * the authoritative Unpatched identifier. */
  providerReferenceId: string | null;
  /** requires_operator_action: the manual provider's honest answer -- a human must act.
   * succeeded/failed: only ever returned by a provider capable of confirming a payout
   * synchronously; the manual provider never returns these -- see record_manual_payment_result. */
  outcome: "requires_operator_action" | "succeeded" | "failed";
};

export type PaymentProvider = {
  readonly name: string;
  /** Requests a payout. Must never claim `succeeded` unless the provider (or, for the
   * manual provider, a human) has actually confirmed it -- faking success here is the
   * exact failure mode this abstraction exists to prevent. */
  createPayment(input: { idempotencyKey: string; amountMinorUnits: number; currency: string }): Promise<PaymentProviderResult>;
  /** Polls the provider's own view of a payment it previously created. Reserved for a
   * future reconciliation slice (see 0014's "Reconciliation" section) -- not called by
   * any code path in this slice. */
  getPaymentStatus(providerReferenceId: string): Promise<PaymentProviderResult>;
  /** Best-effort cancellation on the provider's side. Not called by any code path in this
   * slice (cancel_payment_obligation only ever cancels a pending/failed obligation, which
   * by definition has no in-flight provider-side payment to cancel). */
  cancelPayment(providerReferenceId: string): Promise<void>;
};

/**
 * Exists only to prove the abstraction end to end without moving real money. Explicitly
 * represents "requires operator action" rather than faking success -- an authorized
 * finance actor must separately call record_manual_payment_result after actually
 * completing the payout themselves (e.g. a real wire transfer outside Unpatched).
 */
export const manualPaymentProvider: PaymentProvider = {
  name: "manual",

  async createPayment() {
    return { providerReferenceId: null, outcome: "requires_operator_action" };
  },

  async getPaymentStatus() {
    return { providerReferenceId: null, outcome: "requires_operator_action" };
  },

  async cancelPayment() {
    // No external call exists to cancel -- the manual provider never sends anything
    // anywhere. A future real adapter's implementation would call the provider's own
    // cancellation endpoint here.
  },
};

/** The active provider for this slice. Adding Stripe/Razorpay later means writing a new
 * PaymentProvider implementation and changing which RPC(s) the service layer calls --
 * this export, the interface above, and every table/RPC in the migration are unaffected. */
export const activePaymentProvider: PaymentProvider = manualPaymentProvider;
