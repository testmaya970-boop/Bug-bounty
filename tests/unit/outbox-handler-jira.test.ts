import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermanentHandlerError, RetryableHandlerError } from "../../workers/outbox/registry";
import type { OutboxEvent } from "../../types/outbox";

// Same boundary as outbox-handler-report-created.test.ts: workers/outbox/db-pool is mocked,
// the handler's own logic runs for real, and `fetch` is stubbed with Jira-shaped responses.
const db = {
  credentials: [{ site_url: "https://acme.atlassian.net", account_email: "bot@acme.test", api_token: "ATATT-secret", project_key: "SEC", issue_type_name: "Bug" }] as unknown[],
  receiptExists: false,
  context: {} as Record<string, unknown>,
  rpcCalls: [] as { fn: string; args: unknown[] }[],
  receiptInserts: 0,
};

vi.mock("../../workers/outbox/db-pool", () => {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.startsWith("select 1 from public.outbox_event_receipts")) return { rows: db.receiptExists ? [{}] : [] };
      if (sql.startsWith("insert into public.outbox_event_receipts")) db.receiptInserts++;
      return { rows: [] };
    }),
  };
  return {
    withServiceRoleTransaction: vi.fn((fn: (c: unknown) => unknown) => fn(client)),
    callRpc: vi.fn(async (_client: unknown, fn: string, args: unknown[]) => {
      db.rpcCalls.push({ fn, args });
      if (fn === "public.get_jira_credentials") return db.credentials;
      if (fn === "public.get_report_for_jira_sync") return [db.context];
      return [];
    }),
  };
});

const REPORT = {
  report_id: "report-1",
  organization_id: "org-1",
  program_id: "program-1",
  program_name: "Acme Web",
  title: "Stored XSS in profile bio",
  description: "Steps to reproduce",
  impact: null,
  status: "new",
  confirmed_severity: null,
  researcher_severity: "high",
  weakness_type: "xss",
  asset_type: "domain",
  display_target: "app.acme.test",
  jira_issue_id: null,
  jira_issue_key: null,
  message_body: null,
  message_author_context: null,
  message_visibility: null,
  message_author_name: null,
};

