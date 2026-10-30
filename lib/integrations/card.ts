import "server-only";
import { minorUnitsToDecimalString } from "../money";
import { envGroup, hmacSha256Hex, providerFetch, safeEqual, sandboxAllowed } from "./common";

// Card funding for an organization's prepaid balance (202610150002). Routing is by currency,
// chosen by env, the same way payouts and identity are:
//   INR  -> CARD_PROVIDER_IN     = none | sandbox | razorpay   (Razorpay Payment Links)
//   USD  -> CARD_PROVIDER_GLOBAL = none | sandbox | stripe     (Stripe Checkout)
//   USD  -> CARD_PROVIDER_PAYPAL = none | sandbox | paypal     (PayPal Checkout, PAYPAL_ENV=sandbox|live)
// "sandbox" is our own stand-in page; the providers' own test environments (Stripe sk_test_,
// Razorpay rzp_test_, PayPal sandbox) run the real flow with fake money and show "Test mode".
// The provider's hosted page takes the card; Unpatched never sees card details. Its signed
// webhook is the only thing that confirms a deposit (complete_card_deposit).

export type CardCurrency = "INR" | "USD";
export type CardCheckout = { url: string };
export type CardWebhookResult = { reference: string; outcome: "confirmed" | "failed"; detail?: string };

export type CardProvider = {
  readonly name: "sandbox" | "razorpay" | "stripe" | "paypal";
  readonly mode: "sandbox" | "live";
  /** returnUrl / cancelUrl are pages on Unpatched the gateway sends the payer back to;
   * sandboxUrl is the stand-in checkout page (sandbox only). */
  createCheckout(input: { reference: string; chargedMinorUnits: number; currency: CardCurrency; description: string; returnUrl: string; cancelUrl: string; sandboxUrl: string }): Promise<CardCheckout>;
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
  async createCheckout({ sandboxUrl }) {
    return { url: sandboxUrl };
  },
  async parseWebhook() {
    throw new Error("the sandbox has no webhook; results come from the sandbox page");
  },
};

/** Razorpay Payment Links (INR). Result by webhook: payment_link.paid / .expired / .cancelled. */
type RazorpayConfig = { auth: string; webhookSecret: string | null; mode: "sandbox" | "live" };

function razorpayConfig(processEnv: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  const env = envGroup(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] as const, processEnv);
  if (!env) return null;
  // Razorpay test mode is the same API with rzp_test_ keys: test cards, no real money.
  const mode = env.RAZORPAY_KEY_ID.startsWith("rzp_test_") ? "sandbox" : "live";
  if (mode === "sandbox" && !sandboxAllowed(processEnv)) return null;
  // The webhook secret is optional, like PayPal's webhook id: Razorpay can't reach a local
  // machine, and the return page confirms from Razorpay's API instead (settleRazorpayLink).
  return { auth: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`, webhookSecret: processEnv.RAZORPAY_WEBHOOK_SECRET?.trim() || null, mode };
}

export type RazorpayLink = { status?: string; reference_id?: string; amount_paid?: number; currency?: string };

/** What a Razorpay payment link says about one deposit, read from Razorpay's API: confirmed
 * (paid in full, our reference, the exact amount), failed (expired/cancelled), or null (not
 * paid yet). Throws when the link is another deposit's or the amount differs. */
export function razorpayLinkVerdict(link: RazorpayLink, linkId: string, expected: { reference: string; chargedMinorUnits: number; currency: CardCurrency }): CardWebhookResult | null {
  if (link.reference_id !== expected.reference) throw new Error("Razorpay link does not belong to this deposit");
  if (link.status === "expired" || link.status === "cancelled") return { reference: expected.reference, outcome: "failed", detail: `Card payment ${link.status}` };
  if (link.status !== "paid") return null;
  if (link.currency !== expected.currency || link.amount_paid !== expected.chargedMinorUnits) throw new Error(`Razorpay was paid ${link.currency} ${link.amount_paid}, expected ${expected.currency} ${expected.chargedMinorUnits}`);
  return { reference: expected.reference, outcome: "confirmed", detail: `Paid by Razorpay · ${linkId}` };
}

/** For the return page: Razorpay sends the payer back with razorpay_payment_link_id; read that
 * link from Razorpay's API (never trust the query string's status) and give the verdict. */
export async function settleRazorpayLink(linkId: string, expected: { reference: string; chargedMinorUnits: number; currency: CardCurrency }, env: NodeJS.ProcessEnv = process.env): Promise<CardWebhookResult | null> {
  const config = razorpayConfig(env);
  if (!config || !/^plink_[A-Za-z0-9]{6,40}$/.test(linkId)) return null;
  const link = await providerFetch<RazorpayLink>(`https://api.razorpay.com/v1/payment_links/${linkId}`, { headers: { Authorization: config.auth } });
  return razorpayLinkVerdict(link, linkId, expected);
}

