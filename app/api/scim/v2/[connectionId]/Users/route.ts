import { NextResponse, type NextRequest } from "next/server";
import { scimConnection, scimCreateUser, scimGetUser, scimListUsers } from "@/services/sso";
import { parseCreate, parseUserNameFilter, scimError, scimList, scimUser } from "@/lib/scim";

// SCIM 2.0 Users collection for one organization's connection. Bearer token (hashed at rest).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "content-type": "application/scim+json" } });

async function auth(request: NextRequest, connectionId: string) {
  return UUID.test(connectionId) ? scimConnection(connectionId, request.headers.get("authorization")) : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const conn = await auth(request, connectionId);
  if (!conn) return json(scimError(401, "Invalid bearer token."), 401);
  const url = new URL(request.url);
  const filter = parseUserNameFilter(url.searchParams.get("filter"));
  if (filter === "unsupported") return json(scimError(400, "Only userName eq filters are supported.", "invalidFilter"), 400);
  const startIndex = Math.max(Number(url.searchParams.get("startIndex") ?? 1) || 1, 1);
  const count = Math.min(Math.max(Number(url.searchParams.get("count") ?? 100) || 100, 0), 200);
  const { total, users } = await scimListUsers(conn.organizationId, filter, startIndex, count);
  return json(scimList(users, total, startIndex, `${(process.env.APP_ORIGIN ?? url.origin).replace(/\/$/, "")}/api/scim/v2/${connectionId}`));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const conn = await auth(request, connectionId);
  if (!conn) return json(scimError(401, "Invalid bearer token."), 401);
  const body = await request.json().catch(() => null);
  const parsed = body ? parseCreate(body) : null;
  if (!parsed) return json(scimError(400, "userName or emails must hold a valid email.", "invalidValue"), 400);
  const existing = (await scimListUsers(conn.organizationId, parsed.email, 1, 1)).users[0];
  if (existing) return json(scimError(409, "That user is already provisioned.", "uniqueness"), 409);
  try {
    const id = await scimCreateUser(conn.id, parsed.email, parsed.displayName, parsed.active);
    const user = await scimGetUser(conn.organizationId, id);
    return json(scimUser(user!, `${(process.env.APP_ORIGIN ?? new URL(request.url).origin).replace(/\/$/, "")}/api/scim/v2/${connectionId}`), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^[A-Z_]+: /, "") : "Could not provision that user.";
    return json(scimError(400, message), 400);
  }
}
