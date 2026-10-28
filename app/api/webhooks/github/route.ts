import { NextResponse, type NextRequest } from "next/server";
import { readBodyWithin } from "@/lib/read-body";
import { githubAppConfig, verifyGithubSignature } from "@/lib/integrations/code-hosts";
import { applyIssueState, githubConnectionForInstallation, unlinkPublicRepository } from "@/services/code-hosts";

// GitHub App webhook (one URL for the whole app). The gate is X-Hub-Signature-256 with the app's
// webhook secret; nothing is read from the payload before it verifies. Every verified "nothing to
// do" answers 204 so GitHub doesn't retry it.
const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  const cfg = githubAppConfig();
  const raw = await readBodyWithin(request, MAX_BODY_BYTES);
  if (raw === null) return new NextResponse(null, { status: 413 });
  if (!cfg || !verifyGithubSignature(cfg.webhookSecret, raw, request.headers.get("x-hub-signature-256"))) return new NextResponse(null, { status: 401 });

  let body: { action?: string; installation?: { id?: number }; repository?: { id?: number }; issue?: { number?: number } };
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const event = request.headers.get("x-github-event");
  const installationId = body.installation?.id ? String(body.installation.id) : null;
  const repoId = body.repository?.id ? String(body.repository.id) : null;
  if (!installationId || !repoId) return new NextResponse(null, { status: 204 });

  if (event === "repository" && body.action === "publicized") {
    await unlinkPublicRepository(installationId, repoId);
    return new NextResponse(null, { status: 204 });
  }
  if (event === "issues" && (body.action === "closed" || body.action === "reopened") && body.issue?.number) {
    const connectionId = await githubConnectionForInstallation(installationId);
    if (connectionId) await applyIssueState(connectionId, repoId, body.issue.number, body.action === "closed");
  }
  return new NextResponse(null, { status: 204 });
}
