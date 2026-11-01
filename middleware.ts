import { NextResponse, type NextRequest } from "next/server";

const VERIFIED_USER_ID_HEADER = "x-unpatched-verified-user-id";
const VERIFIED_SESSION_ID_HEADER = "x-unpatched-verified-session-id";
const PLATFORM_ADMIN_NEEDS_MFA_HEADER = "x-unpatched-platform-admin-needs-mfa";
const LAST_ORGANIZATION_COOKIE = "last_organization_id";
const ORGANIZATION_PATH_PATTERN = /^\/organizations\/([0-9a-f-]{36})(?:\/|$)/i;

export function middleware(request: NextRequest) {
  request.headers.delete(VERIFIED_USER_ID_HEADER);
  request.headers.delete(VERIFIED_SESSION_ID_HEADER);
  request.headers.delete(PLATFORM_ADMIN_NEEDS_MFA_HEADER);

  const response = NextResponse.next({ request });

  const organizationIdInPath = request.nextUrl.pathname.match(ORGANIZATION_PATH_PATTERN)?.[1] ?? null;
  if (organizationIdInPath && request.cookies.get(LAST_ORGANIZATION_COOKIE)?.value !== organizationIdInPath) {
    response.cookies.set(LAST_ORGANIZATION_COOKIE, organizationIdInPath, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health$|api/webhooks/jira/|ctf-artifacts).*)"],
};
