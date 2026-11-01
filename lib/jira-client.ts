import type { ReportSeverity, ReportStatus } from "@/types/report";

/**
 * Jira Cloud REST API v3, per-organization API-token auth (db/migrations/
 * 202610010001_jira_integration.sql). No `import "server-only"`, for the same reason as
 * lib/email-provider.ts: the outbox worker (plain tsx, never bundled by Next) imports this.
 * Nothing client-side imports it.
 *
 * Auth is Jira Cloud's documented API-token scheme: HTTP Basic with
 * base64(accountEmail:apiToken) -- not a Bearer token. The token lives only in memory for
 * the duration of a call; it is never logged and never part of a returned error string.
 *
 * Endpoints (Jira Cloud platform REST v3 OpenAPI spec, swagger-v3.v3.json, fetched
 * 2026-10-01):
 *   POST /rest/api/3/issue                               createIssue   -> 201 {id,key,self}
 *   GET  /rest/api/3/issue/{key}?fields=status           getIssue      -> 200
 *   GET  /rest/api/3/issue/{key}/transitions             getTransitions-> 200 {transitions[]}
 *   POST /rest/api/3/issue/{key}/transitions             doTransition  -> 204
 *   POST /rest/api/3/issue/{key}/comment                 addComment    -> 201
 * v3 requires Atlassian Document Format for `description` and comment `body` (the spec:
 * "description, environment, and any textarea type custom fields ... take Atlassian
 * Document Format content") -- see toAdf below.
 */

export type JiraCredentials = { siteUrl: string; accountEmail: string; apiToken: string };

export type JiraResult<T> = { ok: true; data: T } | { ok: false; permanent: boolean; status: number | null; error: string; fieldErrors?: string[] };

const REQUEST_TIMEOUT_MS = 10_000;

function jiraErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { errorMessages?: unknown; errors?: unknown };
    const parts: string[] = [];
    if (Array.isArray(b.errorMessages)) parts.push(...b.errorMessages.filter((m): m is string => typeof m === "string"));
    if (b.errors && typeof b.errors === "object") {
      for (const [field, message] of Object.entries(b.errors as Record<string, unknown>)) {
        if (typeof message === "string") parts.push(`${field}: ${message}`);
      }
    }
    if (parts.length) return parts.join("; ").slice(0, 400);
  }
  return `HTTP ${status}`;
}

/** Mirrors lib/email-provider.ts's classifyResendFailure reasoning exactly, plus one
 * Jira-specific case (409). The outbox's own max_attempts bound caps how long anything
 * classified retryable can actually be retried, so the conservative default for an
 * unrecognized status is still "retry", never "give up after one ambiguous response". */
export function classifyJiraFailure(status: number, body: unknown): { permanent: boolean; error: string } {
  const message = jiraErrorMessage(status, body);
  // 429 (rate limited -- Jira Cloud enforces per-site and per-user limits) and every 5xx
  // (Atlassian-side outage) are Jira telling us to try again later.
  if (status === 429 || status >= 500) return { permanent: false, error: `retryable (HTTP ${status}): ${message}` };
  // 409: doTransition documents 409 for a conflicting concurrent change to the issue -- a
  // state that clears on its own, unlike every other 4xx. Jira's own webhook retry policy
  // treats 409 as retryable for the same reason.
  if (status === 409) return { permanent: false, error: `retryable (HTTP 409, conflict): ${message}` };
  // 401/403: the configured email/token is rejected (revoked, expired -- Atlassian tokens
  // expire -- or lacks project permission). Identical config fails identically; the admin
  // has to fix it in Settings.
  if (status === 401 || status === 403) return { permanent: true, error: `permanent (HTTP ${status}, authentication): ${message}` };
  // Every other 4xx (400 invalid field, 404 issue/project gone, 413 too large, 422) is a
  // request Jira will never accept unchanged.
  if (status >= 400 && status < 500) return { permanent: true, error: `permanent (HTTP ${status}): ${message}` };
  return { permanent: false, error: `retryable (unrecognized HTTP ${status}): ${message}` };
}

export function basicAuthHeader(credentials: Pick<JiraCredentials, "accountEmail" | "apiToken">): string {
  return `Basic ${Buffer.from(`${credentials.accountEmail}:${credentials.apiToken}`, "utf8").toString("base64")}`;
}

