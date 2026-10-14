import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/session/middleware";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";
import { hasMalformedIdSegment } from "@/lib/uuid-segment";

// Next.js 16 renamed middleware.ts -> proxy.ts. Proxy always runs on the Node.js runtime
// (not configurable), which this needs: lib/session/middleware.ts validates the session
// cookie over a real `pg` (node-postgres) TCP connection, which cannot run on Edge.
function isDecodablePath(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  // Set on the REQUEST so Next.js can read the nonce while rendering (updateSession's
  // NextResponse.next({ request }) forwards these headers), and on the response so the
  // browser enforces it. See lib/security/csp.ts.
  const csp = buildContentSecurityPolicy(generateNonce(), process.env.NODE_ENV === "development");
  request.headers.set("content-security-policy", csp);

  // Server Actions accept a request only when its Origin matches X-Forwarded-Host (or Host).
  // A client-sent X-Forwarded-Host could match a forged Origin, so in production the app's
  // own configured host always wins -- it is the only host Unpatched is served from.
  if (process.env.NODE_ENV === "production" && process.env.APP_ORIGIN) {
    request.headers.set("x-forwarded-host", new URL(process.env.APP_ORIGIN).host);
  }

  // A non-uuid id in an org-scoped URL is a 404 before anything renders or queries -- see
  // lib/uuid-segment.ts for why this can't live in a layout. Path-based, not header-based.
  // A malformed percent-escape (/learn/%zz) can't be decoded into route params, and Next
  // answered every dynamic route with a bare 500; it is simply a page that doesn't exist.
  if (!isDecodablePath(request.nextUrl.pathname) || hasMalformedIdSegment(request.nextUrl.pathname)) {
    const notFound = NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404, request: { headers: request.headers } });
    notFound.headers.set("Content-Security-Policy", csp);
    return notFound;
  }

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// No header-based exclusions (e.g. skipping prefetches, as Next's CSP guide suggests):
// this proxy is also the session/MFA/deactivation gate, and AGENTS.md forbids letting a
// client-controlled header bypass a security gate.
export const config = {
  // api/health (exact path) is excluded so it can report a database outage -- see that route.
  //
  // `ctf-artifacts` is excluded for the same reason `_next/static` is: these are non-secret
  // static files served from public/ (CTF challenge downloads -- pcaps, images, disk/memory
  // dumps). They are MEANT to be downloaded and analyzed; the flag is verified server-side
  // by submit_ctf_flag against a hash, so holding an artifact reveals nothing without doing
  // the work. This is a static-PATH-PREFIX exclusion, not a header-based exception -- it
  // never branches on a client-controlled signal (Sec-Fetch-Mode etc.) to skip the gate for
  // "probably safe" traffic, which AGENTS.md forbids.
  //
  // A bare "URL ends in .png/.svg/..." clause used to sit here too, on the same "these are
  // just static assets" theory -- but that matches on URL SHAPE, not on whether a real
  // static file exists at that path or under a known static prefix. Next's own dynamic
  // routes (e.g. /ctf/[challengeId], /learn/[slug]) happily render for a segment value a
  // client chooses, including one a client crafts to end in ".png" -- and public/ holds no
  // image assets at all (only ctf-artifacts, already excluded by name above). That clause
  // therefore let an attacker reach any dynamic route with zero session validation: proxy
  // never ran, so lib/session/middleware.ts's own header-strip step (the one thing standing
  // between a client-supplied x-unpatched-verified-user-id header and getCurrentUser()
  // trusting it) never ran either -- a full, unauthenticated account-impersonation path.
  // Removed entirely rather than narrowed to a path prefix, since there is currently no
  // static image asset under public/ for it to protect.
  //
  // `api/webhooks/jira/` is excluded because Jira's server-to-server deliveries carry no
  // Unpatched session for this proxy to validate. The route is NOT ungated: it
  // authenticates every request itself by recomputing an HMAC over the body with the
  // organization's server-held secret (see that route's header). A fixed-PATH exclusion;
  // no request header decides whether any gate runs.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health$|api/webhooks/jira/|ctf-artifacts).*)"],
};
