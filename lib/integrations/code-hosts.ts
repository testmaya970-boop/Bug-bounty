import { createHmac, timingSafeEqual } from "node:crypto";

export interface GithubAppConfig {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
}

export function githubAppConfig(): GithubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const slug = process.env.GITHUB_APP_SLUG;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (
    !appId ||
    !slug ||
    !clientId ||
    !clientSecret ||
    !privateKey ||
    !webhookSecret
  ) {
    return null;
  }
  return { appId, slug, clientId, clientSecret, privateKey, webhookSecret };
}

export function verifyGithubSignature(
  secret: string,
  payload: Buffer,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyGitlabToken(
  expectedSecret: string,
  tokenHeader: string | null,
): boolean {
  if (!tokenHeader) return false;
  const a = Buffer.from(expectedSecret, "utf8");
  const b = Buffer.from(tokenHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
