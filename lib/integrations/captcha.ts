import "server-only";
import { logIntegrationEvent, sandboxAllowed } from "./common";

// Human check behind one interface, chosen by env like every other provider:
//   CAPTCHA_PROVIDER = none | sandbox | turnstile   (Cloudflare Turnstile)
//   TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY        (turnstile only)
// Asked on sign-up and on report submission from new or limited-tier researchers -- the two
// doors automated spam comes through. "none" (the default) keeps both open for local work.

export type CaptchaConfig = { provider: "none" } | { provider: "sandbox" } | { provider: "turnstile"; siteKey: string };

export const SANDBOX_CAPTCHA_TOKEN = "sandbox-human";

export function captchaConfig(env: NodeJS.ProcessEnv = process.env): CaptchaConfig {
  const p = env.CAPTCHA_PROVIDER ?? "none";
  if (p === "turnstile" && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) return { provider: "turnstile", siteKey: env.TURNSTILE_SITE_KEY };
  // Sandbox never runs in production: a checkbox must not stand in for a real check there.
  if (p === "sandbox" && sandboxAllowed(env)) return { provider: "sandbox" };
  return { provider: "none" };
}

/** True when the token proves a human (or no check is configured). Never throws. */
export async function verifyCaptcha(token: string | undefined, remoteIp: string | null, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const cfg = captchaConfig(env);
  if (cfg.provider === "none") return true;
  if (!token) return false;
  if (cfg.provider === "sandbox") return token === SANDBOX_CAPTCHA_TOKEN;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY ?? "", response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!json.success) void logIntegrationEvent("identity", "turnstile", "call", "rejected", (json["error-codes"] ?? []).join(","));
    return json.success === true;
  } catch (error) {
    void logIntegrationEvent("identity", "turnstile", "call", "error", error instanceof Error ? error.message : String(error));
    return false; // fail closed: a broken check must not wave spam through
  }
}
