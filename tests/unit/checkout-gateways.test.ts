import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { GATEWAY_CURRENCY, paypalOrderVerdict, razorpayLinkVerdict, selectGatewayProvider } =await import("@/lib/integrations/card");
const { selectPayoutConnectProvider } = await import("@/lib/integrations/payout-connect");

const env = (vars: Record<string, string>) => ({ NODE_ENV: "development", ...vars }) as NodeJS.ProcessEnv;

describe("add funds: gateway selection", () => {
  it("each gateway settles one currency", () => {
    expect(GATEWAY_CURRENCY).toEqual({ stripe: "USD", paypal: "USD", razorpay: "INR" });
  });

  it("off by default, sandbox only off production, and a live PayPal never pretends to work", () => {
    expect(selectGatewayProvider("paypal", env({}))).toBeNull();
    expect(selectGatewayProvider("paypal", env({ CARD_PROVIDER_PAYPAL: "sandbox" }))?.name).toBe("sandbox");
    expect(selectGatewayProvider("paypal", env({ CARD_PROVIDER_PAYPAL: "sandbox", NODE_ENV: "production", APP_ORIGIN: "https://app.unpatched.io" }))).toBeNull();
    expect(selectGatewayProvider("paypal", env({ CARD_PROVIDER_PAYPAL: "paypal" }))).toBeNull(); // no credentials
    expect(selectGatewayProvider("stripe", env({ CARD_PROVIDER_GLOBAL: "razorpay" }))).toBeNull(); // a gateway only takes its own name
  });

  it("the sandbox sends the payer to the stand-in page, which returns to Unpatched", async () => {
    const p = selectGatewayProvider("stripe", env({ CARD_PROVIDER_GLOBAL: "sandbox" }))!;
    const { url } = await p.createCheckout({ reference: "card_x", chargedMinorUnits: 10300, currency: "USD", description: "d", returnUrl: "https://a/return?ref=card_x", cancelUrl: "https://a/return?ref=card_x&cancelled=1", sandboxUrl: "https://a/card-sandbox?ref=card_x" });
    expect(url).toBe("https://a/card-sandbox?ref=card_x");
  });
});

