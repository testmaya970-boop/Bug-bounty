import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Standard Webhooks signing (https://www.standardwebhooks.com): every delivery carries
//   webhook-id         stable per message (retries and replays repeat it, so receivers dedupe)
//   webhook-timestamp  unix seconds when sent (receivers reject anything older than 5 minutes)
//   webhook-signature  "v1,<base64 HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)>", space
//                      separated when two secrets are valid during a rotation
// The secret is "whsec_" + base64 of the key bytes.

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64")}`;
}

function keyBytes(secret: string): Buffer {
  return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  return `v1,${createHmac("sha256", keyBytes(secret)).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

export function webhookHeaders(secrets: string[], id: string, timestamp: number, body: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": secrets.map((s) => signWebhook(s, id, timestamp, body)).join(" "),
  };
}

/** What a receiver does; used by our tests and documented for customers. */
export function verifyWebhook(secret: string, headers: Record<string, string | undefined>, body: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  const id = headers["webhook-id"];
  const ts = Number(headers["webhook-timestamp"]);
  const sigs = headers["webhook-signature"];
  if (!id || !Number.isFinite(ts) || !sigs || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, id, ts, body));
  return sigs.split(" ").some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
