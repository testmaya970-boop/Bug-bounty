import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { withActorTransaction, withServiceRoleTransaction } from "@/lib/db/pool";
import { validateSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { VERIFIED_USER_ID_HEADER, VERIFIED_SESSION_ID_HEADER } from "@/lib/session/middleware";
import { perfMark, perfTimed } from "@/lib/perf-trace";
import type { AuthenticatedUser } from "@/types/auth";
import type { PoolClient } from "pg";

// public.users has row-level security enabled ("users read own profile": id = auth.uid()),
// so this query must run with the actor's own claims/role set (withActorTransaction) --
// the raw app runtime role (sentinel_app_runtime) has no BYPASSRLS and, with no claims
// set, auth.uid() resolves to nothing, so the policy never matches and this always
// returned zero rows regardless of userId (confirmed live). loadProfile itself stays a
// plain PoolClient-taking helper (not tied to withActorTransaction directly) so its two
// call sites below can each open their own actor-scoped transaction with the correct
// userId, rather than duplicating the query.
async function loadProfile(client: PoolClient, userId: string): Promise<AuthenticatedUser> {
  const { rows } = await perfTimed("getCurrentUser users select", () =>
    client.query<{ platform_role: AuthenticatedUser["platformRole"]; account_type: AuthenticatedUser["accountType"]; username: string; display_name: string; email: string | null }>(
      "select platform_role, account_type, username, display_name, public.visible_email(id) as email from public.users where id = $1",
      [userId],
    ),
  );
  const profile = rows[0];
  // create_user() creates this row synchronously as part of signup, so a missing profile
  // here means something is wrong, not merely "new user" -- fall back to safe, honest
  // placeholders rather than fabricating a profile.
  return {
    id: userId,
    platformRole: profile?.platform_role ?? null,
    accountType: profile?.account_type ?? "researcher",
    username: profile?.username ?? "unknown",
    displayName: profile?.display_name ?? "Unknown user",
    email: profile?.email ?? null,
  };
}

/**
 * Re-validates the session against the sessions table, not just a client-supplied claim --
 * a forged or stale value must never be usable as an authorization input.
 *
 * Wrapped in React.cache: a single request (one page render, or one Server Action
 * invocation) commonly calls this from multiple places -- the page itself, AppShell, and
 * any service the page calls -- and without caching each call paid its own session
 * lookup plus a users select. React.cache dedupes by call with no arguments across that
 * one request/render pass only; it never leaks across requests or users, so a fresh
 * request always re-validates for real.
 *
 * Also skips its own session lookup entirely when middleware (lib/session/middleware.ts)
 * already validated one for this exact request and stamped the result via
 * VERIFIED_USER_ID_HEADER -- every request in this app passes through that middleware
 * (its matcher excludes only static assets), so this is the common case, not a
 * best-effort shortcut. The header can only ever hold a value middleware itself set
 * after a real validation (middleware strips any client-supplied copy of this header
 * before doing its own check), so trusting it here re-uses a real verification instead
 * of skipping one. Falls back to a real session lookup (from the raw cookie) when the
 * header is absent (e.g. a unit test rendering a Server Component directly, with no
 * middleware in front of it), so this never becomes the only path that can authenticate
 * a request.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  perfMark("getCurrentUser CALLED (uncached invocation)");

  // next/headers' headers()/cookies() throw outright (not merely an empty result) when
  // called with no real Next.js request scope around it -- true for a unit test that
  // imports and calls a Server Action directly, with no middleware or request context in
  // front of it at all. That's exactly the "no middleware ran" fallback case this
  // function already needs to handle, so a thrown call here is treated identically to a
  // genuinely absent header, not as a real error.
  let verifiedUserId: string | null = null;
  try {
    verifiedUserId = (await headers()).get(VERIFIED_USER_ID_HEADER);
  } catch {
    verifiedUserId = null;
  }

  if (verifiedUserId) {
    return withActorTransaction(verifiedUserId, (client) => loadProfile(client, verifiedUserId!));
  }

  let cookieValue: string | undefined;
  try {
    cookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  } catch {
    return null;
  }

  // public.sessions has RLS enabled with zero policies (no actor identity exists yet at
  // the point we're validating one), so only a BYPASSRLS role can read a row from it --
  // see lib/session/middleware.ts's own note on the same lookup.
  const session = await perfTimed("getCurrentUser validateSessionCookie", () => withServiceRoleTransaction((client) => validateSessionCookie(client, cookieValue)));
  if (!session) return null;

  return withActorTransaction(session.userId, (client) => loadProfile(client, session.userId));
});

/** The current request's verified session id, for call sites (MFA verify, session
 * management) that need it explicitly rather than just the user id -- same
 * header-first-then-cookie-fallback shape as getCurrentUser, kept separate since most
 * callers only ever need the user id. */
export const getCurrentSessionId = cache(async (): Promise<string | null> => {
  try {
    const verifiedSessionId = (await headers()).get(VERIFIED_SESSION_ID_HEADER);
    if (verifiedSessionId) return verifiedSessionId;
  } catch {
    // fall through to the cookie-based fallback below
  }

  let cookieValue: string | undefined;
  try {
    cookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  } catch {
    return null;
  }

  const session = await withServiceRoleTransaction((client) => validateSessionCookie(client, cookieValue));
  return session?.id ?? null;
});
