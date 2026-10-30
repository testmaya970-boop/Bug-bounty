import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cardProviderByName, cardSurchargeBps, chargedWithSurcharge, selectCardProvider } from "@/lib/integrations/card";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

afterEach(() => vi.unstubAllEnvs());

describe("card surcharge", () => {
  it("rounds the card fee up to the minor unit so the full amount lands", () => {
    expect(chargedWithSurcharge(10000, 300)).toBe(10300);
    expect(chargedWithSurcharge(101, 300)).toBe(105); // 3.03 -> 4
    expect(chargedWithSurcharge(5000, 0)).toBe(5000);
  });

  it("falls back to 3% for a missing or out-of-range setting", () => {
    expect(cardSurchargeBps(env({}))).toBe(300);
    expect(cardSurchargeBps(env({ CARD_SURCHARGE_BPS: "250" }))).toBe(250);
    expect(cardSurchargeBps(env({ CARD_SURCHARGE_BPS: "5000" }))).toBe(300);
    expect(cardSurchargeBps(env({ CARD_SURCHARGE_BPS: "abc" }))).toBe(300);
  });
});

describe("card provider selection", () => {
  it("never serves the sandbox in production", () => {
    expect(selectCardProvider("INR", env({ CARD_PROVIDER_IN: "sandbox", NODE_ENV: "production", APP_ORIGIN: "https://app.unpatched.io" }))).toBeNull();
    expect(selectCardProvider("INR", env({ CARD_PROVIDER_IN: "sandbox", NODE_ENV: "development" }))?.name).toBe("sandbox");
  });

  it("routes Razorpay to INR only and Stripe to USD only", () => {
    const keys = { RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w" };
    expect(selectCardProvider("USD", env({ ...keys, CARD_PROVIDER_GLOBAL: "razorpay" }))).toBeNull();
    expect(selectCardProvider("INR", env({ ...keys, CARD_PROVIDER_IN: "razorpay" }))?.name).toBe("razorpay");
  });
});

describe("card webhooks", () => {
  it("Razorpay: confirms a paid link only with a valid signature", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "k");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "s");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    const provider = cardProviderByName("razorpay")!;
    const body = JSON.stringify({ event: "payment_link.paid", created_at: Math.floor(Date.now() / 1000), payload: { payment_link: { entity: { reference_id: "card_abc" } } } });
    await expect(provider.parseWebhook(body, new Headers({ "x-razorpay-signature": sign("whsec", body) }))).resolves.toEqual({ reference: "card_abc", outcome: "confirmed" });
    await expect(provider.parseWebhook(body, new Headers({ "x-razorpay-signature": sign("wrong", body) }))).rejects.toThrow(/signature/);
  });

  it("Stripe: verifies t/v1 over `${t}.${body}` and refuses stale events", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_s");
    const provider = cardProviderByName("stripe")!;
    const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: "card_xyz", payment_status: "paid" } } });
    const now = Math.floor(Date.now() / 1000);
    const header = (t: number) => new Headers({ "stripe-signature": `t=${t},v1=${sign("whsec_s", `${t}.${body}`)}` });
    await expect(provider.parseWebhook(body, header(now))).resolves.toEqual({ reference: "card_xyz", outcome: "confirmed" });
    await expect(provider.parseWebhook(body, header(now - 3600))).rejects.toThrow(/stale/);
    await expect(provider.parseWebhook(body.replace("paid", "unpaid"), header(now))).rejects.toThrow(/signature/);
  });

  it("Stripe: an unpaid completed session is not a confirmation", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_s");
    const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: "card_xyz", payment_status: "unpaid" } } });
    const t = Math.floor(Date.now() / 1000);
    await expect(cardProviderByName("stripe")!.parseWebhook(body, new Headers({ "stripe-signature": `t=${t},v1=${sign("whsec_s", `${t}.${body}`)}` }))).resolves.toBeNull();
  });
});
