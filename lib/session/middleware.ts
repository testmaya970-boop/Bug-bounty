import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { withClient } from "@/lib/db/pool";
import { validateSessionGate, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { perfTimedWithId } from "@/lib/perf-trace";

// A password-only session for an account with a verified email-OTP factor is deliberately
// insufficient (see docs/decisions/0052) -- every route except these must redirect to
// /mfa/verify until a real OTP check or an equally real backup-code redemption completes.
// This is the one unbypassable enforcement point: a Server Component's own page-level
// check can be skipped by navigating directly to a URL, middleware cannot.
const MFA_EXEMPT_PATHS = new Set(["/mfa/verify", "/sign-in", "/sign-out", "/forgot-password", "/reset-password"]);
function isMfaExempt(pathname: string): boolean {
  return MFA_EXEMPT_PATHS.has(pathname) || pathname.startsWith("/auth/");
}

// A deactivated account (docs/decisions/0055) must not reach any authenticated page.
// deactivate_my_account already deletes every public.sessions row for that user, so in
// the common case there is no valid session left at all by the time this check would
// matter -- this remains as a defense-in-depth check for the narrow window where a
// session was already loaded/cached, or a future code path deactivates without revoking.
const DEACTIVATED_EXEMPT_PATHS = new Set(["/account-deactivated", "/sign-in", "/sign-out"]);
function isDeactivatedExempt(pathname: string): boolean {
  return DEACTIVATED_EXEMPT_PATHS.has(pathname) || pathname.startsWith("/auth/");
}

/**
 * Real, remembered "last organization visited" -- not a guess. The org switcher's sidebar
 * groups (Overview/Security/Insights/Organization) previously only rendered on a page whose
 * URL is itself inside /organizations/[id]/..., so a non-org-scoped page (Help, Settings,
 * Notifications) showed an org selected in the switcher (a cosmetic organizations[0]
 * fallback -- see app-shell-client.tsx's own OrganizationSwitcher) but none of the actual
 * org nav below it, which read as "broken" even though it was a deliberate anti-guessing
 * safeguard (see that file's own comment on a prior bug: guessing org context from array
 * order made clicking a nav link silently open the wrong organization's data).
 *
 * This closes that gap the safe way: set a cookie recording the LAST organization the user
 * actually navigated into (from the URL itself, never from the switcher's cosmetic
 * fallback), and let AppShell fall back to that on a page with no organizationId of its
 * own. lib/app-shell/last-organization.ts revalidates the cookie's org id against this
 * user's real membership before ever using it -- a stale or tampered cookie value (e.g.
 * from an org this user has since left) is never trusted blindly.
 */
export const LAST_ORGANIZATION_COOKIE = "last_organization_id";
const ORGANIZATION_PATH_PATTERN = /^\/organizations\/([0-9a-f-]{36})(?:\/|$)/i;

export function extractOrganizationIdFromPath(pathname: string): string | null {
  return pathname.match(ORGANIZATION_PATH_PATTERN)?.[1] ?? null;
}

/**
 * Set once middleware has already validated the session cookie below, so
 * lib/auth/current-user.ts's getCurrentUser() can trust "this request's user id is X"
 * without paying a second session-table round trip for the exact same request. Verified
 * server-side only (this header is stripped from any inbound request before middleware
 * ever runs its own check -- see the strip step below), so a client can never forge it;
 * it is purely a same-request cache of a check middleware itself just performed for real.
 */
export const VERIFIED_USER_ID_HEADER = "x-sentinel-verified-user-id";
export const VERIFIED_SESSION_ID_HEADER = "x-sentinel-verified-session-id";

/** Turn 8c forensics: minted once per request, forwarded on the request headers (so every
 * downstream perfTimed() call -- Server Components, Server Actions, route handlers -- can
 * read it back via next/headers() and log under the same id) and set on the response
 * headers too, so a client-side correlation pass can read it off the navigation's own
 * response and join client-side timing to this request's exact server-side breakdown. */
const REQUEST_ID_HEADER = "x-request-id";

export async function updateSession(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? randomUUID();
  request.headers.set(REQUEST_ID_HEADER, requestId);
  const response = await perfTimedWithId(requestId, `middleware ${request.method} ${request.nextUrl.pathname}`, () => updateSessionInner(request, requestId));
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

async function updateSessionInner(request: NextRequest, requestId: string) {
  // A client-supplied value here would let a request claim to be pre-verified without
  // ever going through a real session lookup -- always strip both first, so the only way
  // either header can be set is the real assignment below, after real validation.
  request.headers.delete(VERIFIED_USER_ID_HEADER);
  request.headers.delete(VERIFIED_SESSION_ID_HEADER);

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  // One statement returns the session and both gate facts (public.get_session_gate,
  // 202610050004) -- this used to be two transactions and ~12 sequential round trips on
  // every request. public.sessions has RLS with zero policies, so a plain runtime-role
  // SELECT sees nothing (confirmed live earlier); the SECURITY DEFINER function is what
  // reads it, reached through the runtime role's inherited service_role grant.
  //
  // No fail-open: a database error here now fails the request rather than skipping the
  // deactivation/MFA gate (audit AUTH-5). The old separate gate query swallowed errors and
  // let the request through.
  const session = await perfTimedWithId(requestId, "middleware session gate", () => withClient((client) => validateSessionGate(client, cookieValue)));

  let response = NextResponse.next({ request });

  if (session) {
    request.headers.set(VERIFIED_USER_ID_HEADER, session.userId);
    request.headers.set(VERIFIED_SESSION_ID_HEADER, session.id);
    response = NextResponse.next({ request });
  }

  // Real navigation into an org-scoped page, not the switcher's cosmetic guess -- see the
  // constant's own comment above. Only writes when the URL actually names an org and that
  // differs from what's already stored, so this never adds a Set-Cookie header (and its
  // response-size/perf cost) to the vast majority of requests that aren't switching org.
  const organizationIdInPath = extractOrganizationIdFromPath(request.nextUrl.pathname);
  if (organizationIdInPath && request.cookies.get(LAST_ORGANIZATION_COOKIE)?.value !== organizationIdInPath) {
    response.cookies.set(LAST_ORGANIZATION_COOKIE, organizationIdInPath, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }

  // Deliberately unconditional -- no header-based exception of any kind. A
  // prior version of this file skipped these queries when Sec-Fetch-Mode read "cors", to
  // avoid paying them on Next.js's speculative <Link> prefetches. That header is a
  // browser-Fetch-API-only guarantee: curl, scripts, and any raw HTTP client holding a
  // stolen session cookie can set it freely, and the MFA/deactivation gates exist
  // precisely for the stolen-session and terminated-employee scenarios that kind of
  // client represents. Reverted -- see the request-amplification fix at the nav-link
  // layer instead (prefetch={false} on gated links), which removes the extra requests at
  // the source instead of teaching this gate to trust a client-controlled signal.
  if (session && session.deactivated && !isDeactivatedExempt(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/account-deactivated", request.url));
  }

  if (session && session.mfaEnrolled && !session.mfaSessionVerified && !isMfaExempt(request.nextUrl.pathname)) {
    const redirectUrl = new URL("/mfa/verify", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