async function jiraRequest(credentials: JiraCredentials, method: "GET" | "POST", path: string, body?: unknown): Promise<JiraResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(`${credentials.siteUrl}${path}`, {
      method,
      headers: {
        Authorization: basicAuthHeader(credentials),
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Never follow a redirect with the credential attached, and never let a redirect
      // move the request off the validated *.atlassian.net host.
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (networkError) {
    // DNS, refused connection, timeout, or a redirect -- nothing about the request itself
    // was rejected by Jira, so retryable.
    const detail = networkError instanceof Error ? networkError.message : String(networkError);
    return { ok: false, permanent: false, status: null, error: `retryable (network error): ${detail}` };
  }

  let parsed: unknown = null;
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON (an HTML error page from a proxy) -- classified by status below.
    }
  }
  if (response.ok) return { ok: true, data: parsed };
  const errors = (parsed as { errors?: unknown } | null)?.errors;
  const fieldErrors = errors && typeof errors === "object" ? Object.keys(errors) : [];
  return { ok: false, status: response.status, fieldErrors, ...classifyJiraFailure(response.status, parsed) };
}

// --- Atlassian Document Format ---------------------------------------------------------

type AdfNode = Record<string, unknown>;
export type AdfDoc = { type: "doc"; version: 1; content: AdfNode[] };

// Jira's per-field limit is 32,767 characters; leave room for the surrounding metadata.
const MAX_BODY_CHARS = 30_000;

function textNode(text: string, href?: string): AdfNode {
  return href ? { type: "text", text, marks: [{ type: "link", attrs: { href } }] } : { type: "text", text };
}

/** One paragraph, single newlines as hardBreaks. ADF rejects empty text nodes, so blank
 * lines are dropped rather than emitted. */
function paragraph(text: string): AdfNode | null {
  const lines = text.split("\n");
  const content: AdfNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0 && content.length > 0) content.push({ type: "hardBreak" });
    if (line.length > 0) content.push(textNode(line));
  });
  while (content.length && content[content.length - 1].type === "hardBreak") content.pop();
  return content.length ? { type: "paragraph", content } : null;
}

/** Plain text / light Markdown -> ADF blocks. Researchers paste PoCs in ``` fences, so
 * those become real codeBlocks; everything else is paragraphs split on blank lines. No
 * other Markdown is interpreted (rendered literally, which Jira displays fine). */
