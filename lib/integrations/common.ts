import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withServiceRoleTransaction } from "@/lib/db/pool";

// Shared plumbing for the third-party integration modules (identity, payments, phone).
// Provider selection is configuration only (env vars); keys never reach the UI or the DB.

export type IntegrationModule = "identity" | "payments" | "phone" | "cards";

/** True only off production, or in the local prod-test harness. Sandbox providers simulate a
 * third party in-app and must never run where real people verify or get paid. */
export function sandboxAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  // LOCAL_PROD_TEST counts only on a loopback origin, so the flag leaking into a real
  // deployment can never switch on self-approved identity checks or simulated payouts.
  const loopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.APP_ORIGIN ?? "");
  return env.NODE_ENV !== "production" || (env.LOCAL_PROD_TEST === "1" && loopback);
}

/** A short, PII-free trail for Platform -> Integrations. Never throws: a logging failure must
 * not turn a successful verification or payout into an error. */
export async function logIntegrationEvent(module: IntegrationModule, provider: string, kind: "call" | "webhook", outcome: "ok" | "error" | "rejected", detail?: string): Promise<void> {
  try {
    await withServiceRoleTransaction((client) =>
      client.query("insert into public.integration_events (module, provider, kind, outcome, detail) values ($1, $2, $3, $4, $5)", [module, provider, kind, outcome, detail?.slice(0, 500) ?? null]),
    );
  } catch {
    // ignored by design
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** fetch with a hard timeout and a ProviderError on non-2xx (body excerpt included, never secrets). */
export async function providerFetch<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 15_000) });
  } catch (error) {
    throw new ProviderError(`request failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
  const text = await response.text();
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}: ${text.slice(0, 300)}`, response.status >= 500 || response.status === 429);
  return (text ? JSON.parse(text) : {}) as T;
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time compare of two hex/ascii signatures of possibly different length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Every listed env var, or null when any is missing (the provider then reports "not configured"). */
export function envGroup<K extends string>(names: readonly K[], env: NodeJS.ProcessEnv = process.env): Record<K, string> | null {
  const values = {} as Record<K, string>;
  for (const name of names) {
    const value = env[name]?.trim();
    if (!value) return null;
    values[name] = value;
  }
  return values;
}
