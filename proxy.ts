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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
