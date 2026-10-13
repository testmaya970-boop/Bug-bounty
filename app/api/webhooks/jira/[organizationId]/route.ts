import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { callRpc, withActorTransaction, withServiceRoleTransaction } from "@/lib/db/pool";
import { recordError } from "@/lib/error-tracking";
import { logger } from "@/lib/logger";
import { readBodyWithin } from "@/lib/read-body";
import { decideInboundAction, JIRA_SIGNATURE_HEADER, jiraIssueUpdatedSchema, verifyJiraSignature } from "@/lib/jira-webhook";
import type { ReportStatus } from "@/types/report";

/**
 * Jira Cloud -> Unpatched. Public and session-less on purpose (Jira has no Unpatched
 * session), so proxy.ts excludes this PATH from its session matcher, exactly like
 * api/health. That is a static-path exclusion, not a header-based bypass: nothing here or
 * in the proxy branches on a client-controlled header to skip a check.
 *
 * The gate is the HMAC: X-Hub-Signature must equal HMAC-SHA256(this organization's
 * server-generated webhook secret, the raw body), compared with timingSafeEqual
 * (lib/jira-webhook.ts). The organization id in the URL only selects WHICH secret to
 * check against -- it is never itself proof of anything.
 *
 * Enumeration safety: a malformed id, an organization with no Jira connection, a missing
 * signature and a wrong signature all get the identical empty 401, after the same work
 * (rate-limit consume + credential lookup + one HMAC, against a throwaway secret when there
 * is no connection). 401 is also outside Jira's retry list (408/409/425/429/5xx), so a
 * misconfigured secret does not trigger retry storms. Once verified, every "nothing to do"
 * outcome (other event types, unlinked issue, status we don't map) is a 204 so Jira never
 * retries it; only a genuine server failure is a 5xx (which Jira retries, as it should).
 *
 * A verified "issue moved to Done" calls the EXISTING public.resolve_report RPC through
 * withActorTransaction as the connection's created_by user -- the same authorization
 * (private.lock_and_authorize_report_for_triage), transition table, audit log and outbox
 * event as a human clicking Resolve. Nothing here re-implements that logic.
 */

// Jira's issue payload carries the full issue (fields, changelog, user); big descriptions
// make it tens of KB. 1 MiB is generous and still bounds an unauthenticated body.
const MAX_BODY_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Used only so an unknown organization costs the same HMAC as a known one.
const NO_CONNECTION_SECRET = randomUUID();

type CredentialsRow = { webhook_secret: string; created_by: string; actor_active: boolean };

const unauthorized = () => new NextResponse(null, { status: 401 });
const nothingToDo = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const requestId = randomUUID();
  const { organizationId } = await params;
  const raw = await readBodyWithin(request, MAX_BODY_BYTES);
  if (raw === null) return new NextResponse(null, { status: 413 });
  // Not a uuid -> nothing could ever verify; same response as a bad signature.
  if (!UUID.test(organizationId)) return unauthorized();

  let credentials: CredentialsRow | undefined;
  let allowed = false;
  try {
    [allowed, credentials] = await withServiceRoleTransaction(async (client) => {
      const limit = await client.query<{ ok: boolean }>("select public.check_jira_webhook_rate_limit($1) as ok", [organizationId]);
      const rows = await callRpc<CredentialsRow>(client, "public.get_jira_credentials", [organizationId]);
      return [limit.rows[0]?.ok === true, rows[0]] as const;
    });
  } catch (error) {
    void recordError({ source: "server", message: `jira webhook lookup failed: ${error instanceof Error ? error.message : String(error)}`, route: "POST /api/webhooks/jira/[organizationId]" });
    return new NextResponse(null, { status: 503 });
  }
  if (!allowed) return new NextResponse(null, { status: 429 });

  const verified = verifyJiraSignature(credentials?.webhook_secret ?? NO_CONNECTION_SECRET, raw, request.headers.get(JIRA_SIGNATURE_HEADER));
  if (!verified || !credentials) return unauthorized();

  // ---- Verified: from here on the sender is this organization's own Jira. ----
  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = jiraIssueUpdatedSchema.safeParse(json);
  if (!parsed.success) return nothingToDo(); // Another event type/shape we don't consume.

  let report: { report_id: string; status: ReportStatus } | undefined;
  try {
    report = (await withServiceRoleTransaction((client) => callRpc<{ report_id: string; status: ReportStatus }>(client, "public.find_report_by_jira_issue", [organizationId, parsed.data.issue.id])))[0];
  } catch (error) {
    void recordError({ source: "server", message: `jira webhook report lookup failed: ${error instanceof Error ? error.message : String(error)}`, route: "POST /api/webhooks/jira/[organizationId]" });
    return new NextResponse(null, { status: 503 });
  }
  if (!report) return nothingToDo(); // Not an issue Unpatched created.

  const decision = decideInboundAction(parsed.data, report.status);
  if (decision.action === "ignore") return nothingToDo();

  const log = (level: "info" | "warn", message: string, errorCode?: string) =>
    logger.log({ level, requestId, operation: "jira_webhook.resolve_report", actorId: credentials.created_by, organizationId, aggregateType: "report", aggregateId: report.report_id, errorCode, message });

  // has_org_role checks membership, not account deactivation -- refuse to act as a
  // deactivated/suspended account (get_jira_credentials computes actor_active).
  if (!credentials.actor_active) {
    log("warn", "connection owner account is deactivated or suspended; inbound change ignored", "ACTOR_INACTIVE");
    return nothingToDo();
  }

  try {
    // This path skips the proxy, so no session header here is verified: pass none explicitly.
    await withActorTransaction(credentials.created_by, (client) => callRpc(client, "public.resolve_report", [report.report_id, decision.summary]), { sessionId: "" });
    log("info", "report resolved from Jira");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /^([A-Z_]+): /.exec(message)?.[1];
    // The real RPC refused (configuring user lost access, report moved on meanwhile):
    // a correct, final answer -- acknowledge so Jira doesn't retry it.
    if (code === "FORBIDDEN" || code === "INVALID_TRANSITION" || code === "REPORT_NOT_FOUND" || code === "AUTH_REQUIRED" || code === "INVALID_RESOLUTION") {
      log("warn", "resolve_report refused the inbound change", code);
      return nothingToDo();
    }
    void recordError({ source: "server", message: `jira webhook resolve failed: ${message}`, route: "POST /api/webhooks/jira/[organizationId]" });
    return new NextResponse(null, { status: 500 });
  }
  return nothingToDo();
}
