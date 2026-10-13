import "server-only";
import { randomUUID, createHmac } from "node:crypto";
import { envGroup, hmacSha256Hex, providerFetch, safeEqual, sandboxAllowed } from "./common";

// Identity verification behind one interface. A researcher picks a region; each region has
// its own provider, chosen by env:
//   IDENTITY_PROVIDER_IN     = none | sandbox | cashfree   (DigiLocker: Aadhaar / PAN)
//   IDENTITY_PROVIDER_GLOBAL = none | sandbox | persona    (document + selfie)
// "none" (the default) keeps today's manual document review as the only path.
// Contracts: docs/integrations/provider-contracts.md (sources: vendors' official docs).

export type IdentityRegion = "IN" | "GLOBAL";
export type IdentityOutcome = "approved" | "declined" | "expired" | "error";
export type IdentityStart = { reference: string; redirectUrl: string };
export type IdentityWebhookResult = { reference: string; status: IdentityOutcome; reason?: string };

export type IdentityProvider = {
  readonly name: string;
  readonly region: IdentityRegion;
  readonly mode: "sandbox" | "live";
  start(input: { userId: string; email: string | null; returnUrl: string; idempotencyKey: string }): Promise<IdentityStart>;
  /** Verifies the signature and returns a FINAL result, or null for non-final events.
   * Throws on a bad or stale signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<IdentityWebhookResult | null>;
};

/** Signed timestamps older/newer than this are refused (replay window). */
const WEBHOOK_TOLERANCE_SECONDS = 300;
function assertFresh(unixSeconds: number): void {
  if (!Number.isFinite(unixSeconds) || Math.abs(Date.now() / 1000 - unixSeconds) > WEBHOOK_TOLERANCE_SECONDS) throw new Error("stale or missing webhook timestamp");
}

function sandboxProvider(region: IdentityRegion): IdentityProvider {
  return {
    name: "sandbox",
    region,
    mode: "sandbox",
    async start() {
      const reference = `sbx_idv_${randomUUID()}`;
      return { reference, redirectUrl: `/settings/identity/sandbox?ref=${encodeURIComponent(reference)}` };
    },
    async parseWebhook() {
      throw new Error("the sandbox has no webhook; results come from the sandbox page");
    },
  };
}

/** Persona inquiries (global). One-time hosted link; result by signed webhook. */
function personaProvider(): IdentityProvider | null {
  const env = envGroup(["PERSONA_API_KEY", "PERSONA_TEMPLATE_ID", "PERSONA_WEBHOOK_SECRET"] as const);
  if (!env) return null;
  return {
    name: "persona",
    region: "GLOBAL",
    mode: "live",
    async start({ userId, idempotencyKey }) {
      const body = await providerFetch<{ data: { id: string }; meta: { "one-time-link"?: string } }>("https://api.withpersona.com/api/v1/inquiries", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.PERSONA_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, "Key-Inflection": "kebab" },
        body: JSON.stringify({
          data: { attributes: { "inquiry-template-id": env.PERSONA_TEMPLATE_ID } },
          meta: { "auto-create-account-reference-id": userId, "auto-create-one-time-link": true },
        }),
      });
      const link = body.meta?.["one-time-link"];
      if (!body.data?.id || !link) throw new Error("Persona did not return an inquiry link");
      return { reference: body.data.id, redirectUrl: link };
    },
    async parseWebhook(rawBody, headers) {
      // Persona-Signature: "t=<unix>,v1=<hex>" (two space-separated sets during rotation).
      const header = headers.get("persona-signature") ?? "";
      const sets = header.split(" ").map((part) => Object.fromEntries(part.split(",").map((kv) => kv.split("=") as [string, string])));
      const valid = sets.some((s) => s.t && s.v1 && safeEqual(hmacSha256Hex(env.PERSONA_WEBHOOK_SECRET, `${s.t}.${rawBody}`), s.v1));
      if (!valid) throw new Error("invalid Persona signature");
      assertFresh(Number(sets[0]?.t));
      const event = JSON.parse(rawBody) as { data?: { attributes?: { name?: string; payload?: { data?: { id?: string } } } } };
      const name = event.data?.attributes?.name;
      const reference = event.data?.attributes?.payload?.data?.id;
      if (!reference) return null;
      const status: IdentityOutcome | null =
        name === "inquiry.approved" ? "approved" : name === "inquiry.declined" || name === "inquiry.failed" ? "declined" : name === "inquiry.expired" ? "expired" : null;
      return status ? { reference, status, reason: status === "approved" ? undefined : name } : null;
    },
  };
}

