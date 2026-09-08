import { beforeEach, describe, expect, it, vi } from "vitest";

// services/reports.ts's data-access boundary is lib/db/pool.ts's withActorTransaction/
// callRpc -- mocked here at that boundary, same "mock the thin data-access layer,
// exercise the service's own logic for real" pattern used across the native-Postgres
// migration's test suite. A fake PoolClient's `.query` is a controllable mock so each
// test scripts exactly the rows a real query would have returned.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null }) }));

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

const MESSAGE_ROW = {
  id: "msg-1",
  report_id: "report-1",
  author_id: "actor-1",
  author_context: "researcher",
  visibility: "researcher_visible",
  body: "Here is the repro video.",
  created_at: "2026-08-27T00:00:00Z",
};

const EVIDENCE_ROW = {
  id: "ev-1",
  report_id: "report-1",
  author_id: "actor-1",
  author_context: "researcher",
  visibility: "researcher_visible",
  evidence_type: "log",
  content: "GET /admin HTTP/1.1\n200 OK",
  object_key: null,
  original_filename: null,
  content_type: null,
  size_bytes: null,
  sha256: null,
  created_at: "2026-08-27T00:00:00Z",
};

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("reports service: communication/evidence mutations call their own hardcoded RPC with the exact expected argument shape", () => {
  const cases: { label: string; call: (mod: typeof import("../../services/reports")) => Promise<unknown>; rpcName: string; args: unknown[]; row: unknown }[] = [
    { label: "postResearcherMessage", call: (m) => m.postResearcherMessage("report-1", "Here is the repro video."), rpcName: "public.post_researcher_message", args: ["report-1", "Here is the repro video."], row: MESSAGE_ROW },
    {
      label: "postOrganizationMessage",
      call: (m) => m.postOrganizationMessage("report-1", "Please attach a PoC.", "internal"),
      rpcName: "public.post_organization_message",
      args: ["report-1", "Please attach a PoC.", "internal"],
      row: { ...MESSAGE_ROW, author_context: "organization", visibility: "internal" },
    },
    { label: "addResearcherEvidence", call: (m) => m.addResearcherEvidence("report-1", "log", "GET /admin HTTP/1.1\n200 OK"), rpcName: "public.add_researcher_evidence", args: ["report-1", "log", "GET /admin HTTP/1.1\n200 OK"], row: EVIDENCE_ROW },
    {
      label: "addOrganizationEvidence",
      call: (m) => m.addOrganizationEvidence("report-1", "text", "Possible duplicate of report X.", "internal"),
      rpcName: "public.add_organization_evidence",
      args: ["report-1", "text", "Possible duplicate of report X.", "internal"],
      row: { ...EVIDENCE_ROW, author_context: "organization", visibility: "internal", evidence_type: "text" },
    },
  ];

  for (const { label, call, rpcName, args, row } of cases) {
    it(`${label} calls "${rpcName}" with exactly ${JSON.stringify(args)}`, async () => {
      let captured: unknown[] | undefined;
      fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes(rpcName)) {
          captured = params;
          return queryReturning([row]);
        }
        return queryReturning([]);
      });
      const mod = await import("../../services/reports");

      await call(mod);

      expect(captured).toEqual(args);
    });
  }

  it("postResearcherMessage never sends a visibility or author_context argument -- those are hardcoded server-side", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("public.post_researcher_message")) {
        captured = params;
        return queryReturning([MESSAGE_ROW]);
      }
      return queryReturning([]);
    });
    const { postResearcherMessage } = await import("../../services/reports");

    await postResearcherMessage("report-1", "hello");

    // Only report_id and body -- exactly two positional args, no visibility/author_context.
    expect(captured).toEqual(["report-1", "hello"]);
  });
});

describe("reports service: communication/evidence read mapping", () => {
  it("listReportMessages maps a joined author name into authorName, and never leaks a raw column name", async () => {
    const row = { ...MESSAGE_ROW, author_display_name: "Jane Researcher" };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { listReportMessages } = await import("../../services/reports");

    const [message] = await listReportMessages("report-1");
    expect(message).toEqual({
      id: "msg-1",
      reportId: "report-1",
      authorId: "actor-1",
      authorName: "Jane Researcher",
      authorContext: "researcher",
      visibility: "researcher_visible",
      body: "Here is the repro video.",
      createdAt: "2026-08-27T00:00:00Z",
    });
  });

  it("listReportMessages falls back to 'Unknown' rather than rendering null when the author join is missing", async () => {
    const row = { ...MESSAGE_ROW, author_display_name: null };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { listReportMessages } = await import("../../services/reports");

    const [message] = await listReportMessages("report-1");
    expect(message.authorName).toBe("Unknown");
  });

  it("listReportEvidence maps evidence_type and content verbatim, preserving whitespace", async () => {
    const row = { ...EVIDENCE_ROW, author_display_name: "Jane Researcher" };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { listReportEvidence } = await import("../../services/reports");

    const [evidence] = await listReportEvidence("report-1");
    expect(evidence.evidenceType).toBe("log");
    expect(evidence.content).toBe("GET /admin HTTP/1.1\n200 OK");
  });

  it("listReportMessages queries report_messages filtered by report_id, oldest first (chronological, not a reversed feed)", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportMessages } = await import("../../services/reports");

    await listReportMessages("report-1");

    expect(capturedSql).toContain("from public.report_messages");
    expect(capturedSql).toContain("m.report_id = $1");
    expect(capturedSql).toContain("order by m.created_at asc");
    expect(capturedParams).toEqual(["report-1"]);
  });
});

describe("reports service: communication/evidence error mapping", () => {
  it("maps FORBIDDEN and INVALID_MESSAGE into typed, code-discriminated errors, never a raw SQLSTATE", async () => {
    const { OrganizationServiceError } = await import("../../services/rpc-error");
    const cases = [
      { message: "FORBIDDEN: only the submitting researcher can post to this report", code: "FORBIDDEN" },
      { message: "INVALID_MESSAGE: Enter a message.", code: "INVALID_MESSAGE" },
    ];
    for (const { message, code } of cases) {
      fakeClient.query.mockImplementation(async () => {
        throw new Error(message);
      });
      const { postResearcherMessage } = await import("../../services/reports");
      const error: unknown = await postResearcherMessage("report-1", "").catch((thrown) => thrown);
      expect(error).toBeInstanceOf(OrganizationServiceError);
      expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe(code);
    }
  });
});
