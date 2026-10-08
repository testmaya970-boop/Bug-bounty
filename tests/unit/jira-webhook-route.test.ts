import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { decideInboundAction, verifyJiraSignature, type JiraIssueUpdated } from "@/lib/jira-webhook";

// The route's data-access boundary (lib/db/pool) is mocked: service-role calls are answered
// by `serviceRpc`, and withActorTransaction records which actor ran which RPC -- so these
// tests assert the route goes through the REAL authorized-actor path (resolve_report as
// the connection's created_by) rather than a service-role write.
const ORG = "d99de194-87e0-46d2-937f-eff8d363161b";
const SECRET = "6e88deb358ef20a39f346d8c6e78a76fe29a9dc08881c7e1c298d9029c977c51";
const CREATED_BY = "55c59107-450d-464f-a62c-6502e52c4671";
const REPORT_ID = "0b0e7c39-1f5a-4b1e-9a8e-4a0f6c3b9d21";

const state = {
  rateLimitOk: true,
  credentials: [{ webhook_secret: SECRET, created_by: CREATED_BY, actor_active: true }] as unknown[],
  report: [{ report_id: REPORT_ID, status: "accepted" }] as unknown[],
  actorCalls: [] as { actorId: string | null; fn: string; args: unknown[] }[],
  actorError: null as Error | null,
};

vi.mock("@/lib/error-tracking", () => ({ recordError: vi.fn() }));
vi.mock("@/lib/db/pool", () => {
  const serviceClient = {
    query: vi.fn(async (sql: string) => (sql.includes("check_jira_webhook_rate_limit") ? { rows: [{ ok: state.rateLimitOk }] } : { rows: [] })),
  };
  return {
    withServiceRoleTransaction: vi.fn((fn: (client: unknown) => unknown) => fn(serviceClient)),
    withActorTransaction: vi.fn((actorId: string | null, fn: (client: unknown) => unknown) => fn({ actorId })),
    callRpc: vi.fn(async (client: { actorId?: string | null }, fn: string, args: unknown[]) => {
      if ("actorId" in client) {
        state.actorCalls.push({ actorId: client.actorId ?? null, fn, args });
        if (state.actorError) throw state.actorError;
        return [];
      }
      if (fn === "public.get_jira_credentials") return state.credentials;
      if (fn === "public.find_report_by_jira_issue") return state.report;
      throw new Error(`unexpected rpc ${fn}`);
    }),
  };
});

// Shape of a real jira:issue_updated delivery (Atlassian webhooks docs: timestamp,
// webhookEvent, issue_event_type_name, user, issue, changelog.items[{field,fromString,
// toString,...}]), trimmed to what matters plus some noise the schema must ignore.
function issueUpdated(overrides: { categoryKey?: string; statusName?: string; resolution?: string | null; field?: string; event?: string } = {}) {
  return {
    timestamp: 1790000000000,
    webhookEvent: overrides.event ?? "jira:issue_updated",
    issue_event_type_name: "issue_generic",
    user: { accountId: "5b10a2844c20165700ede21g", displayName: "Mia Krystof", active: true },
    issue: {
      id: "10042",
      key: "SEC-42",
      self: "https://acme.atlassian.net/rest/api/2/10042",
      fields: {
        summary: "[Unpatched] Stored XSS",
        status: { name: overrides.statusName ?? "Done", statusCategory: { id: 3, key: overrides.categoryKey ?? "done", name: "Done" } },
        resolution: overrides.resolution === null ? null : { name: overrides.resolution ?? "Done" },
        description: { type: "doc", version: 1, content: [] },
      },
    },
    changelog: { id: "10101", items: [{ field: overrides.field ?? "status", fieldtype: "jira", from: "3", fromString: "In Progress", to: "10001", toString: "Done" }] },
  };
}

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function post(body: string, signature: string | null, org = ORG) {
  const { POST } = await import("../../app/api/webhooks/jira/[organizationId]/route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-hub-signature"] = signature;
  const request = new NextRequest(`http://localhost/api/webhooks/jira/${org}`, { method: "POST", body, headers });
  return POST(request, { params: Promise.resolve({ organizationId: org }) });
}

beforeEach(() => {
  state.rateLimitOk = true;
  state.credentials = [{ webhook_secret: SECRET, created_by: CREATED_BY, actor_active: true }];
  state.report = [{ report_id: REPORT_ID, status: "accepted" }];
  state.actorCalls = [];
  state.actorError = null;
});

describe("verifyJiraSignature", () => {
  const body = Buffer.from('{"a":1}');
  it("accepts Jira's sha256=<hex HMAC of the raw body> and rejects everything else", () => {
    expect(verifyJiraSignature(SECRET, body, sign('{"a":1}'))).toBe(true);
    expect(verifyJiraSignature(SECRET, body, sign('{"a":1}').toUpperCase().replace("SHA256=", "sha256="))).toBe(true);
    expect(verifyJiraSignature(SECRET, body, sign('{"a":2}'))).toBe(false); // body tampered
    expect(verifyJiraSignature(SECRET, body, sign('{"a":1}', "other-secret"))).toBe(false); // wrong secret
    expect(verifyJiraSignature(SECRET, body, null)).toBe(false);
    expect(verifyJiraSignature(SECRET, body, "")).toBe(false);
    expect(verifyJiraSignature(SECRET, body, "sha1=" + "0".repeat(40))).toBe(false);
    expect(verifyJiraSignature(SECRET, body, "sha256=abc")).toBe(false); // wrong length must not throw
    expect(verifyJiraSignature(SECRET, body, SECRET)).toBe(false); // the bare secret is not a signature
  });
});