describe("add funds: providers' own test environments", () => {
  const paypal = { CARD_PROVIDER_PAYPAL: "paypal", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_WEBHOOK_ID: "wh" };
  const prod = { NODE_ENV: "production", APP_ORIGIN: "https://app.unpatched.io" };

  it("PayPal defaults to its sandbox, which a production deployment refuses; live needs PAYPAL_ENV=live", () => {
    expect(selectGatewayProvider("paypal", env(paypal))).toMatchObject({ name: "paypal", mode: "sandbox" });
    expect(selectGatewayProvider("paypal", env({ ...paypal, ...prod }))).toBeNull();
    expect(selectGatewayProvider("paypal", env({ ...paypal, ...prod, PAYPAL_ENV: "live" }))).toMatchObject({ name: "paypal", mode: "live" });
  });

  it("Stripe and Razorpay test keys run as Test mode, and never on production", () => {
    const stripe = { CARD_PROVIDER_GLOBAL: "stripe", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec" };
    const razorpay = { CARD_PROVIDER_IN: "razorpay", RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w" };
    expect(selectGatewayProvider("stripe", env(stripe))?.mode).toBe("sandbox");
    expect(selectGatewayProvider("razorpay", env(razorpay))?.mode).toBe("sandbox");
    expect(selectGatewayProvider("stripe", env({ ...stripe, ...prod }))).toBeNull();
    expect(selectGatewayProvider("razorpay", env({ ...razorpay, ...prod }))).toBeNull();
    expect(selectGatewayProvider("stripe", env({ ...stripe, ...prod, STRIPE_SECRET_KEY: "sk_live_abc" }))?.mode).toBe("live");
  });

  it("PayPal checkout creates the order on the sandbox host with the exact charged amount and returns PayPal's approve link", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body as string | undefined });
      if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
      return new Response(JSON.stringify({ links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123ABC" }] }));
    });
    const p = selectGatewayProvider("paypal", env(paypal))!;
    const { url } = await p.createCheckout({ reference: "card_x", chargedMinorUnits: 10300, currency: "USD", description: "d", returnUrl: "https://a/r?ref=card_x", cancelUrl: "https://a/r?ref=card_x&cancelled=1", sandboxUrl: "" });
    expect(url).toBe("https://www.sandbox.paypal.com/checkoutnow?token=ORDER123ABC");
    const order = calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!;
    expect(order.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(JSON.parse(order.body!).purchase_units[0]).toMatchObject({ custom_id: "card_x", amount: { currency_code: "USD", value: "103.00" } });
    fetchMock.mockRestore();
  });
});

describe("add funds: PayPal order verdict", () => {
  const expected = { reference: "card_x", chargedMinorUnits: 10300, currency: "USD" as const };
  const order = (status: string, capture: object | null, custom = "card_x") => ({ id: "O1", status, purchase_units: [{ custom_id: custom, payments: { captures: capture ? [capture] : [] } }] });

  it("confirms only a completed capture of this deposit for the exact amount", () => {
    expect(paypalOrderVerdict(order("COMPLETED", { id: "C1", status: "COMPLETED", amount: { currency_code: "USD", value: "103.00" } }), expected)).toEqual({ reference: "card_x", outcome: "confirmed", detail: "Paid by PayPal · C1" });
    expect(paypalOrderVerdict(order("APPROVED", null), expected)).toBeNull();
    expect(paypalOrderVerdict(order("COMPLETED", { status: "DECLINED" }), expected)?.outcome).toBe("failed");
  });

  it("refuses another deposit's order and a different amount", () => {
    expect(() => paypalOrderVerdict(order("COMPLETED", { status: "COMPLETED", amount: { currency_code: "USD", value: "103.00" } }, "card_other"), expected)).toThrow(/does not belong/);
    expect(() => paypalOrderVerdict(order("COMPLETED", { status: "COMPLETED", amount: { currency_code: "USD", value: "1.00" } }), expected)).toThrow(/expected USD 103.00/);
  });
});

describe("add funds: Razorpay link verdict", () => {
  const expected = { reference: "card_x", chargedMinorUnits: 51500, currency: "INR" as const };
  it("confirms only a paid link of this deposit for the exact amount", () => {
    expect(razorpayLinkVerdict({ status: "paid", reference_id: "card_x", amount_paid: 51500, currency: "INR" }, "plink_1", expected)).toEqual({ reference: "card_x", outcome: "confirmed", detail: "Paid by Razorpay · plink_1" });
    expect(razorpayLinkVerdict({ status: "created", reference_id: "card_x" }, "plink_1", expected)).toBeNull();
    expect(razorpayLinkVerdict({ status: "expired", reference_id: "card_x" }, "plink_1", expected)?.outcome).toBe("failed");
    expect(() => razorpayLinkVerdict({ status: "paid", reference_id: "card_other", amount_paid: 51500, currency: "INR" }, "plink_1", expected)).toThrow(/does not belong/);
    expect(() => razorpayLinkVerdict({ status: "paid", reference_id: "card_x", amount_paid: 100, currency: "INR" }, "plink_1", expected)).toThrow(/expected INR 51500/);
  });

  it("runs without a webhook secret, and the webhook then refuses every event", async () => {
    const p = selectGatewayProvider("razorpay", env({ CARD_PROVIDER_IN: "razorpay", RAZORPAY_KEY_ID: "rzp_test_a", RAZORPAY_KEY_SECRET: "s" }))!;
    expect(p.mode).toBe("sandbox");
    await expect(p.parseWebhook("{}", new Headers())).rejects.toThrow(/WEBHOOK_SECRET is not set/);
  });
});

describe("researcher payout connections", () => {
  it("only the sandbox can connect until the live adapters are filled in", () => {
    expect(selectPayoutConnectProvider("paypal", env({}))).toBeNull();
    expect(selectPayoutConnectProvider("stripe", env({ PAYOUT_CONNECT_STRIPE: "stripe" }))).toBeNull();
    expect(selectPayoutConnectProvider("paypal", env({ PAYOUT_CONNECT_PAYPAL: "sandbox", NODE_ENV: "production", APP_ORIGIN: "https://app.unpatched.io" }))).toBeNull();
  });

  it("the sandbox consent page carries the state, and only an allowed account with an email connects", async () => {
    const p = selectPayoutConnectProvider("paypal", env({ PAYOUT_CONNECT_PAYPAL: "sandbox" }))!;
    expect(p.authorizeUrl({ state: "s t", origin: "https://a", callbackUrl: "https://a/cb" })).toBe("https://a/settings/payments/connect-sandbox?provider=paypal&state=s%20t");
    await expect(p.completeCallback(new URLSearchParams({ outcome: "allow", account: "Me@Example.com" }))).resolves.toEqual({ accountReference: "sandbox:me@example.com", accountLabel: "me@example.com" });
    await expect(p.completeCallback(new URLSearchParams({ outcome: "deny", account: "me@example.com" }))).rejects.toThrow(/declined/);
    await expect(p.completeCallback(new URLSearchParams({ outcome: "allow", account: "nope" }))).rejects.toThrow(/did not return/);
  });
});