function event(eventType: string, payload: Record<string, unknown> = { report_id: "report-1" }): OutboxEvent {
  return {
    id: `event-${eventType}`,
    eventType,
    schemaVersion: 1,
    aggregateType: "report",
    aggregateId: "report-1",
    organizationId: "org-1",
    payload,
    occurredAt: "2026-10-01T00:00:00Z",
    availableAt: "2026-10-01T00:00:00Z",
    attempts: 1,
    maxAttempts: 8,
    status: "processing",
    lockedAt: null,
    lockedBy: null,
    processedAt: null,
    lastError: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

const fetchMock = vi.fn();
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  db.receiptExists = false;
  db.context = { ...REPORT };
  db.rpcCalls = [];
  db.receiptInserts = 0;
  db.credentials = [{ site_url: "https://acme.atlassian.net", account_email: "bot@acme.test", api_token: "ATATT-secret", project_key: "SEC", issue_type_name: "Bug" }];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const rpcNames = () => db.rpcCalls.map((c) => c.fn);

describe("handleJiraSync", () => {
  it("is a no-op (no Jira call, no receipt) for an organization without a Jira connection", async () => {
    db.credentials = [];
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await handleJiraSync(event("report.created"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.receiptInserts).toBe(0);
  });

  it("report.created: creates the issue, records the link, then writes the receipt", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: "10042", key: "SEC-42", self: "https://acme.atlassian.net/rest/api/3/issue/10042" }));
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await handleJiraSync(event("report.created"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.fields).toMatchObject({ project: { key: "SEC" }, issuetype: { name: "Bug" }, summary: "[Unpatched] Stored XSS in profile bio", priority: { name: "High" } });
    expect(JSON.stringify(body.fields.description)).toContain("app.acme.test");
    expect(JSON.stringify(body)).not.toContain("ATATT-secret");
    expect(db.rpcCalls.filter((c) => c.fn === "public.record_report_jira_sync")[0].args).toEqual(["report-1", "10042", "SEC-42"]);
    expect(db.receiptInserts).toBe(1);
  });

  it("skips entirely when this consumer's receipt already exists (redelivery after success)", async () => {
    db.receiptExists = true;
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await handleJiraSync(event("report.created"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcNames()).not.toContain("public.get_report_for_jira_sync");
  });

  it("report.resolved on a linked issue: moves it to Done, then comments -- no second issue", async () => {
    db.context = { ...REPORT, status: "resolved", jira_issue_id: "10042", jira_issue_key: "SEC-42" };
    fetchMock
      .mockResolvedValueOnce(json(200, { fields: { status: { name: "In Progress", statusCategory: { key: "indeterminate" } } } }))
      .mockResolvedValueOnce(json(200, { transitions: [{ id: "31", name: "Done", to: { name: "Done", statusCategory: { key: "done" } } }] }))
      .mockResolvedValueOnce(json(204))
      .mockResolvedValueOnce(json(201, { id: "1" }));
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await handleJiraSync(event("report.resolved"));

    const urls = fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit).method} ${c[0]}`);
    expect(urls).toEqual([
      "GET https://acme.atlassian.net/rest/api/3/issue/SEC-42?fields=status",
      "GET https://acme.atlassian.net/rest/api/3/issue/SEC-42/transitions",
      "POST https://acme.atlassian.net/rest/api/3/issue/SEC-42/transitions",
      "POST https://acme.atlassian.net/rest/api/3/issue/SEC-42/comment",
    ]);
    expect(JSON.stringify(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body)))).toContain("Unpatched: Marked resolved.");
    expect(db.receiptInserts).toBe(1);
  });

  it("report.accepted never moves the Jira status (engineering owns the workflow) -- comment only", async () => {
    db.context = { ...REPORT, status: "accepted", jira_issue_id: "10042", jira_issue_key: "SEC-42" };
    fetchMock.mockResolvedValueOnce(json(201, { id: "1" }));
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await handleJiraSync(event("report.accepted"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/comment$/);
  });

  it("report.message_posted: posts the message body as a comment, labelled by author context", async () => {
    db.context = { ...REPORT, jira_issue_id: "10042", jira_issue_key: "SEC-42", message_body: "Here is the PoC", message_author_context: "researcher", message_visibility: "researcher_visible" };
    fetchMock.mockResolvedValueOnce(json(201, { id: "1" }));
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await handleJiraSync(event("report.message_posted", { report_id: "report-1", message_id: "m-1" }));
    expect(db.rpcCalls.find((c) => c.fn === "public.get_report_for_jira_sync")!.args).toEqual(["report-1", "m-1"]);
    const comment = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(comment).toContain("Researcher message on Unpatched");
    expect(comment).toContain("Here is the PoC");
  });

  it("a rejected token (401) is a PermanentHandlerError, recorded on the connection, with no receipt", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { errorMessages: ["You are not authenticated."], errors: {} }));
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await expect(handleJiraSync(event("report.created"))).rejects.toBeInstanceOf(PermanentHandlerError);
    expect(db.rpcCalls.find((c) => c.fn === "public.record_jira_sync_error")!.args[1]).toContain("HTTP 401, authentication");
    expect(db.receiptInserts).toBe(0);
  });

  it("a Jira outage (503) is retryable and leaves no receipt, so the outbox retries the event", async () => {
    fetchMock.mockResolvedValueOnce(json(503));
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await expect(handleJiraSync(event("report.created"))).rejects.toBeInstanceOf(RetryableHandlerError);
    expect(db.receiptInserts).toBe(0);
  });

  it("dead-letters an event whose org claim disagrees with the report's own organization", async () => {
    db.context = { ...REPORT, organization_id: "someone-else" };
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    await expect(handleJiraSync(event("report.created"))).rejects.toBeInstanceOf(PermanentHandlerError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is registered for every report event Jira should see", async () => {
    await import("../../workers/outbox/handlers");
    const { getHandlers } = await import("../../workers/outbox/registry");
    const { handleJiraSync } = await import("../../workers/outbox/handlers/jira/jira-sync-handler");
    for (const type of ["report.created", "report.triage_started", "report.needs_information", "report.accepted", "report.resolved", "report.duplicate", "report.informative", "report.not_applicable", "report.rejected", "report.message_posted"]) {
      expect(getHandlers(type, 1)).toContain(handleJiraSync);
    }
  });
});
