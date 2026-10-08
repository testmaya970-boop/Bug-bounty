import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mailgun, for researcher email aliases (db/migrations/202610080001): inbound routes POST
 * each message to /api/inbound/email, and forwarded copies are sent with Mailgun's
 * messages API from the alias domain. Configured entirely by env; the feature is off
 * (route 404, nothing shown to researchers) until all of it is set.
 */
export type AliasEmailConfig = {
  /** The alias subdomain, e.g. alias.netras.ai -- also the Mailgun sending domain. */
  domain: string;
  apiKey: string;
  webhookSigningKey: string;
  /** https://api.mailgun.net (US) or https://api.eu.mailgun.net (EU). */
  apiBase: string;
  /** Shown in the forwarded copy's From name, e.g. "attacker@x.com via Netras". */
  brandName: string;
};

export function getAliasEmailConfig(env: NodeJS.ProcessEnv = process.env): AliasEmailConfig | null {
  const domain = env.ALIAS_EMAIL_DOMAIN?.trim().toLowerCase();
  const apiKey = env.MAILGUN_API_KEY?.trim();
  const webhookSigningKey = env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim();
  if (!domain || !apiKey || !webhookSigningKey) return null;
  return {
    domain,
    apiKey,
    webhookSigningKey,
    apiBase: (env.MAILGUN_API_BASE?.trim() || "https://api.mailgun.net").replace(/\/$/, ""),
    brandName: env.ALIAS_EMAIL_BRAND?.trim() || "Netras",
  };
}

/** Mailgun signs every webhook: signature = HMAC-SHA256(signing key, timestamp + token).
 * The window is wide on purpose: Mailgun retries a failed delivery with the original
 * timestamp for up to ~8 hours. Replays inside it are stopped by the single-use token
 * (email_alias_forwards.provider_token); the window only bounds how long a captured
 * request is worth anything at all. */
export function verifyMailgunSignature(
  signingKey: string,
  fields: { timestamp?: string | null; token?: string | null; signature?: string | null },
  nowSeconds = Math.floor(Date.now() / 1000),
  maxSkewSeconds = 24 * 60 * 60,
): boolean {
  const { timestamp, token, signature } = fields;
  if (!timestamp || !token || !signature || !/^\d+$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > maxSkewSeconds) return false;
  const expected = createHmac("sha256", signingKey).update(timestamp + token).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** "alice@alias.netras.ai" -> "alice" when the domain is the alias domain, else null.
 * Plus-addressing is accepted and ignored (alice+shopify@ -> alice). */
export function aliasLocalPart(address: string, aliasDomain: string): string | null {
  const match = /^\s*<?([^@<>\s]+)@([^@<>\s]+?)>?\s*$/.exec(address);
  if (!match || match[2].toLowerCase() !== aliasDomain) return null;
  const local = match[1].toLowerCase().split("+")[0];
  return /^[a-z0-9_]{3,40}$/.test(local) ? local : null;
}

export type ForwardInput = {
  to: string;
  aliasAddress: string;
  originalFrom: string;
  subject: string;
  text: string | null;
  html: string | null;
  attachments: File[];
};

/** Sends the forwarded copy. From is the alias domain (so SPF/DKIM/DMARC pass); the original
 * sender is in the display name and Reply-To, so replying still reaches them. */
export async function sendMailgunForward(config: AliasEmailConfig, input: ForwardInput, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; id: string } | { ok: false; retryable: boolean; error: string }> {
  const form = new FormData();
  const senderLabel = input.originalFrom.replace(/[\r\n"<>]/g, " ").trim().slice(0, 120) || "unknown sender";
  form.append("from", `"${senderLabel} via ${config.brandName}" <forwarder@${config.domain}>`);
  form.append("to", input.to);
  form.append("subject", input.subject || "(no subject)");
  if (input.text) form.append("text", input.text);
  if (input.html) form.append("html", input.html);
  if (!input.text && !input.html) form.append("text", "(empty message)");
  form.append("h:Reply-To", input.originalFrom);
  form.append("h:X-Forwarded-For-Alias", input.aliasAddress);
  for (const file of input.attachments) form.append("attachment", file, file.name);

  let response: Response;
  try {
    response = await fetchImpl(`${config.apiBase}/v3/${config.domain}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString("base64")}` },
      body: form,
    });
  } catch (error) {
    return { ok: false, retryable: true, error: `network: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? "" };
  }
  const detail = (await response.text().catch(() => "")).slice(0, 200);
  // 429 and 5xx may succeed later; anything else (bad key, bad domain, rejected) won't.
  return { ok: false, retryable: response.status === 429 || response.status >= 500, error: `mailgun ${response.status}: ${detail}` };
}