/** Cashfree Secure ID DigiLocker (India): Aadhaar/PAN via the user's own DigiLocker consent. */
function cashfreeProvider(): IdentityProvider | null {
  const env = envGroup(["CASHFREE_CLIENT_ID", "CASHFREE_CLIENT_SECRET"] as const);
  if (!env) return null;
  const base = process.env.CASHFREE_ENV === "production" ? "https://api.cashfree.com/verification" : "https://sandbox.cashfree.com/verification";
  return {
    name: "cashfree",
    region: "IN",
    mode: "live",
    async start({ returnUrl, idempotencyKey }) {
      // verification_id is ours (<= 50 chars); a duplicate is a 409 -- the idempotency key.
      const verificationId = `unp_${idempotencyKey.replaceAll("-", "").slice(0, 40)}`;
      const body = await providerFetch<{ url?: string; status?: string }>(`${base}/digilocker`, {
        method: "POST",
        headers: { "x-client-id": env.CASHFREE_CLIENT_ID, "x-client-secret": env.CASHFREE_CLIENT_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ verification_id: verificationId, document_requested: ["AADHAAR", "PAN"], redirect_url: returnUrl, user_flow: "signin" }),
      });
      if (!body.url) throw new Error("Cashfree did not return a DigiLocker link");
      return { reference: verificationId, redirectUrl: body.url };
    },
    async parseWebhook(rawBody, headers) {
      // x-webhook-signature = base64(HMAC-SHA256(clientSecret, timestamp + rawBody)), no separator.
      const timestamp = headers.get("x-webhook-timestamp") ?? "";
      const signature = headers.get("x-webhook-signature") ?? "";
      const expected = createHmac("sha256", env.CASHFREE_CLIENT_SECRET).update(timestamp + rawBody).digest("base64");
      if (!signature || !safeEqual(expected, signature)) throw new Error("invalid Cashfree signature");
      assertFresh(Number(timestamp.length > 10 ? Number(timestamp) / 1000 : timestamp));
      const event = JSON.parse(rawBody) as { data?: { verification_id?: string; status?: string } };
      const reference = event.data?.verification_id;
      const raw = event.data?.status;
      if (!reference || !raw) return null;
      const status: IdentityOutcome | null = raw === "AUTHENTICATED" ? "approved" : raw === "CONSENT_DENIED" ? "declined" : raw === "EXPIRED" ? "expired" : null;
      return status ? { reference, status, reason: status === "approved" ? undefined : raw } : null;
    },
  };
}

export function identityProviderName(region: IdentityRegion, env: NodeJS.ProcessEnv = process.env): string {
  return (region === "IN" ? env.IDENTITY_PROVIDER_IN : env.IDENTITY_PROVIDER_GLOBAL)?.trim() || "none";
}

/** The configured provider for a region, or null (manual review only, or missing credentials). */
export function selectIdentityProvider(region: IdentityRegion, env: NodeJS.ProcessEnv = process.env): IdentityProvider | null {
  const name = identityProviderName(region, env);
  if (name === "sandbox") return sandboxAllowed(env) ? sandboxProvider(region) : null;
  if (name === "persona" && region === "GLOBAL") return personaProvider();
  if (name === "cashfree" && region === "IN") return cashfreeProvider();
  return null;
}

/** For webhooks: the live adapter by name, whatever region routes to it. */
export function identityProviderByName(name: string): IdentityProvider | null {
  return name === "persona" ? personaProvider() : name === "cashfree" ? cashfreeProvider() : null;
}

/** Env var names each live provider needs (for the Integrations page; values never shown). */
export const IDENTITY_ENV: Record<string, string[]> = {
  persona: ["PERSONA_API_KEY", "PERSONA_TEMPLATE_ID", "PERSONA_WEBHOOK_SECRET"],
  cashfree: ["CASHFREE_CLIENT_ID", "CASHFREE_CLIENT_SECRET", "CASHFREE_ENV (optional: production)"],
};
