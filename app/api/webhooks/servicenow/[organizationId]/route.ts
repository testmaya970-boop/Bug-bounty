import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readBodyWithin } from "@/lib/read-body";
import { verifyServiceNowToken } from "@/lib/integrations/servicenow";
import { applyServiceNowState, servicenowCredentials } from "@/services/servicenow";

// The customer's ServiceNow Business Rule calls this when an Unpatched ticket is resolved or
// closed. The gate is X-Unpatched-Token, compared in constant time with the connection's secret.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SECRET = randomUUID();

export async function POST(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const raw = await readBodyWithin(request, 64 * 1024);
  if (raw === null) return new NextResponse(null, { status: 413 });
  const creds = UUID.test(organizationId) ? await servicenowCredentials(organizationId).catch(() => null) : null;
  if (!verifyServiceNowToken(creds?.webhook_secret ?? NO_SECRET, request.headers.get("x-unpatched-token")) || !creds) return new NextResponse(null, { status: 401 });
  let body: { sys_id?: string; state?: string };
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!body.sys_id || !/^[0-9a-f]{32}$/.test(body.sys_id)) return new NextResponse(null, { status: 204 });
  const state = String(body.state ?? "").toLowerCase();
  const closed = ["resolved", "closed", "6", "7"].includes(state);
  await applyServiceNowState(organizationId, body.sys_id, closed);
  return new NextResponse(null, { status: 204 });
}
