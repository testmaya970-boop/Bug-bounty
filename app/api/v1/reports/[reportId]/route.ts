import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveBearerUserId } from "@/lib/api-auth";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { OrganizationServiceError, getReport, getReportForActor } from "@/services/reports";

/**
 * The second real `/api/v1/*` endpoint -- GET /api/v1/reports/:id, the natural next one
 * after the list endpoint (see app/api/v1/reports/route.ts's own comment: "Nineteen more
 * endpoints are explicitly NOT built"). Same dual-authentication shape as the list
 * endpoint exactly (cookie session OR `Authorization: Bearer sentinel_pat_...`), same
 * stable envelope, same request-id/error-mapping discipline. Scoped identically to the
 * list endpoint too: this is the caller's OWN report only, researcher-side, never an
 * org-facing report lookup -- an org's own triage view already has its own, separately-
 * authorized route (the report detail page itself), not this API.
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

  return withRequestLogging("api.v1.reports.get", { actorId }, async (requestId) => {
    if (hasBearerHeader && !bearerUserId) return errorResponse("AUTH_REQUIRED", "Invalid or revoked access token.", requestId);
    if (!hasBearerHeader && !cookieUser) return errorResponse("AUTH_REQUIRED", "Authentication required.", requestId);

    const { reportId: rawReportId } = await params;
    const parsedParams = paramsSchema.safeParse({ reportId: rawReportId });
    if (!parsedParams.success) return errorResponse("INVALID_INPUT", "Invalid report id.", requestId);
    const { reportId } = parsedParams.data;

    try {
      if (bearerUserId) {
        const report = await getReportForActor(bearerUserId, reportId);
        if (!report) return errorResponse("REPORT_NOT_FOUND", "Report not found.", requestId);
        const response = NextResponse.json({ data: report, meta: { requestId } });
        response.headers.set("X-Request-Id", requestId);
        return response;
      }

      // Cookie path: getReport is RLS-scoped to every real viewer of the report
      // (researcher, org admins, program members) -- this endpoint is researcher-facing
      // only, matching the list endpoint's own scope, so a report that exists but isn't
      // this caller's own submission is treated identically to one that doesn't exist at
      // all, never distinguished (the same "not found vs. not yours" convention the
      // bearer path's own RPC WHERE clause already enforces).
      const report = await getReport(reportId);
      if (!report || report.researcherId !== cookieUser!.id) return errorResponse("REPORT_NOT_FOUND", "Report not found.", requestId);
      const response = NextResponse.json({ data: report, meta: { requestId } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
