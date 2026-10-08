import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { aliasLocalPart, getAliasEmailConfig, sendMailgunForward, verifyMailgunSignature } from "../../lib/mailgun";

const KEY = "test-signing-key";
const NOW = 1_800_000_000;
const sign = (timestamp: string, token: string, key = KEY) => createHmac("sha256", key).update(timestamp + token).digest("hex");

describe("verifyMailgunSignature", () => {
  const token = "a".repeat(50);
  const timestamp = String(NOW);

  it("accepts Mailgun's HMAC of timestamp + token", () => {
    expect(verifyMailgunSignature(KEY, { timestamp, token, signature: sign(timestamp, token) }, NOW)).toBe(true);
  });

  it("rejects a wrong key, a tampered token, and missing or malformed fields", () => {
    expect(verifyMailgunSignature(KEY, { timestamp, token, signature: sign(timestamp, token, "other-key") }, NOW)).toBe(false);
    expect(verifyMailgunSignature(KEY, { timestamp, token: token + "x", signature: sign(timestamp, token) }, NOW)).toBe(false);
    expect(verifyMailgunSignature(KEY, { timestamp, token, signature: null }, NOW)).toBe(false);
    expect(verifyMailgunSignature(KEY, { timestamp: "12abc", token, signature: sign("12abc", token) }, NOW)).toBe(false);
    expect(verifyMailgunSignature(KEY, { timestamp, token, signature: "zz" }, NOW)).toBe(false);
  });

  it("accepts Mailgun's hours-later retries but not a day-old request", () => {
    const eightHoursAgo = String(NOW - 8 * 3600);
    expect(verifyMailgunSignature(KEY, { timestamp: eightHoursAgo, token, signature: sign(eightHoursAgo, token) }, NOW)).toBe(true);
    const twoDaysAgo = String(NOW - 48 * 3600);
    expect(verifyMailgunSignature(KEY, { timestamp: twoDaysAgo, token, signature: sign(twoDaysAgo, token) }, NOW)).toBe(false);
  });
});

describe("aliasLocalPart", () => {
  it("returns the alias for the alias domain only, lower-cased, ignoring +tags", () => {
    expect(aliasLocalPart("Alice_01@alias.netras.ai", "alias.netras.ai")).toBe("alice_01");
    expect(aliasLocalPart("<alice+shopify@ALIAS.netras.ai>", "alias.netras.ai")).toBe("alice");
    expect(aliasLocalPart("alice@netras.ai", "alias.netras.ai")).toBeNull();
    expect(aliasLocalPart("alice@alias.netras.ai.evil.com", "alias.netras.ai")).toBeNull();
    expect(aliasLocalPart("a@alias.netras.ai", "alias.netras.ai")).toBeNull();
    expect(aliasLocalPart("not an address", "alias.netras.ai")).toBeNull();
  });
});

describe("getAliasEmailConfig", () => {
  it("is off until the domain, API key and signing key are all set", () => {
    expect(getAliasEmailConfig({ ALIAS_EMAIL_DOMAIN: "alias.netras.ai", MAILGUN_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const config = getAliasEmailConfig({ ALIAS_EMAIL_DOMAIN: "Alias.Netras.ai", MAILGUN_API_KEY: "k", MAILGUN_WEBHOOK_SIGNING_KEY: "s", MAILGUN_API_BASE: "https://api.eu.mailgun.net/" } as unknown as NodeJS.ProcessEnv);
    expect(config).toMatchObject({ domain: "alias.netras.ai", apiBase: "https://api.eu.mailgun.net", brandName: "Netras" });
  });
});

describe("sendMailgunForward", () => {
  const config = { domain: "alias.netras.ai", apiKey: "key-123", webhookSigningKey: "s", apiBase: "https://api.mailgun.net", brandName: "Netras" };
  const input = { to: "alice@real.example", aliasAddress: "alice@alias.netras.ai", originalFrom: "Shop <noreply@shop.example>", subject: "Verify", text: "code 1234", html: null, attachments: [] };

  it("sends from the alias domain with the original sender in the name and Reply-To", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify({ id: "<msg@mailgun>" }), { status: 200 });
    });
    const result = await sendMailgunForward(config, input, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, id: "<msg@mailgun>" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.mailgun.net/v3/alias.netras.ai/messages");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("api:key-123").toString("base64")}`);
    const form = init!.body as FormData;
    expect(form.get("from")).toBe('"Shop  noreply@shop.example via Netras" <forwarder@alias.netras.ai>');
    expect(form.get("h:Reply-To")).toBe("Shop <noreply@shop.example>");
    expect(form.get("to")).toBe("alice@real.example");
  });

  it("marks 429 and 5xx retryable, other errors not, and network errors retryable", async () => {
    const respond = (status: number) => (async () => new Response("nope", { status })) as unknown as typeof fetch;
    expect(await sendMailgunForward(config, input, respond(503))).toMatchObject({ ok: false, retryable: true });
    expect(await sendMailgunForward(config, input, respond(429))).toMatchObject({ ok: false, retryable: true });
    expect(await sendMailgunForward(config, input, respond(401))).toMatchObject({ ok: false, retryable: false });
    const down = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await sendMailgunForward(config, input, down)).toMatchObject({ ok: false, retryable: true });
  });
});
