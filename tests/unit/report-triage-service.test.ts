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

const REPORT_ROW = {
  id: "report-1",
  program_id: "prog-1",
  organization_id: "org-1",
  researcher_id: "researcher-1",
  title: "IDOR",
  description: "Body",
  asset_type: "url",
  target: "https://api.example.com/admin",
  display_target: "https://api.example.com/admin",
  matched_scope_entry_id: "entry-1",
  matched_scope_state: "in_scope",
  matched_target: "https://api.example.com/admin",
  status: "triaging",
  confirmed_severity: null,
  duplicate_of_report_id: null,
  resolution_summary: null,
  weakness_type: null,
  impact: null,
  researcher_severity: null,
  cvss_attack_vector: null,
  cvss_attack_complexity: null,
  cvss_privileges_required: null,
  cvss_user_interaction: null,
  cvss_scope: null,
  cvss_confidentiality_impact: null,
  cvss_integrity_impact: null,
  cvss_availability_impact: null,
  cvss_base_score: null,
  submitted_at: "2026-08-27T00:00:00Z",
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
};

beforeEach(() => {
  fakeClient.query.mockReset();
});

// Each triage mutation goes through the same shared callTriageRpc(functionName, args)
// helper in the new native-Postgres code, but each exported function still hardcodes its
// own RPC name and argument order (see docs/decisions/0009). These tests prove each one
// sends exactly the RPC name and positional argument array its migration function
// expects.
describe("reports service: triage mutations call their own hardcoded RPC with the exact expected argument shape", () => {
  const cases: { label: string; call: (mod: typeof import("../../services/reports")) => Promise<unknown>; rpcName: string; args: unknown[] }[] = [
    { label: "startTriage", call: (m) => m.startTriage("report-1"), rpcName: "public.start_triage", args: ["report-1"] },
    { label: "requestInformation", call: (m) => m.requestInformation("report-1", "Need a repro video"), rpcName: "public.request_information", args: ["report-1", "Need a repro video"] },
    { label: "acceptReport", call: (m) => m.acceptReport("report-1"), rpcName: "public.accept_report", args: ["report-1"] },
    { label: "markDuplicate", call: (m) => m.markDuplicate("report-1", "report-original"), rpcName: "public.mark_duplicate", args: ["report-1", "report-original"] },
    { label: "markInformative", call: (m) => m.markInformative("report-1"), rpcName: "public.mark_informative", args: ["report-1"] },
    { label: "markNotApplicable", call: (m) => m.markNotApplicable("report-1"), rpcName: "public.mark_not_applicable", args: ["report-1"] },
    { label: "rejectReport", call: (m) => m.rejectReport("report-1"), rpcName: "public.reject_report", args: ["report-1"] },
    { label: "resolveReport", call: (m) => m.resolveReport("report-1", "Patched in v1.2.3"), rpcName: "public.resolve_report", args: ["report-1", "Patched in v1.2.3"] },
    {
      label: "setReportSeverity",
      call: (m) => m.setReportSeverity("report-1", "high"),
      rpcName: "public.set_report_severity",
      args: ["report-1", "high", null, null, null, null, null, null, null, null],
    },
  ];

  for (const { label, call, rpcName, args } of cases) {
    it(`${label} calls "${rpcName}" with exactly ${JSON.stringify(args)}`, async () => {
      let captured: unknown[] | undefined;
      fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes(rpcName)) {
          captured = params;
          return queryReturning([REPORT_ROW]);
        }
        return queryReturning([]);
      });
      const mod = await import("../../services/reports");

      const result = await call(mod);

      expect(captured).toEqual(args);
      expect(result).toMatchObject({ id: "report-1", status: "triaging" });
    });
  }
});

describe("reports service: triage mutation error mapping", () => {
  it("maps INVALID_TRANSITION, FORBIDDEN, and INVALID_DUPLICATE_TARGET into typed, code-discriminated errors, never a raw SQLSTATE", async () => {
    const { OrganizationServiceError } = await import("../../services/rpc-error");
    const cases = [
      { message: "INVALID_TRANSITION: this report cannot be accepted from its current state", code: "INVALID_TRANSITION" },
      { message: "FORBIDDEN: actor cannot triage this report", code: "FORBIDDEN" },
      { message: "INVALID_DUPLICATE_TARGET: That report is not eligible to be marked as the original.", code: "INVALID_DUPLICATE_TARGET" },
    ];
    for (const { message, code } of cases) {
      fakeClient.query.mockImplementation(async () => {
        throw new Error(message);
      });
      const { acceptReport } = await import("../../services/reports");
      const error: unknown = await acceptReport("report-1").catch((thrown) => thrown);
      expect(error).toBeInstanceOf(OrganizationServiceError);
      expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe(code);
    }
  });

  it("does not leak a raw check-constraint error for an unrecognized failure", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error('new row for relation "reports" violates check constraint "reports_duplicate_not_self_check"');
    });
    const { markDuplicate, OrganizationServiceError } = await import("../../services/reports");

    const error: unknown = await markDuplicate("report-1", "report-1").catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect((error as Error).message).not.toContain("constraint");
  });
});

describe("reports service: getReportAuditActivity", () => {
  it("queries audit_logs filtered to entity_type=report and this report's id, newest first", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { getReportAuditActivity } = await import("../../services/reports");

    await getReportAuditActivity("report-1");

    expect(capturedSql).toContain("from public.audit_logs");
    expect(capturedSql).toContain("entity_type = 'report'");
    expect(capturedSql).toContain("entity_id = $1");
    expect(capturedSql).toContain("order by created_at desc");
    expect(capturedParams).toEqual(["report-1"]);
  });

  it("maps audit rows into camelCase records", async () => {
    const row = { id: "event-1", actor_id: "manager-1", action: "report.accepted", entity_type: "report", entity_id: "report-1", metadata: { previous_status: "triaging" }, created_at: "2026-08-27T00:00:00Z" };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { getReportAuditActivity } = await import("../../services/reports");

    const [event] = await getReportAuditActivity("report-1");
    expect(event).toEqual({ id: "event-1", actorId: "manager-1", action: "report.accepted", entityType: "report", entityId: "report-1", metadata: { previous_status: "triaging" }, createdAt: "2026-08-27T00:00:00Z" });
  });
});
