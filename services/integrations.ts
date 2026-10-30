import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNativeEnv } from "@/lib/env";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { logIntegrationEvent, sandboxAllowed } from "@/lib/integrations/common";
import { IDENTITY_ENV, identityProviderName, selectIdentityProvider, type IdentityRegion } from "@/lib/integrations/identity";
import { PHONE_ENV, phoneProviderName, selectPhoneProvider, toE164 } from "@/lib/integrations/phone";
import { PAYOUT_ENV, payoutProviderName } from "@/lib/payment-provider";
import { CARD_ENV, cardProviderName, gatewayProviderName } from "@/lib/integrations/card";

export { OrganizationServiceError };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function requireResearcher() {
  const user = await getCurrentUser();
  if (!user) throw new OrganizationServiceError("Sign in first.", "AUTH_REQUIRED");
  if (user.accountType !== "researcher") throw new OrganizationServiceError("Identity and phone verification are for researcher accounts.", "FORBIDDEN");
  return user;
}

// --- Identity ---------------------------------------------------------------------------

export type IdentityVerificationRecord = { id: string; provider: string; region: IdentityRegion; status: "pending" | "approved" | "declined" | "expired" | "error"; failureReason: string | null; createdAt: string; completedAt: string | null };

export async function listMyIdentityVerifications(): Promise<IdentityVerificationRecord[]> {
  const user = await requireResearcher();
  const rows = await withActorTransaction(user.id, (client) =>
    client
      .query<{ id: string; provider: string; region: IdentityRegion; status: IdentityVerificationRecord["status"]; failure_reason: string | null; created_at: string; completed_at: string | null }>(
        "select id, provider, region, status, failure_reason, created_at, completed_at from public.identity_verifications where user_id = $1 order by created_at desc limit 5",
        [user.id],
      )
      .then((r) => r.rows),
  );
  return rows.map((r) => ({ id: r.id, provider: r.provider, region: r.region, status: r.status, failureReason: r.failure_reason, createdAt: r.created_at, completedAt: r.completed_at }));
}

/** Which regions can verify automatically right now (others fall back to manual review). */
export function availableIdentityRegions(): { region: IdentityRegion; mode: "sandbox" | "live" }[] {
  return (["IN", "GLOBAL"] as const).flatMap((region) => {
    const provider = selectIdentityProvider(region);
    return provider ? [{ region, mode: provider.mode }] : [];
  });
}

/** Which phone routes can actually send a code: India (+91) and everywhere else. The
 * settings page offers only these, instead of a form that always answers "not available". */
export function availablePhoneRoutes(): { india: boolean; global: boolean } {
  return { india: selectPhoneProvider("+91") !== null, global: selectPhoneProvider("+1") !== null };
}

/** Opens a hosted verification and returns where to send the browser. */
export async function startIdentityVerification(region: IdentityRegion): Promise<string> {
  const user = await requireResearcher();
  const provider = selectIdentityProvider(region);
  if (!provider) throw new OrganizationServiceError("Automatic verification isn't available for this region yet -- use manual document review.", "NOT_AVAILABLE");
  const returnUrl = `${getNativeEnv().APP_ORIGIN}/settings/identity?returned=1`;
  let start;
  try {
    start = await provider.start({ userId: user.id, email: user.email, returnUrl, idempotencyKey: randomUUID() });
  } catch (error) {
    await logIntegrationEvent("identity", provider.name, "call", "error", error instanceof Error ? error.message : String(error));
    throw new OrganizationServiceError("The verification service didn't respond. Try again in a minute.", "PROVIDER_ERROR");
  }
  await withServiceRoleTransaction((client) =>
    client.query("insert into public.identity_verifications (user_id, provider, region, provider_reference) values ($1, $2, $3, $4)", [user.id, provider.name, region, start.reference]),
  );
  await logIntegrationEvent("identity", provider.name, "call", "ok");
  return start.redirectUrl;
}

/** Sandbox only: the in-app stand-in for the provider's result. Never available in production. */
export async function completeSandboxIdentityVerification(reference: string, outcome: "approved" | "declined"): Promise<void> {
  const user = await requireResearcher();
  if (!sandboxAllowed()) throw new OrganizationServiceError("Not available.", "FORBIDDEN");
  const owned = await withServiceRoleTransaction((client) =>
    client.query("select 1 from public.identity_verifications where provider = 'sandbox' and provider_reference = $1 and user_id = $2 and status = 'pending'", [reference, user.id]).then((r) => r.rowCount),
  );
  if (!owned) throw new OrganizationServiceError("That sandbox session isn't open.", "NOT_FOUND");
  await withServiceRoleTransaction((client) => callRpc(client, "public.complete_identity_verification", ["sandbox", reference, outcome, outcome === "declined" ? "Declined in the sandbox" : null]));
  await logIntegrationEvent("identity", "sandbox", "webhook", "ok", `sandbox ${outcome}`);
}

