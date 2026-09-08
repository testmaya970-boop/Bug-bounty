import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveBearerUserId } from "@/lib/api-auth";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { OrganizationServiceError, getMyReportStatusCounts, getReportStatusCountsForActor } from "@/services/reports";

/**
 * GET /api/v1/reports/status-counts -- one of the representative endpoints added past
 * the original two (see docs/decisions/0075's own inventory of the researcher API gap).
 * Same dual-auth/envelope/error-mapping shape as every other `/api/v1/*` route.
 */

type ErrorEnvelope = { error: { code: string; message: string; requestId: string } };

function errorResponse(code: string, message: string, requestId: string): NextResponse<ErrorEnvelope> {
  const status = httpStatusForErrorCode(code);
  const response = NextResponse.json({ error: { code, message, requestId } }, { status });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(request: NextRequest) {
  const hasBearerHeader = request.headers.get("authorization") !== null;
  const bearerUserId = hasBearerHeader ? await resolveBearerUserId(request) : null;
  const cookieUser = hasBearerHeader ? null : await getCurrentUser();
  const actorId = bearerUserId ?? cookieUser?.id ?? null;

  return withRequestLogging("api.v1.reports.statusCounts", { actorId }, async (requestId) => {
    if (hasBearerHeader && !bearerUserId) return errorResponse("AUTH_REQUIRED", "Invalid or revoked access token.", requestId);
    if (!hasBearerHeader && !cookieUser) return errorResponse("AUTH_REQUIRED", "Authentication required.", requestId);

    try {
      const counts = bearerUserId ? await getReportStatusCountsForActor(bearerUserId) : await getMyReportStatusCounts(cookieUser!.id);
      const response = NextResponse.json({ data: counts, meta: { requestId } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
