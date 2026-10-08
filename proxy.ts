import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/session/middleware";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";
import { hasMalformedIdSegment } from "@/lib/uuid-segment";

// Next.js 16 renamed middleware.ts -> proxy.ts. Proxy always runs on the Node.js runtime
// (not configurable), which this needs: lib/session/middleware.ts validates the session
// cookie over a real `pg` (node-postgres) TCP connection, which cannot run on Edge.
export async function proxy(request: NextRequest) {
  // Set on the REQUEST so Next.js can read the nonce while rendering (updateSession's
  // NextResponse.next({ request }) forwards these headers), and on the response so the
  // browser enforces it. See lib/security/csp.ts.
  const csp = buildContentSecurityPolicy(generateNonce(), process.env.NODE_ENV === "development");
  request.headers.set("content-security-policy", csp);

  // A non-uuid id in an org-scoped URL is a 404 before anything renders or queries -- see
  // lib/uuid-segment.ts for why this can't live in a layout. Path-based, not header-based.
  if (hasMalformedIdSegment(request.nextUrl.pathname)) {
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
  // `ctf-artifacts` is excluded for the same reason `_next/static` and the image extensions
  // are: these are non-secret static files served from public/ (CTF challenge downloads --
  // pcaps, images, disk/memory dumps). They are MEANT to be downloaded and analyzed; the
  // flag is verified server-side by submit_ctf_flag against a hash, so holding an artifact
  // reveals nothing without doing the work. This is a static-PATH exclusion, not a
  // header-based exception -- it never branches on a client-controlled signal (Sec-Fetch-Mode
  // etc.) to skip the gate for "probably safe" traffic, which AGENTS.md forbids; it simply
  // declines to run session validation on public asset paths, exactly as the existing
  // exclusions already do.
  //
  // `api/webhooks/jira/` is excluded because Jira's server-to-server deliveries carry no
  // Unpatched session for this proxy to validate -- running it would only cost a session
  // lookup per delivery and attach a CSP to a JSON endpoint. The route is NOT ungated: it
  // authenticates every request itself by recomputing an HMAC over the body with the
  // organization's server-held secret (see that route's header). Again a fixed-PATH
  // exclusion; no request header decides whether any gate runs.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health$|api/webhooks/jira/|ctf-artifacts|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
