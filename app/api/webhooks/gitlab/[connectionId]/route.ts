import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readBodyWithin } from "@/lib/read-body";
import { verifyGitlabToken } from "@/lib/integrations/code-hosts";
import { applyIssueState, gitlabWebhookSecret } from "@/services/code-hosts";

// GitLab project webhook (Issues events). The gate is X-Gitlab-Token, compared in constant time
// with this connection's secret. An unknown connection costs the same comparison as a real one.
const MAX_BODY_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SECRET = randomUUID();

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const raw = await readBodyWithin(request, MAX_BODY_BYTES);
  if (raw === null) return new NextResponse(null, { status: 413 });
  const secret = UUID.test(connectionId) ? await gitlabWebhookSecret(connectionId) : null;
  if (!verifyGitlabToken(secret ?? NO_SECRET, request.headers.get("x-gitlab-token")) || !secret) return new NextResponse(null, { status: 401 });

  let body: { object_kind?: string; project?: { id?: number }; object_attributes?: { iid?: number; action?: string } };
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const action = body.object_attributes?.action;
  if (body.object_kind === "issue" && (action === "close" || action === "reopen") && body.project?.id && body.object_attributes?.iid) {
    await applyIssueState(connectionId, String(body.project.id), body.object_attributes.iid, action === "close");
  }
  return new NextResponse(null, { status: 204 });
}
