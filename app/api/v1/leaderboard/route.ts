import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { OrganizationServiceError, getPublicLeaderboard } from "@/services/reputation";

/** GET /api/v1/leaderboard -- public, readable signed out, matching
 * getPublicLeaderboard's own "readable signed out" design. No auth branching needed. */

const querySchema = z.object({ limit: z.coerce.number().int().positive().max(200).optional() });

type ErrorEnvelope = { error: { code: string; message: string; requestId: string } };

function errorResponse(code: string, message: string, requestId: string): NextResponse<ErrorEnvelope> {
  const status = httpStatusForErrorCode(code);
  const response = NextResponse.json({ error: { code, message, requestId } }, { status });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(request: NextRequest) {
  return withRequestLogging("api.v1.leaderboard.list", {}, async (requestId) => {
    const parsedQuery = querySchema.safeParse({ limit: request.nextUrl.searchParams.get("limit") ?? undefined });
    if (!parsedQuery.success) return errorResponse("INVALID_INPUT", "Invalid query parameters.", requestId);

    try {
      const rows = await getPublicLeaderboard(parsedQuery.data.limit);
      const response = NextResponse.json({ data: rows, meta: { requestId } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
