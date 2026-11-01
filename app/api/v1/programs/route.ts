import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { listPublicPrograms } from "@/services/programs";
import { OrganizationServiceError } from "@/services/rpc-error";
import { FOCUS_AREA_ORDER } from "@/lib/researcher-identity-labels";
import type { ResearcherFocusArea } from "@/types/researcher-identity";

/**
 * GET /api/v1/programs -- deliberately public, no auth required at all: list_public_programs
 * is already anon-callable (docs/decisions/0041/0042), the identical query the public
 * program-discovery page itself uses. No bearer/cookie branching needed here, unlike every
 * other `/api/v1/*` route -- there is no "for actor" distinction to make when the
 * underlying data was never actor-scoped in the first place.
 */

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  status: z.enum(["active", "paused"]).optional(),
  focusArea: z.enum(FOCUS_AREA_ORDER as [ResearcherFocusArea, ...ResearcherFocusArea[]]).optional(),
});

type ErrorEnvelope = { error: { code: string; message: string; requestId: string } };

function errorResponse(code: string, message: string, requestId: string): NextResponse<ErrorEnvelope> {
  const status = httpStatusForErrorCode(code);
  const response = NextResponse.json({ error: { code, message, requestId } }, { status });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(request: NextRequest) {
  return withRequestLogging("api.v1.programs.list", {}, async (requestId) => {
    const parsedQuery = querySchema.safeParse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      focusArea: request.nextUrl.searchParams.get("focusArea") ?? undefined,
    });
    if (!parsedQuery.success) return errorResponse("INVALID_INPUT", "Invalid query parameters.", requestId);

    try {
      const { items, nextCursor } = await listPublicPrograms(
        { search: parsedQuery.data.search, status: parsedQuery.data.status, focusArea: parsedQuery.data.focusArea },
        parsedQuery.data.cursor,
        parsedQuery.data.limit,
      );
      const response = NextResponse.json({ data: items, meta: { requestId, nextCursor } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
