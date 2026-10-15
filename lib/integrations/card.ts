import "server-only";
import { envGroup, hmacSha256Hex, providerFetch, safeEqual, sandboxAllowed } from "./common";

// Card funding for an organization's prepaid balance (202610150002). Routing is by currency,
// chosen by env, the same way payouts and identity are:
//   INR  -> CARD_PROVIDER_IN     = none | sandbox | razorpay   (Razorpay Payment Links)
//   USD  -> CARD_PROVIDER_GLOBAL = none | sandbox | stripe     (Stripe Checkout)
// The provider's hosted page takes the card; Unpatched never sees card details. Its signed
// webhook is the only thing that confirms a deposit (complete_card_deposit).

export type CardCurrency = "INR" | "USD";
export type CardCheckout = { url: string };
export type CardWebhookResult = { reference: string; outcome: "confirmed" | "failed"; detail?: string };

export type CardProvider = {
  readonly name: "sandbox" | "razorpay" | "stripe";
  readonly mode: "sandbox" | "live";
  createCheckout(input: { reference: string; chargedMinorUnits: number; currency: CardCurrency; description: string; returnUrl: string }): Promise<CardCheckout>;
  /** Verifies the signature; returns a final verdict, or null for an event that isn't one. Throws on a bad signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<CardWebhookResult | null>;
};

/** The card surcharge passed on to the organization, in basis points (default 3%). */
export function cardSurchargeBps(env: NodeJS.ProcessEnv = process.env): number {
  const bps = Number(env.CARD_SURCHARGE_BPS ?? 300);
  return Number.isInteger(bps) && bps >= 0 && bps <= 1000 ? bps : 300;
}

/** What the card is charged so the full amount lands in the balance. Rounded up to the minor unit. */
export function chargedWithSurcharge(amountMinorUnits: number, bps: number): number {
  return amountMinorUnits + Math.ceil((amountMinorUnits * bps) / 10000);
}

const WEBHOOK_TOLERANCE_SECONDS = 300;

const sandboxProvider: CardProvider = {
  name: "sandbox",
  mode: "sandbox",
  async createCheckout({ reference, returnUrl }) {
    // returnUrl is the organization's Payments page; the sandbox page sits beside it.
    return { url: `${returnUrl}/card-sandbox?ref=${encodeURIComponent(reference)}` };
  },
  async parseWebhook() {
    throw new Error("the sandbox has no webhook; results come from the sandbox page");
  },
};

/** Razorpay Payment Links (INR). Result by webhook: payment_link.paid / .expired / .cancelled. */
function razorpayProvider(): CardProvider | null {
  const env = envGroup(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const);
  if (!env) return null;
  return {
    name: "razorpay",
    mode: "live",
    async createCheckout({ reference, chargedMinorUnits, currency, description, returnUrl }) {
      const body = await providerFetch<{ short_url?: string }>("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}` },
        body: JSON.stringify({ amount: chargedMinorUnits, currency, reference_id: reference, description, callback_url: returnUrl, callback_method: "get" }),
      });
      if (!body.short_url) throw new Error("Razorpay did not return a payment link");
      return { url: body.short_url };
    },
    async parseWebhook(rawBody, headers) {
      const signature = headers.get("x-razorpay-signature") ?? "";
      if (!safeEqual(hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature)) throw new Error("invalid Razorpay signature");
      const event = JSON.parse(rawBody) as { event?: string; created_at?: number; payload?: { payment_link?: { entity?: { reference_id?: string } } } };
      if (typeof event.created_at === "number" && Math.abs(Date.now() / 1000 - event.created_at) > 24 * 3600) throw new Error("stale Razorpay event");
      const reference = event.payload?.payment_link?.entity?.reference_id;
      if (!reference) return null;
      if (event.event === "payment_link.paid") return { reference, outcome: "confirmed" };
      if (event.event === "payment_link.expired" || event.event === "payment_link.cancelled") return { reference, outcome: "failed", detail: `Card payment ${event.event.split(".")[1]}` };
      return null;
    },
  };
}

/** Stripe Checkout (USD). Result by webhook: checkout.session.completed (paid) / .expired. */
function stripeProvider(): CardProvider | null {
  const env = envGroup(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const);
  if (!env) return null;
  return {
    name: "stripe",
    mode: "live",
    async createCheckout({ reference, chargedMinorUnits, currency, description, returnUrl }) {
      const form = new URLSearchParams({
        mode: "payment",
        client_reference_id: reference,
        success_url: `${returnUrl}?card=done`,
        cancel_url: `${returnUrl}?card=cancelled`,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(chargedMinorUnits),
        "line_items[0][price_data][product_data][name]": description,
        "metadata[deposit_reference]": reference,
      });
      const body = await providerFetch<{ url?: string }>("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Idempotency-Key": reference },
        body: form.toString(),
      });
      if (!body.url) throw new Error("Stripe did not return a checkout URL");
      return { url: body.url };
    },
    async parseWebhook(rawBody, headers) {
      // Stripe-Signature: "t=<unix>,v1=<hex>[,v1=<hex>...]" over `${t}.${body}`.
      const parts = (headers.get("stripe-signature") ?? "").split(",").map((kv) => kv.split("=") as [string, string]);
      const t = parts.find(([k]) => k === "t")?.[1];
      const expected = t ? hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${t}.${rawBody}`) : "";
      if (!t || !parts.some(([k, v]) => k === "v1" && safeEqual(expected, v))) throw new Error("invalid Stripe signature");
      if (Math.abs(Date.now() / 1000 - Number(t)) > WEBHOOK_TOLERANCE_SECONDS) throw new Error("stale Stripe event");
      const event = JSON.parse(rawBody) as { type?: string; data?: { object?: { client_reference_id?: string; payment_status?: string } } };
      const reference = event.data?.object?.client_reference_id;
      if (!reference) return null;
      if (event.type === "checkout.session.completed" && event.data?.object?.payment_status === "paid") return { reference, outcome: "confirmed" };
      if (event.type === "checkout.session.async_payment_succeeded") return { reference, outcome: "confirmed" };
      if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") return { reference, outcome: "failed", detail: "Card payment did not complete" };
      return null;
    },
  };
}

export function cardProviderName(currency: CardCurrency, env: NodeJS.ProcessEnv = process.env): string {
  return (currency === "INR" ? env.CARD_PROVIDER_IN : env.CARD_PROVIDER_GLOBAL)?.trim() || "none";
}

/** The provider for a currency, or null when card funding is off or not configured for it. */
export function selectCardProvider(currency: CardCurrency, env: NodeJS.ProcessEnv = process.env): CardProvider | null {
  const name = cardProviderName(currency, env);
  if (name === "sandbox") return sandboxAllowed(env) ? sandboxProvider : null;
  if (name === "razorpay" && currency === "INR") return razorpayProvider();
  if (name === "stripe" && currency === "USD") return stripeProvider();
  return null;
}

/** For the webhook route: the live adapter by name. */
export function cardProviderByName(name: string): CardProvider | null {
  return name === "razorpay" ? razorpayProvider() : name === "stripe" ? stripeProvider() : null;
}

export const CARD_ENV: Record<string, string[]> = {
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
};