function razorpayProvider(processEnv: NodeJS.ProcessEnv = process.env): CardProvider | null {
  const config = razorpayConfig(processEnv);
  if (!config) return null;
  return {
    name: "razorpay",
    mode: config.mode,
    async createCheckout({ reference, chargedMinorUnits, currency, description, returnUrl }) {
      const body = await providerFetch<{ short_url?: string }>("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: config.auth },
        body: JSON.stringify({ amount: chargedMinorUnits, currency, reference_id: reference, description, callback_url: returnUrl, callback_method: "get" }),
      });
      if (!body.short_url) throw new Error("Razorpay did not return a payment link");
      return { url: body.short_url };
    },
    async parseWebhook(rawBody, headers) {
      if (!config.webhookSecret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set, so Razorpay events can't be verified");
      const signature = headers.get("x-razorpay-signature") ?? "";
      if (!safeEqual(hmacSha256Hex(config.webhookSecret, rawBody), signature)) throw new Error("invalid Razorpay signature");
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
function stripeProvider(processEnv: NodeJS.ProcessEnv = process.env): CardProvider | null {
  const env = envGroup(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const, processEnv);
  if (!env) return null;
  // Stripe test mode is the same API with sk_test_ keys: test cards (4242 4242 4242 4242), no real money.
  const mode = env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "sandbox" : "live";
  if (mode === "sandbox" && !sandboxAllowed(processEnv)) return null;
  return {
    name: "stripe",
    mode,
    async createCheckout({ reference, chargedMinorUnits, currency, description, returnUrl, cancelUrl }) {
      const form = new URLSearchParams({
        mode: "payment",
        client_reference_id: reference,
        success_url: returnUrl,
        cancel_url: cancelUrl,
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
  if (name === "razorpay" && currency === "INR") return razorpayProvider(env);
  if (name === "stripe" && currency === "USD") return stripeProvider(env);
  return null;
}

// Gateways the organization chooses between on the Add funds page. Each settles one currency.
export type CheckoutGateway = "stripe" | "paypal" | "razorpay";
export const GATEWAY_CURRENCY: Record<CheckoutGateway, CardCurrency> = { stripe: "USD", paypal: "USD", razorpay: "INR" };

/** Env per gateway: none | sandbox | <the gateway's own name>. */
export function gatewayProviderName(gateway: CheckoutGateway, env: NodeJS.ProcessEnv = process.env): string {
  const raw = gateway === "razorpay" ? env.CARD_PROVIDER_IN : gateway === "stripe" ? env.CARD_PROVIDER_GLOBAL : env.CARD_PROVIDER_PAYPAL;
  return raw?.trim() || "none";
}

// PayPal Checkout (USD) through the Orders v2 API. PAYPAL_ENV picks PayPal's own environment:
// "sandbox" (the default: api-m.sandbox.paypal.com, sandbox buyer accounts, no real money) or
// "live". A sandbox PayPal is refused wherever our stand-in sandbox is (sandboxAllowed), so test
// money can never fund a real balance.
//
// Flow: create an order (custom_id = our deposit reference), send the payer to PayPal's approve
// page, then capture. Capture happens on the return page (settlePaypalOrder, which reads the
// result back from PayPal itself, never from the URL) and again from the verified webhook in
// case the payer closes the tab, so a deposit is confirmed whichever arrives first.

const PAYPAL_API = { sandbox: "https://api-m.sandbox.paypal.com", live: "https://api-m.paypal.com" } as const;

type PaypalConfig = { clientId: string; clientSecret: string; webhookId: string | null; mode: "sandbox" | "live"; base: string };
type PaypalCapture = { id?: string; status?: string; amount?: { currency_code?: string; value?: string }; custom_id?: string };
export type PaypalOrder = { id?: string; status?: string; purchase_units?: { reference_id?: string; custom_id?: string; payments?: { captures?: PaypalCapture[] } }[] };

function paypalConfig(env: NodeJS.ProcessEnv = process.env): PaypalConfig | null {
  const creds = envGroup(["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const, env);
  if (!creds) return null;
  const mode = env.PAYPAL_ENV?.trim() === "live" ? "live" : "sandbox";
  if (mode === "sandbox" && !sandboxAllowed(env)) return null;
  // The webhook id is optional: PayPal only registers public https URLs, so a local machine has
  // none. Without it the return page still confirms; the webhook route refuses every event.
  return { clientId: creds.PAYPAL_CLIENT_ID, clientSecret: creds.PAYPAL_CLIENT_SECRET, webhookId: env.PAYPAL_WEBHOOK_ID?.trim() || null, mode, base: PAYPAL_API[mode] };
}

let paypalToken: { key: string; token: string; expiresAt: number } | null = null;

async function paypalFetch<T>(config: PaypalConfig, path: string, init: RequestInit = {}): Promise<T> {
  const key = `${config.base}|${config.clientId}`;
  if (!paypalToken || paypalToken.key !== key || paypalToken.expiresAt < Date.now() + 60_000) {
    const body = await providerFetch<{ access_token?: string; expires_in?: number }>(`${config.base}/v1/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` },
      body: "grant_type=client_credentials",
    });
    if (!body.access_token) throw new Error("PayPal did not return an access token");
    paypalToken = { key, token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
  }
  return providerFetch<T>(`${config.base}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${paypalToken.token}`, ...init.headers } });
}

/** What a PayPal order says about one deposit: confirmed (captured, our reference, the exact
 * amount), failed (capture declined), or null (not paid yet). Throws when the order is not this
 * deposit's or the amount differs, so a swapped or tampered order can never confirm it. */
export function paypalOrderVerdict(order: PaypalOrder, expected: { reference: string; chargedMinorUnits: number; currency: CardCurrency }): CardWebhookResult | null {
  const unit = order.purchase_units?.[0];
  if (!unit || (unit.custom_id ?? unit.reference_id) !== expected.reference) throw new Error("PayPal order does not belong to this deposit");
  const capture = unit.payments?.captures?.[0];
  if (capture?.status === "DECLINED" || capture?.status === "FAILED") return { reference: expected.reference, outcome: "failed", detail: "PayPal declined the payment" };
  if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED") return null;
  if (capture.amount?.currency_code !== expected.currency || capture.amount?.value !== minorUnitsToDecimalString(expected.chargedMinorUnits)) {
    throw new Error(`PayPal captured ${capture.amount?.currency_code} ${capture.amount?.value}, expected ${expected.currency} ${minorUnitsToDecimalString(expected.chargedMinorUnits)}`);
  }
  return { reference: expected.reference, outcome: "confirmed", detail: `Paid by PayPal · ${capture.id ?? order.id}` };
}

async function capturePaypalOrder(config: PaypalConfig, orderId: string): Promise<PaypalOrder> {
  try {
    return await paypalFetch<PaypalOrder>(config, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `capture-${orderId}` }, body: "{}" });
  } catch {
    // Already captured (the webhook got there first), or not approved yet: read the order as it stands.
    return paypalFetch<PaypalOrder>(config, `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }
}

/** For the return page: capture the order PayPal sent the payer back with and read the verdict
 * from PayPal's own answer. Null when PayPal checkout isn't configured or the order isn't paid. */
export async function settlePaypalOrder(orderId: string, expected: { reference: string; chargedMinorUnits: number; currency: CardCurrency }, env: NodeJS.ProcessEnv = process.env): Promise<CardWebhookResult | null> {
  const config = paypalConfig(env);
  if (!config || !/^[A-Z0-9]{10,40}$/.test(orderId)) return null;
  return paypalOrderVerdict(await capturePaypalOrder(config, orderId), expected);
}

function paypalCheckoutProvider(env: NodeJS.ProcessEnv = process.env): CardProvider | null {
  const config = paypalConfig(env);
  if (!config) return null;
  return {
    name: "paypal",
    mode: config.mode,
    async createCheckout({ reference, chargedMinorUnits, currency, description, returnUrl, cancelUrl }) {
      const order = await paypalFetch<{ links?: { rel?: string; href?: string }[] }>(config, "/v2/checkout/orders", {
        method: "POST",
        headers: { "PayPal-Request-Id": reference, Prefer: "return=minimal" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: reference, custom_id: reference, description, amount: { currency_code: currency, value: minorUnitsToDecimalString(chargedMinorUnits) } }],
          payment_source: { paypal: { experience_context: { brand_name: "Unpatched", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: cancelUrl } } },
        }),
      });
      const url = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
      if (!url) throw new Error("PayPal did not return an approval link");
      return { url };
    },
    async parseWebhook(rawBody, headers) {
      // PayPal signs with a certificate; its verify endpoint checks the signature against the
      // webhook id registered for this app.
      if (!config.webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set, so PayPal events can't be verified");
      const event = JSON.parse(rawBody) as { event_type?: string; resource?: PaypalCapture & PaypalOrder };
      const verified = await paypalFetch<{ verification_status?: string }>(config, "/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify({
          auth_algo: headers.get("paypal-auth-algo"),
          cert_url: headers.get("paypal-cert-url"),
          transmission_id: headers.get("paypal-transmission-id"),
          transmission_sig: headers.get("paypal-transmission-sig"),
          transmission_time: headers.get("paypal-transmission-time"),
          webhook_id: config.webhookId,
          webhook_event: event,
        }),
      });
      if (verified.verification_status !== "SUCCESS") throw new Error("invalid PayPal signature");
      const resource = event.resource ?? {};
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" && resource.custom_id) return { reference: resource.custom_id, outcome: "confirmed", detail: `Paid by PayPal · ${resource.id}` };
      if ((event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "PAYMENT.CAPTURE.DECLINED") && resource.custom_id) return { reference: resource.custom_id, outcome: "failed", detail: "PayPal declined the payment" };
      if (event.event_type === "CHECKOUT.ORDER.APPROVED" && resource.id) {
        // Approved but the payer never came back to capture: capture here. The capture's own
        // COMPLETED webhook then confirms the deposit.
        await capturePaypalOrder(config, resource.id);
      }
      return null;
    },
  };
}

/** The provider for a chosen gateway, or null when it is off or not connected yet. */
export function selectGatewayProvider(gateway: CheckoutGateway, env: NodeJS.ProcessEnv = process.env): CardProvider | null {
  const name = gatewayProviderName(gateway, env);
  if (name === "sandbox") return sandboxAllowed(env) ? sandboxProvider : null;
  if (name !== gateway) return null;
  return gateway === "razorpay" ? razorpayProvider(env) : gateway === "stripe" ? stripeProvider(env) : paypalCheckoutProvider(env);
}

/** For the webhook route: the live adapter by name. */
export function cardProviderByName(name: string): CardProvider | null {
  return name === "razorpay" ? razorpayProvider() : name === "stripe" ? stripeProvider() : name === "paypal" ? paypalCheckoutProvider() : null;
}

export const CARD_ENV: Record<string, string[]> = {
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET (optional: confirms payments when the payer closes the tab)"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  paypal: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID (optional: confirms payments when the payer closes the tab)"],
};
