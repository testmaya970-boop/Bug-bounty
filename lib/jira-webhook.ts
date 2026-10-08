import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ReportStatus } from "@/types/report";

/**
 * Inbound Jira -> Unpatched (app/api/webhooks/jira/[organizationId]/route.ts).
 *
 * Origin proof: Jira Cloud admin webhooks configured with a secret send
 *   X-Hub-Signature: sha256=<hex HMAC-SHA256(secret, raw request body)>
 * (developer.atlassian.com/cloud/jira/platform/webhooks/, "last updated Oct 1, 2026").
 * The header is client-controlled like any other -- it is NOT trusted for its presence or
 * its claimed method; it is a MAC that only a holder of this organization's
 * server-generated secret can produce, re-derived here and compared in constant time.
 * That is what makes it a credential rather than the kind of header-based exception
 * AGENTS.md forbids.
 */
export const JIRA_SIGNATURE_HEADER = "x-hub-signature";

const SIGNATURE_FORMAT = /^sha256=([0-9a-fA-F]{64})$/;

export function verifyJiraSignature(secret: string, rawBody: Buffer, header: string | null): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const match = SIGNATURE_FORMAT.exec(header?.trim() ?? "");
  // Always run the constant-time compare (against zeros for a missing/malformed header),
  // so a malformed header is not measurably faster to reject than a wrong one.
  const provided = match ? Buffer.from(match[1], "hex") : Buffer.alloc(expected.length);
  return timingSafeEqual(expected, provided) && match !== null;
}

/** Only the fields this route reads; everything else in Jira's (large) payload is
 * ignored, and bounded so a verified-but-odd payload cannot balloon what we keep. */
export const jiraIssueUpdatedSchema = z.object({
  webhookEvent: z.string().max(100),
  user: z.object({ displayName: z.string().max(255).optional() }).optional(),
  issue: z.object({
    id: z.string().regex(/^[0-9]{1,20}$/),
    key: z.string().max(40),
    fields: z.object({
      status: z.object({ name: z.string().max(255), statusCategory: z.object({ key: z.string().max(40) }) }),
      resolution: z.object({ name: z.string().max(255) }).nullable().optional(),
    }),
  }),
  changelog: z.object({ items: z.array(z.object({ field: z.string().max(255) })).max(500) }).optional(),
});

export type JiraIssueUpdated = z.infer<typeof jiraIssueUpdatedSchema>;

// Resolutions that close an issue without fixing anything. Jira's default schemes ship
// "Won't Do"/"Won't Fix"/"Duplicate"/"Cannot Reproduce"/"Declined"/"Incomplete". Closing
// the Jira issue that way must not mark the vulnerability resolved in Unpatched (that
// tells the researcher it was fixed, and feeds reputation).
const NOT_A_FIX = /won'?t|duplicate|cannot reproduce|can't reproduce|declined|incomplete|not a bug|rejected/i;

export type InboundDecision = { action: "resolve"; summary: string } | { action: "ignore"; reason: string };

/** Pure: what, if anything, this verified Jira event should do to the linked report.
 * Only one mapping exists -- issue moved into the Done status category (with a fix-type
 * resolution or none) resolves an ACCEPTED report via the real resolve_report RPC.
 * resolve_report's own transition check would refuse other states anyway; checking here
 * first just avoids a doomed RPC call and a misleading error log. */
export function decideInboundAction(payload: JiraIssueUpdated, reportStatus: ReportStatus): InboundDecision {
  if (payload.webhookEvent !== "jira:issue_updated") return { action: "ignore", reason: `event ${payload.webhookEvent}` };
  if (!payload.changelog?.items.some((item) => item.field.toLowerCase() === "status")) return { action: "ignore", reason: "no status change" };
  const { status, resolution } = payload.issue.fields;
  if (status.statusCategory.key !== "done") return { action: "ignore", reason: `status category ${status.statusCategory.key}` };
  if (resolution && NOT_A_FIX.test(resolution.name)) return { action: "ignore", reason: `resolution ${resolution.name}` };
  if (reportStatus !== "accepted") return { action: "ignore", reason: `report is ${reportStatus}` };

  const by = payload.user?.displayName ? ` by ${payload.user.displayName}` : "";
  const how = resolution ? ` (resolution: ${resolution.name})` : "";
  return { action: "resolve", summary: `Resolved in Jira: ${payload.issue.key} moved to "${status.name}"${how}${by}.` };
}
