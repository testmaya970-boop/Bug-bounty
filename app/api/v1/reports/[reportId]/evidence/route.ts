import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveBearerUserId } from "@/lib/api-auth";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { OrganizationServiceError, getReport, listReportEvidence, listReportEvidenceForActor } from "@/services/reports";

/**
 * GET /api/v1/reports/:id/evidence -- researcher-facing only, matching the scope of
 * every other `/api/v1/*` route (this is the caller's own report, never an org-facing
 * evidence view). The cookie path relies on report_evidence's own RLS (already scoped to
 * `visibility = 'researcher_visible' and researcher_id = auth.uid()` for a plain
 * researcher session, per docs/decisions/0010) plus an explicit ownership check on the
 * report itself; the bearer path uses list_report_evidence_for_actor
 * (202609050008), which hardcodes the identical visibility/ownership rule under
 * service-role, since service-role bypasses RLS entirely.
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

  return withRequestLogging("api.v1.reports.evidence.list", { actorId }, async (requestId) => {
    if (hasBearerHeader && !bearerUserId) return errorResponse("AUTH_REQUIRED", "Invalid or revoked access token.", requestId);
    if (!hasBearerHeader && !cookieUser) return errorResponse("AUTH_REQUIRED", "Authentication required.", requestId);

    const { reportId: rawReportId } = await params;
    const parsedParams = paramsSchema.safeParse({ reportId: rawReportId });
    if (!parsedParams.success) return errorResponse("INVALID_INPUT", "Invalid report id.", requestId);
    const { reportId } = parsedParams.data;

    try {
      if (bearerUserId) {
        const evidence = await listReportEvidenceForActor(bearerUserId, reportId);
        const response = NextResponse.json({ data: evidence, meta: { requestId } });
        response.headers.set("X-Request-Id", requestId);
        return response;
      }

      const report = await getReport(reportId);
      if (!report || report.researcherId !== cookieUser!.id) return errorResponse("REPORT_NOT_FOUND", "Report not found.", requestId);
      const evidence = await listReportEvidence(reportId);
      const response = NextResponse.json({ data: evidence, meta: { requestId } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
