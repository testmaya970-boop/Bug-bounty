import { withServiceRoleTransaction, callRpc } from "../../db-pool";
import { PermanentHandlerError, RetryableHandlerError } from "../../registry";
import {
  addComment,
  adfDoc,
  adfHeading,
  adfLabelledLine,
  adfLinkParagraph,
  createIssue,
  jiraCategoryForReportStatus,
  jiraPriorityForSeverity,
  moveIssueToCategory,
  textToAdfBlocks,
  type JiraCredentials,
  type JiraResult,
} from "@/lib/jira-client";
import { weaknessTypeLabel } from "@/lib/report-weakness-labels";
import { assetTypeLabel } from "@/lib/scope-labels";
import type { OutboxEvent } from "@/types/outbox";
import type { ReportSeverity, ReportStatus, ReportWeaknessType } from "@/types/report";
import type { ProgramAssetType } from "@/types/scope";

/**
 * Outbound Unpatched -> Jira (db/migrations/202610010001_jira_integration.sql). One
 * handler, registered for every report.* event that should reach Jira; it is a no-op for
 * an organization with no Jira connection.
 *
 * Idempotency differs from report-created-v1.ts on purpose. That consumer commits its
 * receipt BEFORE the side effect (at-most-once) -- right for a log line, wrong for a Jira
 * call that can fail: the work would be lost. Here the receipt is written LAST, only after
 * every Jira call succeeded, so a failure anywhere leaves no receipt and the outbox retries
 * the whole event. Each step is safe to repeat:
 *   1. receipt already present -> done, return (a redelivery after success).
 *   2. ensure the issue exists: one transaction holding a per-report advisory lock reads the
 *      link, creates the Jira issue only if there is none, and commits the link. Different
 *      events for the same report (report.created + report.accepted in one batch) serialize
 *      here, so the second sees the first's link instead of creating a second issue.
 *   3. transition + comment, with NO transaction held (moveIssueToCategory is a no-op when
 *      the issue is already Done).
 *   4. insert the receipt (on conflict do nothing) and stamp last_synced_at.
 * Each handler holds at most ONE pooled connection at a time (the worker pool is max 5 and
 * a batch is 10 events -- nesting a second connection inside an open transaction could
 * starve the pool). Step 2 does keep its transaction open across one create-issue HTTP call
 * (10s timeout). ponytail: fine at bounty-report volume; move to a claim-row pattern if Jira
 * creates ever pin pool connections.
 *
 * Disclosed residual gaps (Jira's create/comment APIs take no idempotency key): if Jira
 * created the issue but step 2's commit then fails, the retry creates a second issue; if a
 * comment posted but step 4 then fails, the retry posts that comment again.
 *
 * State, not event, drives the transition: the report's CURRENT status decides whether
 * the issue moves to Done, so events processed out of order still converge. The event type
 * only decides the comment text. A report created before Jira was connected gets its issue
 * lazily, on the first later event.
 */
const CONSUMER_NAME = "jira_sync";

const STATUS_EVENT_COMMENTS: Record<string, string> = {
  "report.triage_started": "Triage started.",
  "report.needs_information": "More information was requested from the researcher.",
  "report.accepted": "Accepted as a valid vulnerability.",
  "report.resolved": "Marked resolved.",
  "report.duplicate": "Closed as a duplicate.",
  "report.informative": "Closed as informative.",
  "report.not_applicable": "Closed as not applicable.",
  "report.rejected": "Rejected.",
};

export const JIRA_SYNC_EVENT_TYPES = ["report.created", "report.message_posted", ...Object.keys(STATUS_EVENT_COMMENTS)] as const;

type CredentialsRow = { site_url: string; account_email: string; api_token: string; project_key: string; issue_type_name: string };