describe("POST /api/webhooks/jira/[organizationId]", () => {
  it("valid signature + Done transition on a linked accepted report -> resolve_report via withActorTransaction AS created_by", async () => {
    const body = JSON.stringify(issueUpdated());
    const response = await post(body, sign(body));

    expect(response.status).toBe(204);
    expect(state.actorCalls).toEqual([
      { actorId: CREATED_BY, fn: "public.resolve_report", args: [REPORT_ID, 'Resolved in Jira: SEC-42 moved to "Done" (resolution: Done) by Mia Krystof.'] },
    ]);
  });

  it("rejects missing, wrong, and wrong-secret signatures with an identical empty 401 and touches no report", async () => {
    const body = JSON.stringify(issueUpdated());
    const responses = [await post(body, null), await post(body, sign(body, "guessed")), await post(body, sign(body + " ")), await post(body, "Bearer whatever")];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("");
    }
    expect(state.actorCalls).toEqual([]);
  });

  it("an unknown organization and a non-uuid organization are indistinguishable from a bad signature", async () => {
    const body = JSON.stringify(issueUpdated());
    state.credentials = [];
    const unknownOrg = await post(body, sign(body));
    const notUuid = await post(body, sign(body), "not-a-uuid");
    for (const response of [unknownOrg, notUuid]) {
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("");
    }
    expect(state.actorCalls).toEqual([]);
  });

  it("does not trust the URL's organization id: a signature made with another org's secret fails", async () => {
    const body = JSON.stringify(issueUpdated());
    const response = await post(body, sign(body, "secret-of-a-different-organization"));
    expect(response.status).toBe(401);
  });

  it("rate limits per organization before any verification work (429, which Jira retries)", async () => {
    state.rateLimitOk = false;
    const body = JSON.stringify(issueUpdated());
    expect((await post(body, sign(body))).status).toBe(429);
    expect(state.actorCalls).toEqual([]);
  });

  it("rejects an oversize body with 413 before reading it fully", async () => {
    const body = JSON.stringify({ pad: "x".repeat(1024 * 1024 + 10) });
    expect((await post(body, sign(body))).status).toBe(413);
  });

  it.each([
    ["a non-status change", { field: "assignee" }],
    ["a move to In Progress", { categoryKey: "indeterminate", statusName: "In Progress" }],
    ["a Won't Do resolution", { resolution: "Won't Do" }],
    ["a Duplicate resolution", { resolution: "Duplicate" }],
    ["another event type", { event: "jira:issue_created" }],
  ])("verified but %s -> 204, no report change", async (_label, overrides) => {
    const body = JSON.stringify(issueUpdated(overrides));
    expect((await post(body, sign(body))).status).toBe(204);
    expect(state.actorCalls).toEqual([]);
  });

  it("verified but the issue isn't linked to any report -> 204", async () => {
    state.report = [];
    const body = JSON.stringify(issueUpdated());
    expect((await post(body, sign(body))).status).toBe(204);
    expect(state.actorCalls).toEqual([]);
  });

  it("refuses to act as a deactivated/suspended configuring user", async () => {
    state.credentials = [{ webhook_secret: SECRET, created_by: CREATED_BY, actor_active: false }];
    const body = JSON.stringify(issueUpdated());
    expect((await post(body, sign(body))).status).toBe(204);
    expect(state.actorCalls).toEqual([]);
  });

  it("acknowledges (204) when the real RPC refuses -- e.g. the configuring user lost triage access", async () => {
    state.actorError = new Error("FORBIDDEN: actor cannot triage this report");
    const body = JSON.stringify(issueUpdated());
    expect((await post(body, sign(body))).status).toBe(204);
    expect(state.actorCalls).toHaveLength(1);
  });

  it("returns 500 (Jira retries) on an unexpected database failure during the resolve", async () => {
    state.actorError = new Error("connection terminated unexpectedly");
    const body = JSON.stringify(issueUpdated());
    expect((await post(body, sign(body))).status).toBe(500);
  });
});

describe("decideInboundAction", () => {
  const base = issueUpdated() as unknown as JiraIssueUpdated;
  it("only resolves an accepted report", () => {
    expect(decideInboundAction(base, "accepted").action).toBe("resolve");
    for (const status of ["new", "triaging", "needs_information", "resolved", "duplicate", "rejected"] as const) {
      expect(decideInboundAction(base, status).action).toBe("ignore");
    }
  });
  it("treats a missing resolution as a fix", () => {
    expect(decideInboundAction(issueUpdated({ resolution: null }) as unknown as JiraIssueUpdated, "accepted")).toEqual({
      action: "resolve",
      summary: 'Resolved in Jira: SEC-42 moved to "Done" by Mia Krystof.',
    });
  });
});
