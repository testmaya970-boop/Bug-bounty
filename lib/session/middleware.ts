import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { withClient, withServiceRoleTransaction, setActorClaims } from "@/lib/db/pool";
import { validateSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { perfTimed } from "@/lib/perf-trace";

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
 * Set once middleware has already validated the session cookie below, so
 * lib/auth/current-user.ts's getCurrentUser() can trust "this request's user id is X"
 * without paying a second session-table round trip for the exact same request. Verified
 * server-side only (this header is stripped from any inbound request before middleware
 * ever runs its own check -- see the strip step below), so a client can never forge it;
 * it is purely a same-request cache of a check middleware itself just performed for real.
 */
export const VERIFIED_USER_ID_HEADER = "x-sentinel-verified-user-id";
export const VERIFIED_SESSION_ID_HEADER = "x-sentinel-verified-session-id";

export async function updateSession(request: NextRequest) {
  return perfTimed(`middleware ${request.method} ${request.nextUrl.pathname}`, () => updateSessionInner(request));
}

async function updateSessionInner(request: NextRequest) {
  // A client-supplied value here would let a request claim to be pre-verified without
  // ever going through a real session lookup -- always strip both first, so the only way
  // either header can be set is the real assignment below, after real validation.
  request.headers.delete(VERIFIED_USER_ID_HEADER);
  request.headers.delete(VERIFIED_SESSION_ID_HEADER);

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  // public.sessions has RLS enabled with zero policies (deliberately -- no actor identity
  // exists yet at the point we're validating one), so only a BYPASSRLS role can ever read
  // a row from it. withClient's bare runtime-role connection has no BYPASSRLS and always
  // returned zero rows here regardless of the cookie's validity (confirmed live: a
  // provably correct, freshly committed session row was invisible to this exact query).
  // service_role is the correct role for this lookup -- identical to why
  // signInWithPassword itself reads public.users pre-auth via withServiceRoleTransaction.
  const session = await perfTimed("middleware validateSessionCookie", () =>
    withServiceRoleTransaction((client) => validateSessionCookie(client, cookieValue)),
  );

  let response = NextResponse.next({ request });

  if (session) {
    request.headers.set(VERIFIED_USER_ID_HEADER, session.userId);
    request.headers.set(VERIFIED_SESSION_ID_HEADER, session.id);
    response = NextResponse.next({ request });
  }

  // These two gates are independent reads of the same user's state -- run them in
  // parallel rather than serially. Every navigation (including every tab click) pays
  // this cost, so a needless second round-trip here is a real, felt latency tax, not a
  // micro-optimization. Each check is still only issued when its own path isn't exempt.
  //
  // Deliberately unconditional otherwise -- no header-based exception of any kind. A
  // prior version of this file skipped these queries when Sec-Fetch-Mode read "cors", to
  // avoid paying them on Next.js's speculative <Link> prefetches. That header is a
  // browser-Fetch-API-only guarantee: curl, scripts, and any raw HTTP client holding a
  // stolen session cookie can set it freely, and the MFA/deactivation gates exist
  // precisely for the stolen-session and terminated-employee scenarios that kind of
  // client represents. Reverted -- see the request-amplification fix at the nav-link
  // layer instead (prefetch={false} on gated links), which removes the extra requests at
  // the source instead of teaching this gate to trust a client-controlled signal.
  const checkDeactivated = session && !isDeactivatedExempt(request.nextUrl.pathname);
  const checkMfa = session && !isMfaExempt(request.nextUrl.pathname);

  if (checkDeactivated || checkMfa) {
    try {
      const { deactivated, mfaStatus } = await perfTimed("middleware gate queries", () =>
        withClient(async (client) => {
          await client.query("begin");
          try {
            await setActorClaims(client, { sub: session!.userId, sessionId: session!.id, aal: session!.aal });
            const [deactivatedResult, mfaResult] = await Promise.all([
              checkDeactivated ? client.query<{ am_i_deactivated: boolean }>("select public.am_i_deactivated()") : Promise.resolve(null),
              checkMfa
                ? client.query<{ totp_enrolled: boolean; session_verified: boolean }>("select * from public.get_my_mfa_status($1)", [session!.id])
                : Promise.resolve(null),
            ]);
            await client.query("commit");
            return { deactivated: deactivatedResult?.rows[0]?.am_i_deactivated ?? false, mfaStatus: mfaResult?.rows[0] ?? null };
          } catch (error) {
            await client.query("rollback").catch(() => {});
            throw error;
          }
        }),
      );

      if (checkDeactivated && deactivated) {
        return NextResponse.redirect(new URL("/account-deactivated", request.url));
      }

      if (checkMfa && mfaStatus?.totp_enrolled && !mfaStatus.session_verified) {
        const redirectUrl = new URL("/mfa/verify", request.url);
        redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
        return NextResponse.redirect(redirectUrl);
      }
    } catch {
      // Fail open on a gate-query error (not on an actual "deactivated"/"MFA required"
      // result, only on an infrastructure failure) -- identical posture to the original
      // Supabase-backed middleware, which only ever redirected on a real, successful RPC
      // result and otherwise let the request through rather than lock every user out on
      // a transient DB error.
    }
  }

  return response;
}
