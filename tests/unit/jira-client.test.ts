import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addComment,
  adfDoc,
  basicAuthHeader,
  classifyJiraFailure,
  createIssue,
  jiraCategoryForReportStatus,
  jiraPriorityForSeverity,
  moveIssueToCategory,
  textToAdfBlocks,
  type CreateIssueInput,
} from "@/lib/jira-client";

// Response fixtures are the examples from Atlassian's own Jira Cloud platform REST v3
// OpenAPI spec (developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json, fetched
// 2026-10-01), except statusCategory keys: the spec's examples use placeholder keys
// ("in-flight"), while live sites return new / indeterminate / done.
const CREATE_ISSUE_201 = { id: "10000", key: "ED-24", self: "https://your-domain.atlassian.net/rest/api/3/issue/10000", transition: { status: 200, errorCollection: { errorMessages: [], errors: {} } } };
const PRIORITY_NOT_ON_SCREEN_400 = { errorMessages: [], errors: { priority: "Field 'priority' cannot be set. It is not on the appropriate screen, or unknown." } };
const ISSUE_TYPE_INVALID_400 = { errorMessages: [], errors: { issuetype: "Specify a valid issue type" } };
const UNAUTHORIZED_401 = { errorMessages: ["You are not authenticated. Authentication required to perform this operation."], errors: {} };
const COMMENT_201 = { id: "10000", self: "https://your-domain.atlassian.net/rest/api/3/issue/10010/comment/10000", body: { type: "doc", version: 1, content: [] } };

function issueWithStatus(categoryKey: string, name: string) {
  return { id: "10000", key: "ED-24", fields: { status: { name, statusCategory: { id: 2, key: categoryKey, name: "To Do", colorName: "blue-gray" } } } };
}
const TRANSITIONS_200 = {
  transitions: [
    { id: "11", name: "Start progress", hasScreen: false, isAvailable: true, to: { id: "3", name: "In Progress", statusCategory: { id: 4, key: "indeterminate", name: "In Progress" } } },
    { id: "31", name: "Done", hasScreen: false, isAvailable: true, to: { id: "10001", name: "Done", statusCategory: { id: 3, key: "done", name: "Done" } } },
  ],
};

const CREDS = { siteUrl: "https://acme.atlassian.net", accountEmail: "bot@acme.test", apiToken: "ATATT3xFfGF0-test-token" };

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function callAt(index: number) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> };
}

const INPUT: CreateIssueInput = {
  projectKey: "SEC",
  issueTypeName: "Bug",
  summary: "[Unpatched] Stored XSS in profile bio",
  description: adfDoc(textToAdfBlocks("Steps:\n1. open profile")),
  priorityName: "High",
  labels: ["unpatched"],
};

describe("classifyJiraFailure (mirrors classifyResendFailure)", () => {
  it.each([
    [429, false],
    [500, false],
    [503, false],
    [409, false],
    [401, true],
    [403, true],
    [400, true],
    [404, true],
    [422, true],
    [302, false],
  ])("HTTP %i -> permanent=%s", (status, permanent) => {
    expect(classifyJiraFailure(status, null).permanent).toBe(permanent);
  });

  it("labels auth failures and carries Jira's own error text (errorMessages + field errors)", () => {
    expect(classifyJiraFailure(401, UNAUTHORIZED_401).error).toBe("permanent (HTTP 401, authentication): You are not authenticated. Authentication required to perform this operation.");
    expect(classifyJiraFailure(400, ISSUE_TYPE_INVALID_400).error).toBe("permanent (HTTP 400): issuetype: Specify a valid issue type");
    expect(classifyJiraFailure(502, "<html>").error).toBe("retryable (HTTP 502): HTTP 502");
  });
});

