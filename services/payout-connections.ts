import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNativeEnv } from "@/lib/env";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { logIntegrationEvent } from "@/lib/integrations/common";
import { selectPayoutConnectProvider, type PayoutConnectProviderName } from "@/lib/integrations/payout-connect";

// Connected payout accounts (202610280003). Only the server writes them: a pending row on start,
// and "connected" only after the callback proved the one-time state and the provider returned an
// account. The state is stored hashed, so the database alone can't be used to forge a callback.

export type PayoutConnection = { provider: PayoutConnectProviderName; status: "pending" | "connected" | "failed" | "disconnected"; mode: "sandbox" | "live"; accountLabel: string | null; failureReason: string | null; connectedAt: string | null };
export type PayoutConnectOption = { provider: PayoutConnectProviderName; available: boolean; mode: "sandbox" | "live" | null; connection: PayoutConnection | null };

const hashState = (state: string) => createHash("sha256").update(state).digest("hex");

export async function listMyPayoutConnectOptions(): Promise<PayoutConnectOption[]> {
  const actor = await getCurrentUser();
  type Row = { provider: PayoutConnectProviderName; status: PayoutConnection["status"]; mode: PayoutConnection["mode"]; account_label: string | null; failure_reason: string | null; connected_at: string | null };
  const rows = actor
    ? await withActorTransaction(actor.id, (c) =>
        c
          .query<Row>("select distinct on (provider) provider, status, mode, account_label, failure_reason, connected_at from public.researcher_payout_connections where user_id = $1 order by provider, (status = 'connected') desc, updated_at desc", [actor.id])
          .then((r) => r.rows),
      )
    : [];
  return (["paypal", "stripe"] as const).map((provider) => {
    const p = selectPayoutConnectProvider(provider);
    const r = rows.find((x) => x.provider === provider);
    return {
      provider,
      available: p !== null,
      mode: p?.mode ?? null,
      connection: r ? { provider, status: r.status, mode: r.mode, accountLabel: r.account_label, failureReason: r.failure_reason, connectedAt: r.connected_at ? new Date(r.connected_at).toISOString() : null } : null,
    };
  });
}

/** Creates the pending connection and returns where to send the researcher. */
export async function startPayoutConnection(provider: PayoutConnectProviderName): Promise<string> {
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  if (actor.accountType !== "researcher") throw new OrganizationServiceError("Payout accounts are for researcher accounts.", "FORBIDDEN");
  const adapter = selectPayoutConnectProvider(provider);
  if (!adapter) throw new OrganizationServiceError("That provider isn't available yet. Use the manual payout details below.", "NOT_AVAILABLE");
  const state = randomBytes(24).toString("base64url");
  await withServiceRoleTransaction((c) => c.query("insert into public.researcher_payout_connections (user_id, provider, state_hash, mode) values ($1, $2, $3, $4)", [actor.id, provider, hashState(state), adapter.mode]));
  const origin = getNativeEnv().APP_ORIGIN.replace(/\/$/, "");
  return adapter.authorizeUrl({ state, origin, callbackUrl: `${origin}/api/payout-connect/${provider}/callback` });
}

/** The provider's callback. The state must be one this signed-in researcher started, still pending,
 * and under an hour old. Returns the outcome for the redirect back to settings. */
export async function completePayoutConnection(provider: PayoutConnectProviderName, params: URLSearchParams): Promise<{ ok: true } | { ok: false; reason: string }> {
  const actor = await getCurrentUser();
  const adapter = selectPayoutConnectProvider(provider);
  const state = params.get("state") ?? "";
  if (!actor || !adapter || !state) return { ok: false, reason: "The connection could not be verified. Start again." };
  const pending = await withServiceRoleTransaction((c) =>
    c
      .query<{ id: string }>("select id from public.researcher_payout_connections where state_hash = $1 and user_id = $2 and provider = $3 and status = 'pending' and created_at > now() - interval '1 hour'", [hashState(state), actor.id, provider])
      .then((r) => r.rows[0]),
  );
  if (!pending) return { ok: false, reason: "That connection link expired or was already used. Start again." };
  try {
    const account = await adapter.completeCallback(params);
    await withServiceRoleTransaction(async (c) => {
      // One connected account per provider: a new one replaces the old.
      await c.query("update public.researcher_payout_connections set status = 'disconnected', updated_at = now() where user_id = $1 and provider = $2 and status = 'connected'", [actor.id, provider]);
      await c.query("update public.researcher_payout_connections set status = 'connected', account_reference = $2, account_label = $3, connected_at = now(), updated_at = now() where id = $1", [pending.id, account.accountReference, account.accountLabel]);
    });
    await logIntegrationEvent("payments", `connect-${provider}`, "call", "ok");
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "The provider did not complete the connection.";
    await withServiceRoleTransaction((c) => c.query("update public.researcher_payout_connections set status = 'failed', failure_reason = $2, updated_at = now() where id = $1", [pending.id, reason]));
    await logIntegrationEvent("payments", `connect-${provider}`, "call", "error", reason);
    return { ok: false, reason };
  }
}

export async function disconnectPayoutConnection(provider: PayoutConnectProviderName): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (c) => callRpc(c, "public.disconnect_my_payout_connection", [provider]));
  } catch (error) {
    mapError(error as { message: string });
  }
}