type SyncContextRow = {
  report_id: string;
  organization_id: string;
  program_id: string;
  program_name: string;
  title: string;
  description: string;
  impact: string | null;
  status: ReportStatus;
  confirmed_severity: ReportSeverity | null;
  researcher_severity: ReportSeverity | null;
  weakness_type: ReportWeaknessType | null;
  asset_type: ProgramAssetType;
  display_target: string;
  jira_issue_id: string | null;
  jira_issue_key: string | null;
  message_body: string | null;
  message_author_context: "organization" | "researcher" | null;
  message_visibility: "researcher_visible" | "internal" | null;
  message_author_name: string | null;
};

/** Links back to Unpatched inside Jira issues: the pinned public origin, like every other
 * outbound link (APP_ORIGIN). */
function appUrl(): string {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new PermanentHandlerError("APP_ORIGIN is not set -- Jira issues would link to an unreachable address");
  return origin.replace(/\/$/, "");
}

export function reportUrl(ctx: Pick<SyncContextRow, "organization_id" | "program_id" | "report_id">): string {
  return `${appUrl()}/organizations/${ctx.organization_id}/programs/${ctx.program_id}/reports/${ctx.report_id}`;
}

function severityLine(ctx: SyncContextRow): string {
  if (ctx.confirmed_severity) return `${ctx.confirmed_severity} (confirmed by triage)`;
  if (ctx.researcher_severity) return `${ctx.researcher_severity} (researcher's assessment)`;
  return "not set";
}

export function buildIssueDescription(ctx: SyncContextRow) {
  return adfDoc([
    adfLabelledLine("Target", `${ctx.display_target} (${assetTypeLabel(ctx.asset_type)})`),
    adfLabelledLine("Severity", severityLine(ctx)),
    adfLabelledLine("Vulnerability category", ctx.weakness_type ? weaknessTypeLabel(ctx.weakness_type) : "not specified"),
    adfLabelledLine("Program", ctx.program_name),
    adfLinkParagraph("View the full report in Unpatched", reportUrl(ctx)),
    adfHeading("Description"),
    ...textToAdfBlocks(ctx.description),
    ...(ctx.impact ? [adfHeading("Impact"), ...textToAdfBlocks(ctx.impact)] : []),
  ]);
}

function messageHeading(ctx: SyncContextRow): string {
  if (ctx.message_author_context === "researcher") return "Researcher message on Unpatched";
  const who = ctx.message_author_name ?? "A team member";
  return ctx.message_visibility === "internal" ? `Internal note by ${who} on Unpatched` : `Message to the researcher by ${who} on Unpatched`;
}

function unwrap<T>(result: JiraResult<T>): T {
  if (result.ok) return result.data;
  throw result.permanent ? new PermanentHandlerError(`jira: ${result.error}`) : new RetryableHandlerError(`jira: ${result.error}`);
}

type Issue = { id: string; key: string };

/** Step 2. Returns the report context and its (possibly just-created) issue. */
async function ensureIssue(credentials: JiraCredentials, connection: CredentialsRow, event: OutboxEvent, reportId: string, messageId: string | null): Promise<{ ctx: SyncContextRow; issue: Issue }> {
  return withServiceRoleTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`jira_sync:${reportId}`]);
    const ctx = (await callRpc<SyncContextRow>(client, "public.get_report_for_jira_sync", [reportId, messageId]))[0];
    if (!ctx) throw new PermanentHandlerError(`report ${reportId} referenced by this event no longer exists.`);
    if (ctx.organization_id !== event.organizationId) throw new PermanentHandlerError("event organization_id does not match the referenced report's own organization_id.");
    if (ctx.jira_issue_id && ctx.jira_issue_key) return { ctx, issue: { id: ctx.jira_issue_id, key: ctx.jira_issue_key } };

    const created = unwrap(
      await createIssue(credentials, {
        projectKey: connection.project_key,
        issueTypeName: connection.issue_type_name,
        summary: `[Unpatched] ${ctx.title}`,
        description: buildIssueDescription(ctx),
        priorityName: jiraPriorityForSeverity(ctx.confirmed_severity ?? ctx.researcher_severity),
        labels: ["unpatched"],
      }),
    );
    if (created.droppedOptionalFields) console.warn(`[outbox:jira_sync] ${created.key}: project rejected priority/labels; created without them`);
    await callRpc(client, "public.record_report_jira_sync", [ctx.report_id, created.id, created.key]);
    return { ctx, issue: { id: created.id, key: created.key } };
  });
}

