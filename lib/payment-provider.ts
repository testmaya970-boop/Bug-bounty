import "server-only";
import { randomUUID } from "node:crypto";
import { envGroup, hmacSha256Hex, providerFetch, safeEqual, sandboxAllowed } from "./integrations/common";
import { withServiceRoleTransaction, callRpc } from "./db/pool";

/**
 * The domain (services/payments.ts, payment_obligations/payment_attempts) knows only
 * "payment provider" -- never a concrete API. Every provider lives in this file, behind
 * this interface; nothing else may call a payout API. See
 * docs/decisions/0014-payment-ledger-and-payout-orchestration.md and
 * docs/integrations/provider-contracts.md (sources: the vendors' own docs).
 *
 * Routing is by currency, chosen by env:
 *   INR  -> PAYOUT_PROVIDER_IN     = manual | sandbox | razorpayx   (bank transfer, IMPS)
 *   else -> PAYOUT_PROVIDER_GLOBAL = manual | sandbox | paypal      (PayPal email)
 * "manual" (the default) is today's flow: a person pays outside Unpatched and records it.
 *
 * Idempotency: every call carries the payment_attempts row id, minted before the provider is
 * called, and each adapter passes it to the provider's own idempotency mechanism -- a retried
 * request can never pay twice. A provider's final word arrives by signed webhook only.
 */
export type PayoutRecipient = {
  name: string;
  email: string | null;
  method: "bank_transfer" | "paypal" | null;
  bankHolder: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  paypalEmail: string | null;
};

export type PaymentProviderResult = {
  /** The provider's id for this payout (metadata, never the authoritative Unpatched id). */
  providerReferenceId: string | null;
  /** requires_operator_action: a person must pay and record it (manual).
   * pending: the provider accepted it; its webhook will say succeeded or failed.
   * failed: refused before any money moved (e.g. no usable payout details). */
  outcome: "requires_operator_action" | "pending" | "failed";
  failureMessage?: string;
};

export type PayoutWebhookResult = { reference: string; outcome: "succeeded" | "failed"; failureCode?: string; failureMessage?: string };

export type PaymentProvider = {
  readonly name: string;
  readonly mode: "manual" | "sandbox" | "live";
  /** Requests a payout. Never claims success: only a webhook (or, manually, a person) can. */
  createPayment(input: { idempotencyKey: string; amountMinorUnits: number; currency: string; recipient?: PayoutRecipient }): Promise<PaymentProviderResult>;
  /** Verifies a webhook and returns a FINAL outcome, or null for non-final events. Throws on a bad signature. */
  parseWebhook?(rawBody: string, headers: Headers): Promise<PayoutWebhookResult | null>;
};

/**
 * Exists to keep today's flow working without moving money: an authorized finance actor
 * pays outside Unpatched and then calls record_manual_payment_result.
 */
export const manualPaymentProvider: PaymentProvider = {
  name: "manual",
  mode: "manual",
  async createPayment() {
    return { providerReferenceId: null, outcome: "requires_operator_action" };
  },
};

/** Accepts everything as pending; Platform -> Integrations completes or fails sandbox payouts. */
const sandboxPaymentProvider: PaymentProvider = {
  name: "sandbox",
  mode: "sandbox",
  async createPayment() {
    return { providerReferenceId: `sbx_po_${randomUUID()}`, outcome: "pending" };
  },
};

