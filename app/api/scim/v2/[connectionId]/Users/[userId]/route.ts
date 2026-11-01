import { NextResponse, type NextRequest } from "next/server";
import { scimConnection, scimGetUser, scimRename, scimSetActive } from "@/services/sso";
import { parsePatch, scimError, scimUser } from "@/lib/scim";

// SCIM 2.0 single user. Deactivation (active=false or DELETE) suspends the membership and ends
// every session; owners can't be deprovisioned through SCIM.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "content-type": "application/scim+json" } });
type Ctx = { params: Promise<{ connectionId: string; userId: string }> };

async function load(request: NextRequest, ctx: Ctx) {
  const { connectionId, userId } = await ctx.params;
  if (!UUID.test(connectionId) || !UUID.test(userId)) return { error: json(scimError(404, "Not found."), 404) };
  const conn = await scimConnection(connectionId, request.headers.get("authorization"));
  if (!conn) return { error: json(scimError(401, "Invalid bearer token."), 401) };
  const user = await scimGetUser(conn.organizationId, userId);
  if (!user) return { error: json(scimError(404, "User not found."), 404) };
  return { conn, user, base: `${(process.env.APP_ORIGIN ?? new URL(request.url).origin).replace(/\/$/, "")}/api/scim/v2/${connectionId}` };
}

async function setActive(connId: string, userId: string, active: boolean) {
  try {
    await scimSetActive(connId, userId, active);
    return null;
  } catch (error) {
    const owner = error instanceof Error && error.message.startsWith("SCIM_OWNER");
    return json(scimError(owner ? 403 : 400, owner ? "Owners are managed in Unpatched, not by provisioning." : "Could not update that user."), owner ? 403 : 400);
  }
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx);
  if ("error" in r) return r.error;
  return json(scimUser(r.user, r.base));
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx);
  if ("error" in r) return r.error;
  const ops = parsePatch((await request.json().catch(() => ({}))) as never);
  if (!ops) return json(scimError(400, "Send a PatchOp request.", "invalidSyntax"), 400);
  if (ops.displayName) await scimRename(r.conn.organizationId, r.user.id, ops.displayName);
  if (ops.active !== undefined && ops.active !== r.user.active) {
    const failed = await setActive(r.conn.id, r.user.id, ops.active);
    if (failed) return failed;
  }
  return json(scimUser((await scimGetUser(r.conn.organizationId, r.user.id))!, r.base));
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx);
  if ("error" in r) return r.error;
  const body = (await request.json().catch(() => ({}))) as { active?: boolean; displayName?: string };
  if (typeof body.displayName === "string") await scimRename(r.conn.organizationId, r.user.id, body.displayName);
  if (typeof body.active === "boolean" && body.active !== r.user.active) {
    const failed = await setActive(r.conn.id, r.user.id, body.active);
    if (failed) return failed;
  }
  return json(scimUser((await scimGetUser(r.conn.organizationId, r.user.id))!, r.base));
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx);
  if ("error" in r) return r.error;
  const failed = await setActive(r.conn.id, r.user.id, false);
  return failed ?? new NextResponse(null, { status: 204 });
}