// --- Phone ------------------------------------------------------------------------------

export type PhoneStatus = { verified: boolean; countryCode: string | null; last4: string | null; pending: { last4: string; sandboxCode?: string } | null };

export async function getMyPhoneStatus(): Promise<PhoneStatus> {
  const user = await requireResearcher();
  const { rows } = await withServiceRoleTransaction((client) =>
    client.query<{ phone_status: string | null; country_code: string | null; verified_last4: string | null; pending_last4: string | null }>(
      `select (select phone_status::text from public.researcher_kyc where user_id = $1) as phone_status,
              (select phone_country_code from public.researcher_kyc where user_id = $1) as country_code,
              (select phone_last4 from public.phone_verifications where user_id = $1 and status = 'approved' order by verified_at desc limit 1) as verified_last4,
              (select phone_last4 from public.phone_verifications where user_id = $1 and status = 'pending' and expires_at > now() order by created_at desc limit 1) as pending_last4`,
      [user.id],
    ),
  );
  const row = rows[0];
  return { verified: row.phone_status === "verified", countryCode: row.country_code, last4: row.verified_last4, pending: row.pending_last4 ? { last4: row.pending_last4 } : null };
}

/** Sends a code. Returns the code only in sandbox mode (no SMS is sent there). */
export async function startPhoneVerification(countryCode: string, number: string): Promise<{ sandboxCode?: string }> {
  const user = await requireResearcher();
  const e164 = toE164(countryCode, number);
  if (!e164) throw new OrganizationServiceError("Enter a valid phone number with its country code.", "INVALID_INPUT");
  const provider = selectPhoneProvider(countryCode);
  if (!provider) throw new OrganizationServiceError("Phone verification isn't available for this country yet.", "NOT_AVAILABLE");
  let start;
  try {
    start = await provider.start({ e164 });
  } catch (error) {
    await logIntegrationEvent("phone", provider.name, "call", "error", error instanceof Error ? error.message : String(error));
    throw new OrganizationServiceError("The SMS service didn't respond. Try again in a minute.", "PROVIDER_ERROR");
  }
  try {
    await withServiceRoleTransaction((client) =>
      callRpc(client, "public.start_phone_verification", [user.id, countryCode, e164, provider.name, start.reference, start.sandboxCode ? sha256(start.sandboxCode) : null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  await logIntegrationEvent("phone", provider.name, "call", "ok");
  return { sandboxCode: start.sandboxCode };
}

export async function checkPhoneCode(code: string): Promise<void> {
  const user = await requireResearcher();
  if (!/^[0-9]{4,10}$/.test(code.trim())) throw new OrganizationServiceError("Enter the code from the SMS.", "INVALID_INPUT");
  type Pending = { id: string; provider: string; country_code: string; e164: string; provider_reference: string | null; code_hash: string | null; attempts: number; expired: boolean };
  const pending = (await withServiceRoleTransaction((client) => callRpc<Pending>(client, "public.get_pending_phone_verification", [user.id])))[0];
  if (!pending || pending.expired) throw new OrganizationServiceError("That code has expired. Send a new one.", "EXPIRED");
  if (pending.attempts >= 5) throw new OrganizationServiceError("Too many wrong codes. Send a new one.", "RATE_LIMITED");
  await withServiceRoleTransaction((client) => client.query("update public.phone_verifications set attempts = attempts + 1 where id = $1", [pending.id]));

  let ok: boolean;
  if (pending.provider === "sandbox") {
    ok = pending.code_hash !== null && pending.code_hash === sha256(code.trim());
  } else {
    const provider = selectPhoneProvider(pending.country_code);
    if (!provider || provider.name !== pending.provider) throw new OrganizationServiceError("Phone verification is temporarily unavailable.", "NOT_AVAILABLE");
    try {
      ok = await provider.check({ e164: pending.e164, reference: pending.provider_reference, code: code.trim() });
    } catch (error) {
      await logIntegrationEvent("phone", provider.name, "call", "error", error instanceof Error ? error.message : String(error));
      throw new OrganizationServiceError("The SMS service didn't respond. Try again in a minute.", "PROVIDER_ERROR");
    }
  }
  if (!ok) throw new OrganizationServiceError("That code didn't match.", "INVALID_CODE");
  await withServiceRoleTransaction((client) => callRpc(client, "public.record_phone_verified", [pending.id]));
}

// --- Platform overview --------------------------------------------------------------------

export type IntegrationStatus = {
  module: "identity" | "payments" | "phone" | "cards";
  route: string;
  provider: string;
  mode: "none" | "manual" | "sandbox" | "live" | "misconfigured";
  requiredEnv: string[];
  missingEnv: string[];
};

function status(module: IntegrationStatus["module"], route: string, provider: string, envMap: Record<string, string[]>): IntegrationStatus {
  const requiredEnv = envMap[provider] ?? [];
  const missingEnv = requiredEnv.filter((name) => !name.includes("(optional") && !process.env[name]?.trim());
  const mode: IntegrationStatus["mode"] =
    provider === "none" ? "none" : provider === "manual" ? "manual" : provider === "sandbox" ? (sandboxAllowed() ? "sandbox" : "misconfigured") : missingEnv.length ? "misconfigured" : "live";
  return { module, route, provider, mode, requiredEnv, missingEnv };
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    status("identity", "India (Aadhaar / PAN via DigiLocker)", identityProviderName("IN"), IDENTITY_ENV),
    status("identity", "Rest of world (document + selfie)", identityProviderName("GLOBAL"), IDENTITY_ENV),
    status("payments", "INR payouts (bank transfer)", payoutProviderName("INR"), PAYOUT_ENV),
    status("payments", "Other currencies (PayPal)", payoutProviderName("USD"), PAYOUT_ENV),
    status("cards", "INR card top-ups (Razorpay)", cardProviderName("INR"), CARD_ENV),
    status("cards", "USD card top-ups (Stripe)", cardProviderName("USD"), CARD_ENV),
    // PayPal's own sandbox (PAYPAL_ENV, default sandbox) shows as sandbox, not live.
    ((s) => (s.provider === "paypal" && s.mode === "live" && process.env.PAYPAL_ENV?.trim() !== "live" ? { ...s, mode: "sandbox" as const } : s))(status("cards", "USD top-ups (PayPal)", gatewayProviderName("paypal"), CARD_ENV)),
    status("phone", "India (+91)", phoneProviderName("+91"), PHONE_ENV),
    status("phone", "Rest of world", phoneProviderName("+1"), PHONE_ENV),
  ];
}

export type IntegrationEvent = { module: string; provider: string; kind: string; outcome: string; detail: string | null; createdAt: string };

/** Platform admins only (checked by the page; the table is service-role only). */
export async function listRecentIntegrationEvents(limit = 25): Promise<IntegrationEvent[]> {
  const rows = await withServiceRoleTransaction((client) =>
    client.query<{ module: string; provider: string; kind: string; outcome: string; detail: string | null; created_at: string }>("select module, provider, kind, outcome, detail, created_at from public.integration_events order by created_at desc limit $1", [limit]).then((r) => r.rows),
  );
  return rows.map((r) => ({ module: r.module, provider: r.provider, kind: r.kind, outcome: r.outcome, detail: r.detail, createdAt: r.created_at }));
}

export type SandboxPayout = { attemptId: string; reference: string; amountMinorUnits: number; currency: string; createdAt: string };

export async function listPendingSandboxPayouts(): Promise<SandboxPayout[]> {
  const rows = await withServiceRoleTransaction((client) =>
    client
      .query<{ id: string; provider_reference_id: string; requested_amount_minor_units: string; currency: string; created_at: string }>(
        "select id, provider_reference_id, requested_amount_minor_units, currency, created_at from public.payment_attempts where provider = 'sandbox' and state = 'pending_provider' order by created_at desc limit 20",
      )
      .then((r) => r.rows),
  );
  return rows.map((r) => ({ attemptId: r.id, reference: r.provider_reference_id, amountMinorUnits: Number(r.requested_amount_minor_units), currency: r.currency, createdAt: r.created_at }));
}

/** Sandbox only: stands in for the provider's webhook. The caller must be a platform admin. */
export async function completeSandboxPayout(reference: string, outcome: "succeeded" | "failed"): Promise<void> {
  if (!sandboxAllowed()) throw new OrganizationServiceError("Not available.", "FORBIDDEN");
  await withServiceRoleTransaction((client) => callRpc(client, "public.record_provider_payment_result", ["sandbox", reference, outcome, outcome === "failed" ? "sandbox_failed" : null, outcome === "failed" ? "Failed in the sandbox" : null]));
  await logIntegrationEvent("payments", "sandbox", "webhook", "ok", `sandbox ${outcome}`);
}
