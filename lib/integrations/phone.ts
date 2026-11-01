import "server-only";
import { randomInt } from "node:crypto";
import { envGroup, providerFetch, sandboxAllowed } from "./common";

// Phone verification by one-time code, routed by country code:
//   +91  -> PHONE_PROVIDER_IN     = none | sandbox | msg91
//   else -> PHONE_PROVIDER_GLOBAL = none | sandbox | twilio
// Real providers generate and check the code themselves. The sandbox generates one locally
// (stored hashed) and the page shows it, since no SMS is sent.
// Contracts: docs/integrations/provider-contracts.md.

export type PhoneStart = { reference: string | null; sandboxCode?: string };

export type PhoneProvider = {
  readonly name: string;
  readonly mode: "sandbox" | "live";
  start(input: { e164: string }): Promise<PhoneStart>;
  /** True only when the provider confirms the code. */
  check(input: { e164: string; reference: string | null; code: string }): Promise<boolean>;
};

const sandboxProvider: PhoneProvider = {
  name: "sandbox",
  mode: "sandbox",
  async start() {
    return { reference: null, sandboxCode: String(randomInt(0, 1_000_000)).padStart(6, "0") };
  },
  async check() {
    throw new Error("sandbox codes are checked against the stored hash");
  },
};

/** MSG91 OTP v5 (India; needs a DLT-approved template). Branch on `type`, not HTTP status. */
function msg91Provider(): PhoneProvider | null {
  const env = envGroup(["MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID"] as const);
  if (!env) return null;
  const mobile = (e164: string) => e164.replace(/^\+/, "");
  return {
    name: "msg91",
    mode: "live",
    async start({ e164 }) {
      const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(env.MSG91_TEMPLATE_ID)}&mobile=${mobile(e164)}&otp_length=6&otp_expiry=10`;
      const body = await providerFetch<{ type?: string; request_id?: string; message?: string }>(url, { method: "POST", headers: { authkey: env.MSG91_AUTH_KEY, "Content-Type": "application/json" }, body: "{}" });
      if (body.type !== "success") throw new Error(`MSG91 refused: ${body.message ?? "unknown"}`);
      return { reference: body.request_id ?? null };
    },
    async check({ e164, code }) {
      const url = `https://control.msg91.com/api/v5/otp/verify?otp=${encodeURIComponent(code)}&mobile=${mobile(e164)}`;
      const body = await providerFetch<{ type?: string }>(url, { headers: { authkey: env.MSG91_AUTH_KEY } });
      return body.type === "success";
    },
  };
}

/** Twilio Verify (global). A 404 on check means the verification is gone (expired/used). */
function twilioProvider(): PhoneProvider | null {
  const env = envGroup(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const);
  if (!env) return null;
  const auth = `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
  const base = `https://verify.twilio.com/v2/Services/${encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID)}`;
  const form = (fields: Record<string, string>) => ({ method: "POST", headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
  return {
    name: "twilio",
    mode: "live",
    async start({ e164 }) {
      const body = await providerFetch<{ sid?: string; status?: string }>(`${base}/Verifications`, form({ To: e164, Channel: "sms" }));
      return { reference: body.sid ?? null };
    },
    async check({ e164, code }) {
      try {
        const body = await providerFetch<{ status?: string }>(`${base}/VerificationCheck`, form({ To: e164, Code: code }));
        return body.status === "approved";
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("HTTP 404")) return false;
        throw error;
      }
    },
  };
}

export function phoneProviderName(countryCode: string, env: NodeJS.ProcessEnv = process.env): string {
  return (countryCode === "+91" ? env.PHONE_PROVIDER_IN : env.PHONE_PROVIDER_GLOBAL)?.trim() || "none";
}

export function selectPhoneProvider(countryCode: string, env: NodeJS.ProcessEnv = process.env): PhoneProvider | null {
  const name = phoneProviderName(countryCode, env);
  if (name === "sandbox") return sandboxAllowed(env) ? sandboxProvider : null;
  if (name === "msg91" && countryCode === "+91") return msg91Provider();
  if (name === "twilio" && countryCode !== "+91") return twilioProvider();
  return null;
}

export const PHONE_ENV: Record<string, string[]> = {
  msg91: ["MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"],
};

/** "+91", "98765 43210" -> "+919876543210", or null if it isn't a plausible E.164 number. */
export function toE164(countryCode: string, number: string): string | null {
  const cc = countryCode.trim();
  const digits = number.replace(/[\s\-().]/g, "");
  if (!/^\+[0-9]{1,4}$/.test(cc) || !/^[0-9]{4,14}$/.test(digits)) return null;
  const e164 = `${cc}${digits.replace(/^0+/, "")}`;
  return e164.length <= 16 ? e164 : null;
}