/** RazorpayX payouts to an Indian bank account (contact -> fund account -> payout). */
function razorpayxProvider(): PaymentProvider | null {
  const env = envGroup(["RAZORPAYX_KEY_ID", "RAZORPAYX_KEY_SECRET", "RAZORPAYX_ACCOUNT_NUMBER", "RAZORPAYX_WEBHOOK_SECRET"] as const);
  if (!env) return null;
  const headers = { Authorization: `Basic ${Buffer.from(`${env.RAZORPAYX_KEY_ID}:${env.RAZORPAYX_KEY_SECRET}`).toString("base64")}`, "Content-Type": "application/json" };
  const post = <T,>(path: string, body: unknown, extra: Record<string, string> = {}) =>
    providerFetch<T>(`https://api.razorpay.com/v1${path}`, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  return {
    name: "razorpayx",
    mode: "live",
    async createPayment({ idempotencyKey, amountMinorUnits, currency, recipient }) {
      if (currency !== "INR") return { providerReferenceId: null, outcome: "failed", failureMessage: "RazorpayX pays INR only" };
      if (!recipient || recipient.method !== "bank_transfer" || !recipient.bankAccountNumber || !recipient.bankIfsc) {
        return { providerReferenceId: null, outcome: "failed", failureMessage: "The researcher has no Indian bank account on file" };
      }
      const contact = await post<{ id: string }>("/contacts", { name: recipient.name.slice(0, 120), email: recipient.email ?? undefined, type: "vendor", reference_id: idempotencyKey.slice(0, 40) });
      const fund = await post<{ id: string }>("/fund_accounts", {
        contact_id: contact.id,
        account_type: "bank_account",
        bank_account: { name: (recipient.bankHolder ?? recipient.name).slice(0, 120), ifsc: recipient.bankIfsc, account_number: recipient.bankAccountNumber },
      });
      const payout = await post<{ id: string; status?: string }>(
        "/payouts",
        { account_number: env.RAZORPAYX_ACCOUNT_NUMBER, fund_account_id: fund.id, amount: amountMinorUnits, currency: "INR", mode: "IMPS", purpose: "payout", queue_if_low_balance: true, reference_id: idempotencyKey.slice(0, 40), narration: "Unpatched bounty" },
        { "X-Payout-Idempotency": idempotencyKey },
      );
      return { providerReferenceId: payout.id, outcome: "pending" };
    },
    async parseWebhook(rawBody, headersIn) {
      // X-Razorpay-Signature = hex(HMAC-SHA256(webhookSecret, rawBody)); verify before parsing.
      const signature = headersIn.get("x-razorpay-signature") ?? "";
      if (!signature || !safeEqual(hmacSha256Hex(env.RAZORPAYX_WEBHOOK_SECRET, rawBody), signature)) throw new Error("invalid Razorpay signature");
      const event = JSON.parse(rawBody) as { event?: string; payload?: { payout?: { entity?: { id?: string; status_details?: { reason?: string; description?: string } } } } };
      const payout = event.payload?.payout?.entity;
      if (!payout?.id) return null;
      if (event.event === "payout.processed") return { reference: payout.id, outcome: "succeeded" };
      if (["payout.reversed", "payout.failed", "payout.rejected", "payout.cancelled"].includes(event.event ?? "")) {
        return { reference: payout.id, outcome: "failed", failureCode: event.event, failureMessage: payout.status_details?.description ?? payout.status_details?.reason };
      }
      return null;
    },
  };
}

/** PayPal Payouts to the researcher's PayPal email (one item per batch). */
function paypalProvider(): PaymentProvider | null {
  const env = envGroup(["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"] as const);
  if (!env) return null;
  const base = process.env.PAYPAL_ENV === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  async function token(): Promise<string> {
    const body = await providerFetch<{ access_token: string }>(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${env!.PAYPAL_CLIENT_ID}:${env!.PAYPAL_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    return body.access_token;
  }
  return {
    name: "paypal",
    mode: "live",
    async createPayment({ idempotencyKey, amountMinorUnits, currency, recipient }) {
      if (!recipient || recipient.method !== "paypal" || !recipient.paypalEmail) {
        return { providerReferenceId: null, outcome: "failed", failureMessage: "The researcher has no PayPal email on file" };
      }
      const body = await providerFetch<{ batch_header?: { payout_batch_id?: string } }>(`${base}/v1/payments/payouts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "PayPal-Request-Id": idempotencyKey },
        body: JSON.stringify({
          // sender_batch_id is PayPal's 30-day idempotency key: a retry can't pay twice.
          sender_batch_header: { sender_batch_id: idempotencyKey, email_subject: "You have a bounty payout from Unpatched", recipient_type: "EMAIL" },
          items: [{ amount: { currency, value: (amountMinorUnits / 100).toFixed(2) }, receiver: recipient.paypalEmail, sender_item_id: idempotencyKey, note: "Unpatched bounty" }],
        }),
      });
      const batchId = body.batch_header?.payout_batch_id;
      if (!batchId) throw new Error("PayPal did not return a payout batch id");
      return { providerReferenceId: batchId, outcome: "pending" };
    },
    async parseWebhook(rawBody, headersIn) {
      // Not an HMAC: PayPal verifies its own signature via the verify-webhook-signature API.
      const event = JSON.parse(rawBody) as { event_type?: string; resource?: { payout_batch_id?: string; errors?: { name?: string; message?: string } } };
      const verification = await providerFetch<{ verification_status?: string }>(`${base}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_algo: headersIn.get("paypal-auth-algo"),
          cert_url: headersIn.get("paypal-cert-url"),
          transmission_id: headersIn.get("paypal-transmission-id"),
          transmission_sig: headersIn.get("paypal-transmission-sig"),
          transmission_time: headersIn.get("paypal-transmission-time"),
          webhook_id: env.PAYPAL_WEBHOOK_ID,
          webhook_event: event,
        }),
      });
      if (verification.verification_status !== "SUCCESS") throw new Error("invalid PayPal signature");
      const reference = event.resource?.payout_batch_id;
      if (!reference) return null;
      if (event.event_type === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") return { reference, outcome: "succeeded" };
      const failed = ["PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.BLOCKED", "PAYMENT.PAYOUTS-ITEM.RETURNED", "PAYMENT.PAYOUTS-ITEM.REFUNDED", "PAYMENT.PAYOUTS-ITEM.CANCELED", "PAYMENT.PAYOUTSBATCH.DENIED"];
      if (failed.includes(event.event_type ?? "")) return { reference, outcome: "failed", failureCode: event.event_type, failureMessage: event.resource?.errors?.message };
      return null; // UNCLAIMED / HELD / PROCESSING are not final
    },
  };
}

export function payoutProviderName(currency: string, env: NodeJS.ProcessEnv = process.env): string {
  return (currency === "INR" ? env.PAYOUT_PROVIDER_IN : env.PAYOUT_PROVIDER_GLOBAL)?.trim() || "manual";
}

/** The provider for this currency; falls back to manual when the configured one can't run
 * (sandbox in production, or missing credentials) -- never silently to a different payer. */
export function selectPayoutProvider(currency: string, env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const name = payoutProviderName(currency, env);
  if (name === "sandbox" && sandboxAllowed(env)) return sandboxPaymentProvider;
  if (name === "razorpayx" && currency === "INR") return razorpayxProvider() ?? manualPaymentProvider;
  if (name === "paypal" && currency !== "INR") return paypalProvider() ?? manualPaymentProvider;
  return manualPaymentProvider;
}

/** For webhooks: the live adapter by name. */
export function payoutProviderByName(name: string): PaymentProvider | null {
  return name === "razorpayx" ? razorpayxProvider() : name === "paypal" ? paypalProvider() : null;
}

/** Decrypted payout details, read only at the moment of sending (service role). */
export async function loadPayoutRecipient(attemptId: string): Promise<PayoutRecipient | undefined> {
  type Row = { display_name: string; email: string | null; method: PayoutRecipient["method"]; bank_holder: string | null; bank_account_number: string | null; bank_ifsc: string | null; paypal_email: string | null };
  const rows = await withServiceRoleTransaction((client) => callRpc<Row>(client, "public.get_payout_recipient", [attemptId]));
  const row = rows[0];
  if (!row) return undefined;
  return { name: row.display_name, email: row.email, method: row.method, bankHolder: row.bank_holder, bankAccountNumber: row.bank_account_number, bankIfsc: row.bank_ifsc, paypalEmail: row.paypal_email };
}

export const PAYOUT_ENV: Record<string, string[]> = {
  razorpayx: ["RAZORPAYX_KEY_ID", "RAZORPAYX_KEY_SECRET", "RAZORPAYX_ACCOUNT_NUMBER", "RAZORPAYX_WEBHOOK_SECRET"],
  paypal: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENV (optional: production)"],
};
