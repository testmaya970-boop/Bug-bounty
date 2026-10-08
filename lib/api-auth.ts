import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { withAnonTransaction, callRpc } from "@/lib/db/pool";

/**
 * Resolves an `Authorization: Bearer unpatched_pat_...` header to a real, verified user id
 * -- the missing half of docs/decisions/0055's personal access tokens. verify_api_token
 * is `security definer`, so it already runs against `public.personal_access_tokens` with
 * the function owner's privileges regardless of caller role -- no RLS bypass is needed at
 * the connection level, only EXECUTE privilege on the function itself, which is granted
 * to `anon` (0055) precisely because a bearer-token request has no cookie session for
 * `authenticated` to apply. Returns null for a missing header, malformed header, or a
 * token that does not match any live (non-revoked) row -- the caller (an API route) maps
 * that uniformly to 401, never distinguishing "no token" from "bad token" in the
 * response, the same information-hiding principle submit_report's own scope-match
 * rejection uses (0008).
 */
// API access is "coming soon" (product direction, 2026-10-08): no token is accepted, not
// even one issued before the settings page was closed. Flip to true at launch.
const API_TOKENS_ENABLED = false;

export async function resolveBearerUserId(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header || !API_TOKENS_ENABLED) return null;

  // Any `<brand>_pat_` prefix: tokens issued before the rename keep working (the hash decides).
  const match = /^Bearer\s+([a-z]+_pat_\S+)$/.exec(header.trim());
  if (!match) return null;

  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  try {
    const rows = await withAnonTransaction((client) => callRpc<{ verify_api_token: string | null }>(client, "public.verify_api_token", [tokenHash]));
    return rows[0]?.verify_api_token ?? null;
  } catch {
    return null;
  }
}
