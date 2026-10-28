import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { GATEWAY_CURRENCY, selectGatewayProvider } = await import("@/lib/integrations/card");
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
    expect(selectGatewayProvider("paypal", env({ CARD_PROVIDER_PAYPAL: "paypal" }))).toBeNull(); // not wired yet
    expect(selectGatewayProvider("stripe", env({ CARD_PROVIDER_GLOBAL: "razorpay" }))).toBeNull(); // a gateway only takes its own name
  });

  it("the sandbox sends the payer to the stand-in page, which returns to Unpatched", async () => {
    const p = selectGatewayProvider("stripe", env({ CARD_PROVIDER_GLOBAL: "sandbox" }))!;
    const { url } = await p.createCheckout({ reference: "card_x", chargedMinorUnits: 10300, currency: "USD", description: "d", returnUrl: "https://a/return?ref=card_x", cancelUrl: "https://a/return?ref=card_x&cancelled=1", sandboxUrl: "https://a/card-sandbox?ref=card_x" });
    expect(url).toBe("https://a/card-sandbox?ref=card_x");
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
