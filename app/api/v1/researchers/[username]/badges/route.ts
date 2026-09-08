import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { OrganizationServiceError, getPublicResearcherProfile, getResearcherBadges } from "@/services/reputation";

/** GET /api/v1/researchers/:username/badges -- public, matching the public researcher
 * profile page's own reach: badges are part of that same public-callable profile. The
 * username -> researcherId resolution mirrors what the profile page itself must already
 * do (get_researcher_badges takes a researcherId, not a username). "No such username" and
 * "exists but no public profile set" stay indistinguishable, same as
 * getPublicResearcherProfile's own documented convention. */

const paramsSchema = z.object({ username: z.string().min(1) });

type ErrorEnvelope = { error: { code: string; message: string; requestId: string } };

function errorResponse(code: string, message: string, requestId: string): NextResponse<ErrorEnvelope> {
  const status = httpStatusForErrorCode(code);
  const response = NextResponse.json({ error: { code, message, requestId } }, { status });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  return withRequestLogging("api.v1.researchers.badges.list", {}, async (requestId) => {
    const { username: rawUsername } = await params;
    const parsedParams = paramsSchema.safeParse({ username: rawUsername });
    if (!parsedParams.success) return errorResponse("INVALID_INPUT", "Invalid username.", requestId);

    try {
      const profile = await getPublicResearcherProfile(parsedParams.data.username);
      if (!profile) return errorResponse("RESEARCHER_NOT_FOUND", "Researcher not found.", requestId);
      const badges = await getResearcherBadges(profile.researcherId);
      const response = NextResponse.json({ data: badges, meta: { requestId } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