export function textToAdfBlocks(input: string): AdfNode[] {
  let text = input.replace(/\r\n/g, "\n");
  if (text.length > MAX_BODY_CHARS) text = `${text.slice(0, MAX_BODY_CHARS)}\n\n[truncated -- see the full report in Unpatched]`;
  const blocks: AdfNode[] = [];
  const segments = text.split(/^```[^\n]*$/m);
  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      const code = segment.replace(/^\n|\n$/g, "");
      if (code.length) blocks.push({ type: "codeBlock", content: [textNode(code)] });
      return;
    }
    for (const chunk of segment.split(/\n{2,}/)) {
      const node = paragraph(chunk.trim());
      if (node) blocks.push(node);
    }
  });
  return blocks;
}

export function adfDoc(blocks: AdfNode[]): AdfDoc {
  return { type: "doc", version: 1, content: blocks.length ? blocks : [{ type: "paragraph", content: [textNode("(no content)")] }] };
}

export function adfHeading(text: string): AdfNode {
  return { type: "heading", attrs: { level: 3 }, content: [textNode(text)] };
}

export function adfLinkParagraph(label: string, href: string): AdfNode {
  return { type: "paragraph", content: [textNode(label, href)] };
}

export function adfLabelledLine(label: string, value: string): AdfNode {
  return { type: "paragraph", content: [{ type: "text", text: `${label}: `, marks: [{ type: "strong" }] }, textNode(value)] };
}

// --- Mappings --------------------------------------------------------------------------

/** Jira's default priority scheme names. A project with a custom scheme (or no priority
 * field on its create screen) rejects this; createIssue then retries without it. */
const PRIORITY_BY_SEVERITY: Record<ReportSeverity, string> = {
  critical: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "Lowest",
};

export function jiraPriorityForSeverity(severity: ReportSeverity | null): string | null {
  return severity ? PRIORITY_BY_SEVERITY[severity] : null;
}

/** Only an Unpatched FINAL decision moves the Jira issue, and only into the "done" status
 * category (Jira's fixed category keys are new / indeterminate / done -- matched by
 * category, not by a status or transition name, because those are per-workflow). Earlier
 * states (triaging, accepted, needs_information) never move the issue: once engineering
 * has it In Progress, Unpatched's triage chatter must not drag it back to To Do. Those
 * changes are posted as comments instead. */
const FINAL_STATUSES: ReadonlySet<ReportStatus> = new Set(["resolved", "duplicate", "informative", "not_applicable", "rejected"]);

export function jiraCategoryForReportStatus(status: ReportStatus): "done" | null {
  return FINAL_STATUSES.has(status) ? "done" : null;
}

// --- Operations ------------------------------------------------------------------------

export type CreateIssueInput = {
  projectKey: string;
  issueTypeName: string;
  summary: string;
  description: AdfDoc;
  priorityName: string | null;
  labels: string[];
};

function issueFields(input: CreateIssueInput, optional: boolean) {
  return {
    project: { key: input.projectKey },
    issuetype: { name: input.issueTypeName },
    // Jira's summary limit is 255 characters.
    summary: input.summary.length > 255 ? `${input.summary.slice(0, 254)}…` : input.summary,
    description: input.description,
    ...(optional && input.priorityName ? { priority: { name: input.priorityName } } : {}),
    ...(optional && input.labels.length ? { labels: input.labels } : {}),
  };
}

/** Jira has no idempotency key for issue creation, so an ambiguous 2xx (no id/key) is
 * PERMANENT here, not retryable as in classifyResendFailure: the issue most likely exists,
 * and a blind retry would create a duplicate. The caller records the failure for an admin.
 *
 * Priority and labels are best-effort: when Jira rejects the create with a 400 whose only
 * field errors are priority/labels ("cannot be set... not on the appropriate screen"), the
 * create is retried once without them rather than failing the whole sync. */
export async function createIssue(credentials: JiraCredentials, input: CreateIssueInput): Promise<JiraResult<{ id: string; key: string; droppedOptionalFields: boolean }>> {
  let result = await jiraRequest(credentials, "POST", "/rest/api/3/issue", { fields: issueFields(input, true) });
  let dropped = false;
  if (!result.ok && result.status === 400 && (input.priorityName || input.labels.length) && onlyOptionalFieldErrors(result.fieldErrors)) {
    dropped = true;
    result = await jiraRequest(credentials, "POST", "/rest/api/3/issue", { fields: issueFields(input, false) });
  }
  if (!result.ok) return result;
  const data = result.data as { id?: unknown; key?: unknown } | null;
  if (!data || typeof data.id !== "string" || typeof data.key !== "string") {
    return { ok: false, permanent: true, status: null, error: "permanent (unrecognized 2xx create-issue response, no id/key -- not retried, to avoid a duplicate issue)" };
  }
  return { ok: true, data: { id: data.id, key: data.key, droppedOptionalFields: dropped } };
}

function onlyOptionalFieldErrors(fields: string[] | undefined): boolean {
  return Boolean(fields?.length) && fields!.every((field) => field === "priority" || field === "labels");
}

export async function addComment(credentials: JiraCredentials, issueKey: string, body: AdfDoc): Promise<JiraResult<null>> {
  const result = await jiraRequest(credentials, "POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, { body });
  return result.ok ? { ok: true, data: null } : result;
}

type Transition = { id: string; name: string; to?: { name?: string; statusCategory?: { key?: string } } };

/** Moves the issue into a status of the given category through whatever transition the
 * project's workflow offers. Already in that category -> no-op (this is also what stops
 * the inbound->outbound echo: a Jira-driven resolve comes back as report.resolved, finds
 * the issue already Done, and does nothing). No available transition into the category
 * (a restrictive workflow) -> not an error; reported as moved:false so the caller can say
 * so in a comment instead of failing the event forever. */
export async function moveIssueToCategory(
  credentials: JiraCredentials,
  issueKey: string,
  category: "done",
): Promise<JiraResult<{ moved: boolean; statusName: string | null }>> {
  const key = encodeURIComponent(issueKey);
  const issue = await jiraRequest(credentials, "GET", `/rest/api/3/issue/${key}?fields=status`);
  if (!issue.ok) return issue;
  const status = (issue.data as { fields?: { status?: { name?: string; statusCategory?: { key?: string } } } } | null)?.fields?.status;
  if (status?.statusCategory?.key === category) return { ok: true, data: { moved: false, statusName: status.name ?? null } };

  const listed = await jiraRequest(credentials, "GET", `/rest/api/3/issue/${key}/transitions`);
  if (!listed.ok) return listed;
  const transitions = ((listed.data as { transitions?: Transition[] } | null)?.transitions ?? []).filter((t) => typeof t.id === "string");
  const target = transitions.find((t) => t.to?.statusCategory?.key === category);
  if (!target) return { ok: true, data: { moved: false, statusName: null } };

  const done = await jiraRequest(credentials, "POST", `/rest/api/3/issue/${key}/transitions`, { transition: { id: target.id } });
  if (!done.ok) return done;
  return { ok: true, data: { moved: true, statusName: target.to?.name ?? target.name } };
}