describe("request shaping", () => {
  it("uses Jira Cloud's API-token Basic auth, base64(email:token), never Bearer", () => {
    expect(basicAuthHeader(CREDS)).toBe(`Basic ${Buffer.from("bot@acme.test:ATATT3xFfGF0-test-token").toString("base64")}`);
  });

  it("createIssue POSTs /rest/api/3/issue with project key, issue type name, ADF description, priority and labels", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, CREATE_ISSUE_201));
    const result = await createIssue(CREDS, INPUT);

    expect(result).toEqual({ ok: true, data: { id: "10000", key: "ED-24", droppedOptionalFields: false } });
    const call = callAt(0);
    expect(call.url).toBe("https://acme.atlassian.net/rest/api/3/issue");
    expect(call.init.method).toBe("POST");
    expect(call.init.redirect).toBe("error");
    expect(call.headers.Authorization).toBe(basicAuthHeader(CREDS));
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.body.fields).toMatchObject({ project: { key: "SEC" }, issuetype: { name: "Bug" }, summary: INPUT.summary, priority: { name: "High" }, labels: ["unpatched"] });
    expect(call.body.fields.description).toEqual({
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Steps:" }, { type: "hardBreak" }, { type: "text", text: "1. open profile" }] }],
    });
  });

  it("retries once without priority/labels when the project's create screen rejects only those fields", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, PRIORITY_NOT_ON_SCREEN_400)).mockResolvedValueOnce(jsonResponse(201, CREATE_ISSUE_201));
    const result = await createIssue(CREDS, INPUT);

    expect(result).toEqual({ ok: true, data: { id: "10000", key: "ED-24", droppedOptionalFields: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callAt(1).body.fields.priority).toBeUndefined();
    expect(callAt(1).body.fields.labels).toBeUndefined();
  });

  it("does NOT retry a 400 about a required field (issue type) -- permanent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, ISSUE_TYPE_INVALID_400));
    const result = await createIssue(CREDS, INPUT);
    expect(result).toMatchObject({ ok: false, permanent: true, status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 2xx without id/key as permanent (no idempotency key -> a retry could duplicate the issue)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
    expect(await createIssue(CREDS, INPUT)).toMatchObject({ ok: false, permanent: true });
  });

  it("classifies a network failure/timeout as retryable and never puts the token in the error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const result = await createIssue(CREDS, INPUT);
    expect(result).toMatchObject({ ok: false, permanent: false, status: null });
    expect(JSON.stringify(result)).not.toContain(CREDS.apiToken);
  });

  it("truncates a summary over Jira's 255-character limit", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, CREATE_ISSUE_201));
    await createIssue(CREDS, { ...INPUT, summary: "x".repeat(400) });
    expect(callAt(0).body.fields.summary).toHaveLength(255);
  });

  it("addComment POSTs an ADF body to /rest/api/3/issue/{key}/comment", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, COMMENT_201));
    const body = adfDoc(textToAdfBlocks("Unpatched: Accepted."));
    expect(await addComment(CREDS, "ED-24", body)).toEqual({ ok: true, data: null });
    expect(callAt(0).url).toBe("https://acme.atlassian.net/rest/api/3/issue/ED-24/comment");
    expect(callAt(0).body).toEqual({ body });
  });
});

describe("moveIssueToCategory", () => {
  it("is a no-op when the issue is already in the target category (stops the inbound->outbound echo)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, issueWithStatus("done", "Done")));
    expect(await moveIssueToCategory(CREDS, "ED-24", "done")).toEqual({ ok: true, data: { moved: false, statusName: "Done" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callAt(0).url).toBe("https://acme.atlassian.net/rest/api/3/issue/ED-24?fields=status");
  });

  it("picks the transition whose target status is in the done CATEGORY (not by name) and POSTs {transition:{id}}", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, issueWithStatus("indeterminate", "In Progress")))
      .mockResolvedValueOnce(jsonResponse(200, TRANSITIONS_200))
      .mockResolvedValueOnce(jsonResponse(204));
    expect(await moveIssueToCategory(CREDS, "ED-24", "done")).toEqual({ ok: true, data: { moved: true, statusName: "Done" } });
    expect(callAt(1).url).toBe("https://acme.atlassian.net/rest/api/3/issue/ED-24/transitions");
    expect(callAt(2)).toMatchObject({ url: "https://acme.atlassian.net/rest/api/3/issue/ED-24/transitions", body: { transition: { id: "31" } } });
  });

  it("reports moved:false (not an error) when the workflow offers no transition into Done", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, issueWithStatus("new", "To Do"))).mockResolvedValueOnce(jsonResponse(200, { transitions: [TRANSITIONS_200.transitions[0]] }));
    expect(await moveIssueToCategory(CREDS, "ED-24", "done")).toEqual({ ok: true, data: { moved: false, statusName: null } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a 409 on the transition as retryable", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, issueWithStatus("new", "To Do")))
      .mockResolvedValueOnce(jsonResponse(200, TRANSITIONS_200))
      .mockResolvedValueOnce(jsonResponse(409, { errorMessages: ["The issue is being edited."], errors: {} }));
    expect(await moveIssueToCategory(CREDS, "ED-24", "done")).toMatchObject({ ok: false, permanent: false, status: 409 });
  });
});

describe("ADF + mappings", () => {
  it("turns ``` fences into codeBlocks, blank-line chunks into paragraphs, and never emits an empty text node", () => {
    const blocks = textToAdfBlocks("Intro line\n\n\n```http\nGET /x HTTP/1.1\nHost: a\n```\n\nAfter");
    expect(blocks).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Intro line" }] },
      { type: "codeBlock", content: [{ type: "text", text: "GET /x HTTP/1.1\nHost: a" }] },
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ]);
    expect(JSON.stringify(blocks)).not.toContain('"text":""');
    expect(adfDoc([])).toEqual({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "(no content)" }] }] });
  });

  it("truncates bodies past Jira's 32,767-char field limit", () => {
    const text = JSON.stringify(textToAdfBlocks("a".repeat(40_000)));
    expect(text.length).toBeLessThan(32_767);
    expect(text).toContain("truncated");
  });

  it("maps severity to the default priority names and only final report statuses to Done", () => {
    expect(jiraPriorityForSeverity("critical")).toBe("Highest");
    expect(jiraPriorityForSeverity("none")).toBe("Lowest");
    expect(jiraPriorityForSeverity(null)).toBeNull();
    for (const status of ["resolved", "duplicate", "informative", "not_applicable", "rejected"] as const) expect(jiraCategoryForReportStatus(status)).toBe("done");
    for (const status of ["new", "triaging", "needs_information", "accepted"] as const) expect(jiraCategoryForReportStatus(status)).toBeNull();
  });
});
