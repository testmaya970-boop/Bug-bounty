import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveBearerUserId } from "@/lib/api-auth";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { OrganizationServiceError, getReport, listReportMessages, listReportMessagesForActor } from "@/services/reports";

/**
 * GET /api/v1/reports/:id/messages -- researcher-facing only, same shape and same
 * cookie/bearer split reasoning as the sibling evidence route
 * (app/api/v1/reports/[reportId]/evidence/route.ts's own comment applies identically here).
 */

const paramsSchema = z.object({ reportId: z.string().uuid() });

type ErrorEnvelope = { error: { code: string; message: string; requestId: string } };

function errorResponse(code: string, message: string, requestId: string): NextResponse<ErrorEnvelope> {
  const status = httpStatusForErrorCode(code);
  const response = NextResponse.json({ error: { code, message, requestId } }, { status });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const hasBearerHeader = request.headers.get("authorization") !== null;
  const bearerUserId = hasBearerHeader ? await resolveBearerUserId(request) : null;
  const cookieUser = hasBearerHeader ? null : await getCurrentUser();
  const actorId = bearerUserId ?? cookieUser?.id ?? null;

  return withRequestLogging("api.v1.reports.messages.list", { actorId }, async (requestId) => {
    if (hasBearerHeader && !bearerUserId) return errorResponse("AUTH_REQUIRED", "Invalid or revoked access token.", requestId);
    if (!hasBearerHeader && !cookieUser) return errorResponse("AUTH_REQUIRED", "Authentication required.", requestId);

    const { reportId: rawReportId } = await params;
    const parsedParams = paramsSchema.safeParse({ reportId: rawReportId });
    if (!parsedParams.success) return errorResponse("INVALID_INPUT", "Invalid report id.", requestId);
    const { reportId } = parsedParams.data;

    try {
      if (bearerUserId) {
        const messages = await listReportMessagesForActor(bearerUserId, reportId);
        const response = NextResponse.json({ data: messages, meta: { requestId } });
        response.headers.set("X-Request-Id", requestId);
        return response;
      }

      const report = await getReport(reportId);
      if (!report || report.researcherId !== cookieUser!.id) return errorResponse("REPORT_NOT_FOUND", "Report not found.", requestId);
      const messages = await listReportMessages(reportId);
      const response = NextResponse.json({ data: messages, meta: { requestId } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
