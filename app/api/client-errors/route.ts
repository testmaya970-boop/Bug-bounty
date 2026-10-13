import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withServiceRoleTransaction } from "@/lib/db/pool";
import { recordError } from "@/lib/error-tracking";
import { readBodyWithin } from "@/lib/read-body";
import { VERIFIED_USER_ID_HEADER } from "@/lib/session/middleware";

// Receives browser errors from lib/report-client-error.ts. Unauthenticated on purpose (a
// signed-out page can crash too), so it is shaped to be hard to abuse: strict size limits,
// a per-client limit plus a global cap on how many rows can be written, and the user id
// taken only from the proxy's verified-session header (proxy.ts strips any client copy).

const bodySchema = z.object({
  message: z.string().min(1).max(1000),
  stack: z.string().max(8000).nullable().optional(),
  route: z.string().max(500).nullable().optional(),
  digest: z.string().max(100).nullable().optional(),
});

// The schema's own limits (1000 + 8000 + 500 + 100 chars) fit comfortably in 16 KiB.
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: NextRequest) {
  const raw = await readBodyWithin(request, MAX_BODY_BYTES);
  if (raw === null) return new NextResponse(null, { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  // The last x-forwarded-for hop is the one our own server/proxy added; the first is the
  // client's and could be rotated to dodge the per-client limit. The global cap holds regardless.
  const client = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || request.headers.get("x-real-ip") || "unknown";
  let allowed = false;
  try {
    // 30/min per client + 1000/hour globally -- see check_client_error_rate_limit (202609250009).
    allowed = await withServiceRoleTransaction((db) =>
      db.query<{ ok: boolean }>("select public.check_client_error_rate_limit($1) as ok", [client]).then((r) => r.rows[0]?.ok === true),
    );
  } catch (error) {
    // Record our own failure: a silent 503 here once dropped every browser report unseen.
    void recordError({ source: "server", message: `client-errors rate limit check failed: ${error instanceof Error ? error.message : String(error)}`, route: "POST /api/client-errors" });
    return new NextResponse(null, { status: 503 });
  }
  if (!allowed) return new NextResponse(null, { status: 429 });

  await recordError({
    source: "client",
    message: parsed.data.message,
    stack: parsed.data.stack,
    // Path only: query strings can carry tokens (invitation links, password resets).
    route: parsed.data.route?.split("?")[0] ?? null,
    digest: parsed.data.digest,
    userId: request.headers.get(VERIFIED_USER_ID_HEADER),
  });
  return new NextResponse(null, { status: 204 });
}
