import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

/**
 * Real personal access tokens for /api/v1/* -- a real bearer-token auth path, not a
 * settings page with nothing behind it (see app/api/v1/reports/route.ts, which now
 * accepts one). Generated server-side, hashed with SHA-256 before storage (same
 * convention as organization_invitations' token_hash), returned in plaintext exactly
 * once. See docs/decisions/0055.
 */

export type ApiToken = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

const TOKEN_PREFIX = "sentinel_pat_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listMyApiTokens(): Promise<ApiToken[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ id: string; name: string; created_at: string; last_used_at: string | null }>(client, "public.list_my_api_tokens"),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at }));
}

/** Returns the real plaintext token exactly once -- the caller must show it now; it can
 * never be retrieved again, only revoked. Also returns the real new row's id (needed by
 * the UI to update its list immediately, without a full server round-trip -- see
 * docs/decisions/0055.1). */
export async function createMyApiToken(name: string): Promise<{ token: string; id: string }> {
  const actor = await getCurrentUser();
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ create_my_api_token: string }>(client, "public.create_my_api_token", [name, hashToken(token)]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { token, id: rows[0].create_my_api_token };
}

export async function revokeMyApiToken(id: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.revoke_my_api_token", [id]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** A real, working hash lookup against personal_access_tokens (updates last_used_at on a
 * match). This cookie-scoped variant is kept for completeness but is NOT what
 * app/api/v1/reports/route.ts actually calls -- a bearer-token request has no cookie
 * session, so lib/api-auth.ts's resolveBearerUserId calls the same RPC through
 * withServiceRoleTransaction instead (202609030003). Genuinely wired end to end as of
 * 0059. */
export async function verifyApiToken(token: string): Promise<string | null> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ verify_api_token: string | null }>(client, "public.verify_api_token", [hashToken(token)]),
    );
    return rows[0]?.verify_api_token ?? null;
  } catch {
    return null;
  }
}