/** Step 3. Transition before comment: if the comment then fails, the retry finds the issue
 * already Done (no-op) and only re-attempts the comment. */
async function pushChanges(credentials: JiraCredentials, ctx: SyncContextRow, issue: Issue, event: OutboxEvent): Promise<void> {
  const statusComment = STATUS_EVENT_COMMENTS[event.eventType];
  let movedNote = "";
  const category = statusComment ? jiraCategoryForReportStatus(ctx.status) : null;
  if (category) {
    const moved = unwrap(await moveIssueToCategory(credentials, issue.key, category));
    if (!moved.moved && !moved.statusName) movedNote = " The Jira workflow offered no transition to a Done status, so the issue's status was left as is.";
  }
  if (statusComment) {
    unwrap(await addComment(credentials, issue.key, adfDoc([...textToAdfBlocks(`Unpatched: ${statusComment}${movedNote}`), adfLinkParagraph("Open in Unpatched", reportUrl(ctx))])));
  } else if (event.eventType === "report.message_posted" && ctx.message_body) {
    unwrap(await addComment(credentials, issue.key, adfDoc([adfHeading(messageHeading(ctx)), ...textToAdfBlocks(ctx.message_body)])));
  }
}

export async function handleJiraSync(event: OutboxEvent): Promise<void> {
  const reportId = event.payload.report_id;
  if (typeof reportId !== "string") {
    throw new PermanentHandlerError(`${event.eventType} v${event.schemaVersion} payload has no report_id -- this will never succeed on retry.`);
  }
  const messageId = event.eventType === "report.message_posted" && typeof event.payload.message_id === "string" ? event.payload.message_id : null;

  let connection: CredentialsRow | undefined;
  let alreadyDone = false;
  try {
    [connection, alreadyDone] = await withServiceRoleTransaction(async (client) => {
      const receipt = await client.query("select 1 from public.outbox_event_receipts where consumer_name = $1 and event_id = $2", [CONSUMER_NAME, event.id]);
      const rows = await callRpc<CredentialsRow>(client, "public.get_jira_credentials", [event.organizationId]);
      return [rows[0], receipt.rows.length > 0] as const;
    });
  } catch (error) {
    throw new RetryableHandlerError(error instanceof Error ? error.message : String(error));
  }
  if (!connection || alreadyDone) return; // No Jira for this organization, or already synced.
  const credentials: JiraCredentials = { siteUrl: connection.site_url, accountEmail: connection.account_email, apiToken: connection.api_token };

  try {
    const { ctx, issue } = await ensureIssue(credentials, connection, event, reportId, messageId);
    await pushChanges(credentials, ctx, issue, event);
    await withServiceRoleTransaction(async (client) => {
      await client.query("insert into public.outbox_event_receipts (consumer_name, event_id) values ($1, $2) on conflict (consumer_name, event_id) do nothing", [CONSUMER_NAME, event.id]);
      await callRpc(client, "public.record_report_jira_sync", [ctx.report_id, issue.id, issue.key]);
    });
  } catch (error) {
    const handlerError =
      error instanceof PermanentHandlerError || error instanceof RetryableHandlerError ? error : new RetryableHandlerError(error instanceof Error ? error.message : String(error));
    // Surface it on the org's settings page (best-effort; the outbox records it too).
    await withServiceRoleTransaction((client) => callRpc(client, "public.record_jira_sync_error", [event.organizationId, handlerError.message])).catch(() => {});
    throw handlerError;
  }
}
