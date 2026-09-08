import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestLogging } from "@/lib/request-context";
import { httpStatusForErrorCode } from "@/lib/http-errors";
import { getPublicProgram } from "@/services/programs";
import { OrganizationServiceError } from "@/services/rpc-error";

/** GET /api/v1/programs/:id -- public, same reasoning as the sibling list route. */

const paramsSchema = z.object({ programId: z.string().uuid() });

type ErrorEnvelope = { error: { code: string; message: string; requestId: string } };

function errorResponse(code: string, message: string, requestId: string): NextResponse<ErrorEnvelope> {
  const status = httpStatusForErrorCode(code);
  const response = NextResponse.json({ error: { code, message, requestId } }, { status });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  return withRequestLogging("api.v1.programs.get", {}, async (requestId) => {
    const { programId: rawProgramId } = await params;
    const parsedParams = paramsSchema.safeParse({ programId: rawProgramId });
    if (!parsedParams.success) return errorResponse("INVALID_INPUT", "Invalid program id.", requestId);

    try {
      const program = await getPublicProgram(parsedParams.data.programId);
      if (!program) return errorResponse("PROGRAM_NOT_FOUND", "Program not found.", requestId);
      const response = NextResponse.json({ data: program, meta: { requestId } });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof OrganizationServiceError) return errorResponse(error.code, error.message, requestId);
      return errorResponse("UNKNOWN", "The request could not be completed. Try again in a moment.", requestId);
    }
  });
}
