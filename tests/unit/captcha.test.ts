import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/pool", () => ({ withServiceRoleTransaction: vi.fn(async () => undefined) }));

import { captchaConfig, verifyCaptcha, SANDBOX_CAPTCHA_TOKEN } from "../../lib/integrations/captcha";
import { buildContentSecurityPolicy } from "../../lib/security/csp";

const dev = { NODE_ENV: "development", APP_ORIGIN: "http://localhost:3000" } as unknown as NodeJS.ProcessEnv;
const prod = { NODE_ENV: "production", APP_ORIGIN: "https://unpatched.example" } as unknown as NodeJS.ProcessEnv;

afterEach(() => vi.unstubAllGlobals());

describe("captcha", () => {
  it("is off unless configured", async () => {
    expect(captchaConfig(dev)).toEqual({ provider: "none" });
    expect(await verifyCaptcha(undefined, null, dev)).toBe(true);
  });

  it("sandbox accepts only its own token, and never runs in production", async () => {
    const env = { ...dev, CAPTCHA_PROVIDER: "sandbox" };
    expect(await verifyCaptcha(SANDBOX_CAPTCHA_TOKEN, null, env)).toBe(true);
    expect(await verifyCaptcha("anything", null, env)).toBe(false);
    expect(await verifyCaptcha(undefined, null, env)).toBe(false);
    expect(captchaConfig({ ...prod, CAPTCHA_PROVIDER: "sandbox" })).toEqual({ provider: "none" });
  });

  it("turnstile needs both keys, trusts only Cloudflare's verdict, and fails closed", async () => {
    expect(captchaConfig({ ...prod, CAPTCHA_PROVIDER: "turnstile", TURNSTILE_SITE_KEY: "site" })).toEqual({ provider: "none" });
    const env = { ...prod, CAPTCHA_PROVIDER: "turnstile", TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha("tok", "198.51.100.4", env)).toBe(true);
    const sent = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(sent.get("secret")).toBe("secret");
    expect(sent.get("remoteip")).toBe("198.51.100.4");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }))));
    expect(await verifyCaptcha("tok", null, env)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await verifyCaptcha("tok", null, env)).toBe(false);
    expect(await verifyCaptcha(undefined, null, env)).toBe(false);
  });

  it("the CSP frames only Cloudflare's challenge host", () => {
    const frame = buildContentSecurityPolicy("n", false).split("; ").find((d) => d.startsWith("frame-src"));
    expect(frame).toBe("frame-src https://challenges.cloudflare.com");
  });
});
