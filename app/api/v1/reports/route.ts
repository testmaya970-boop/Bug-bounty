import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveBearerUserId } from "@/lib/api-auth";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { OrganizationServiceError, listMyReports, listReportsForActor } from "@/services/reports";

/**
 * The first of two representative `/api/v1/*` endpoints this codebase ships -- proving
 * the architecture (versioned path, dual authentication, request validation, a stable
 * response envelope, correct HTTP status codes via the shared error map, a request id on
 * every response), not a public API surface. GET /api/v1/reports/:id (see the sibling
 * route under reports/[reportId]) is the second. Roughly eighteen more endpoints are
 * still explicitly NOT built -- see docs/decisions/0018-production-hardening-and-
 * integration-boundary.md and 0075's own inventory of what a fuller researcher API
 * surface on HackerOne/Bugcrowd actually looks like.
 *
 * Authentication accepts EITHER a cookie session (identical to every Server
 * Component/Action, for the app's own client-side calls) OR a real
 * `Authorization: Bearer sentinel_pat_...` personal access token (0055, wired end to end
 * as of 0059) -- an `Authorization` header takes precedence when both are somehow present,
 * since a request presenting a bearer token is unambiguously an external API caller, not
 * the app's own browser session. A bearer-authenticated actor is served through
 * listReportsForActor (the service-role path, 202609030003) rather than listMyReports
 * (cookie/auth.uid()-scoped) -- the two are never mixed for one request.
 */

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

type ErrorEnvelope = { error: { code: string; message: string; requestId: string } };

function errorResponse(code: string, message: string, requestId: string): NextResponse<ErrorEnvelope> {
  const status = httpStatusForErrorCode(code);
  const response = NextResponse.json({ error: { code, message, requestId } }, { status });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(request: NextRequest) {
  // An Authorization header always means "treat this as an external API caller" -- even
  // an invalid/expired token must not silently fall back to a coincidental cookie session
  // from the same browser; that would make a leaked or revoked token appear to still work
  // whenever the caller also happened to be signed in, which is exactly the kind of
  // silent, surprising success this project's own conventions never allow.
  const hasBearerHeader = request.headers.get("authorization") !== null;
  const bearerUserId = hasBearerHeader ? await resolveBearerUserId(request) : null;
  const cookieUser = hasBearerHeader ? null : await getCurrentUser();
  const actorId = bearerUserId ?? cookieUser?.id ?? null;

  return withRequestLogging("api.v1.reports.list", { actorId }, async (requestId) => {
    if (hasBearerHeader && !bearerUserId) return errorResponse("AUTH_REQUIRED", "Invalid or revoked access token.", requestId);
    if (!hasBearerHeader && !cookieUser) return errorResponse("AUTH_REQUIRED", "Authentication required.", requestId);

    const parsedQuery = querySchema.safeParse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsedQuery.success) return errorResponse("INVALID_INPUT", "Invalid query parameters.", requestId);

    try {
      const { items, nextCursor } = bearerUserId
        ? await listReportsForActor(bearerUserId, parsedQuery.data.cursor, parsedQuery.data.limit)
        : await listMyReports(cookieUser!.id, parsedQuery.data.cursor, parsedQuery.data.limit);
      const response = NextResponse.json({ data: items, meta: { requestId, nextCursor } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      // Never let a raw, unclassified error's message reach the response body.
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
