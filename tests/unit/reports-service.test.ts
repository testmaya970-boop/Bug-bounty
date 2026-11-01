import { beforeEach, describe, expect, it, vi } from "vitest";

/** A full submitReport input; tests override only what they check. */
function submitInput(overrides: Record<string, unknown> = {}) {
  return {
    programId: "prog-1",
    assetType: "domain" as const,
    targetInput: "foo.example.com",
    title: "t",
    description: "d",
    weaknessType: "other" as const,
    impact: "impact",
    acknowledgedPolicyVersion: null,
    scopeEntryId: "entry-1",
    cvss: null,
    draftId: null,
    uploadIds: [] as string[],
    submissionKey: "key-1",
    ...overrides,
  };
}


// services/reports.ts's data-access boundary is lib/db/pool.ts's withActorTransaction/
// callRpc -- mocked here at that boundary, same "mock the thin data-access layer,
// exercise the service's own logic for real" pattern used across the native-Postgres
// migration's test suite. A fake PoolClient's `.query` is a controllable mock so each
// test scripts exactly the rows a real query would have returned. This file covers only
// the actor-session-backed functions (submitReport, getReport, listMyReports,
// listReportsForProgram, listOpenReportsForOrganization, countMyReportsNeedingResponse) --
// none of it touches the bearer-token "for actor" functions, which use
// withServiceRoleTransaction instead and are exercised elsewhere.
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

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("reports service: submitReport", () => {
  it("sends the raw target_input verbatim -- canonicalization/matching are the database's job, never duplicated here", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("public.submit_report")) {
        captured = params;
        return queryReturning([
          {
            id: "report-1",
            program_id: "prog-1",
            organization_id: "org-1",
            researcher_id: "actor-1",
            title: "XSS on foo",
            description: "Steps...",
            asset_type: "domain",
            target: "foo.example.com",
            display_target: "foo.example.com",
            matched_scope_entry_id: "entry-1",
            matched_scope_state: "in_scope",
            matched_target: "*.example.com",
            status: "new",
            confirmed_severity: null,
            duplicate_of_report_id: null,
            resolution_summary: null,
            weakness_type: "cross_site_scripting",
            impact: "Session hijacking.",
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
          },
        ]);
      }
      return queryReturning([]);
    });
    const { submitReport } = await import("../../services/reports");

    const result = await submitReport(
      submitInput({ targetInput: "FOO.example.com", title: "XSS on foo", description: "Steps...", weaknessType: "cross_site_scripting", impact: "Session hijacking.", cvss: { version: "4.0", vector: "CVSS:4.0/AV:N", score: 9.3 }, draftId: "draft-1", uploadIds: ["up-1"] }),
    );

    // Positional order matters (a swapped argument once broke a whole feature silently).
    expect(captured).toEqual(["prog-1", "domain", "FOO.example.com", "XSS on foo", "Steps...", "cross_site_scripting", "Session hijacking.", null, "entry-1", "4.0", "CVSS:4.0/AV:N", 9.3, "draft-1", ["up-1"], "key-1"]);
    expect(result).toMatchObject({ id: "report-1", target: "foo.example.com", matchedScopeState: "in_scope", status: "new" });
  });

  it("maps FORBIDDEN, SUBMISSIONS_CLOSED, TARGET_NOT_ELIGIBLE, INVALID_TITLE, and INVALID_DESCRIPTION into typed, code-discriminated errors", async () => {
    const { OrganizationServiceError } = await import("../../services/rpc-error");
    const cases = [
      { message: "FORBIDDEN: actor is not an authorized researcher for this program", code: "FORBIDDEN" },
      { message: "SUBMISSIONS_CLOSED: this program is not currently accepting reports", code: "SUBMISSIONS_CLOSED" },
      { message: "TARGET_NOT_ELIGIBLE: This target is not currently eligible for this program.", code: "TARGET_NOT_ELIGIBLE" },
      { message: "INVALID_TITLE: Enter a report title.", code: "INVALID_TITLE" },
      { message: "INVALID_DESCRIPTION: Enter a description.", code: "INVALID_DESCRIPTION" },
    ];
    for (const { message, code } of cases) {
      fakeClient.query.mockImplementation(async () => {
        throw new Error(message);
      });
      const { submitReport } = await import("../../services/reports");
      const error: unknown = await submitReport(submitInput()).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(OrganizationServiceError);
      expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe(code);
    }
  });

  it("does not leak a raw database error for an unrecognized failure", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error('new row for relation "reports" violates check constraint "reports_title_check"');
    });
    const { submitReport } = await import("../../services/reports");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await submitReport(submitInput()).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect((error as Error).message).not.toContain("constraint");
  });
});

describe("reports service: cross-program access", () => {
  it("a researcher submitting against program A surfaces FORBIDDEN when unauthorized, and A's id reaches the RPC unmodified", async () => {
    let capturedProgramId: unknown;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("public.submit_report")) {
        capturedProgramId = params[0];
        throw new Error("FORBIDDEN: actor is not an authorized researcher for this program");
      }
      return queryReturning([]);
    });
    const { submitReport, OrganizationServiceError } = await import("../../services/reports");

    const error: unknown = await submitReport(submitInput({ programId: "prog-A" })).catch((thrown) => thrown);

    expect(capturedProgramId).toBe("prog-A");
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });
});

describe("reports service: reads", () => {
  it("maps a joined report row (researcher name join) into the flat Report shape", async () => {
    const row = {
      id: "report-1",
      program_id: "prog-1",
      organization_id: "org-1",
      researcher_id: "actor-1",
      title: "IDOR",
      description: "Body",
      asset_type: "url",
      target: "https://api.example.com/admin",
      display_target: "https://api.example.com/admin",
      matched_scope_entry_id: "entry-1",
      matched_scope_state: "in_scope",
      matched_target: "https://api.example.com/admin",
      status: "new",
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
      researcher_display_name: "Researcher One",
    };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { getReport } = await import("../../services/reports");

    const report = await getReport("report-1");
    expect(report).toMatchObject({ id: "report-1", researcherName: "Researcher One", status: "new", matchedScopeState: "in_scope" });
  });

  it("returns null from getReport when RLS filters the row out (not found and not authorized look identical)", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getReport } = await import("../../services/reports");

    expect(await getReport("report-404")).toBeNull();
  });

  it("maps listMyReports' RPC row shape (including joined program/organization names) into camelCase records with a usable organizationId, calling the paginated RPC with default page params", async () => {
    const row = { id: "report-1", program_id: "prog-1", organization_id: "org-1", program_name: "Acme Bounty", organization_name: "Acme Security", title: "IDOR", display_target: "https://api.example.com/admin", status: "new", confirmed_severity: null, submitted_at: "2026-08-27T00:00:00Z" };
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("public.list_my_reports")) {
        captured = params;
        return queryReturning([row]);
      }
      return queryReturning([]);
    });
    const { listMyReports } = await import("../../services/reports");

    const { items, nextCursor } = await listMyReports("actor-1");
    expect(captured).toEqual([20, null, null, null, null, null]); // limit, cursor (2), status, program, severity
    expect(items[0]).toEqual({ id: "report-1", programId: "prog-1", organizationId: "org-1", programName: "Acme Bounty", organizationName: "Acme Security", title: "IDOR", displayTarget: "https://api.example.com/admin", status: "new", confirmedSeverity: null, submittedAt: "2026-08-27T00:00:00Z" });
    // Fewer rows than the page size -> no next page.
    expect(nextCursor).toBeNull();
  });

  it("maps a non-null confirmed_severity through to confirmedSeverity", async () => {
    const row = { id: "report-1", program_id: "prog-1", organization_id: "org-1", program_name: "Acme Bounty", organization_name: "Acme Security", title: "IDOR", display_target: "https://api.example.com/admin", status: "triaging", confirmed_severity: "high", submitted_at: "2026-08-27T00:00:00Z" };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { listMyReports } = await import("../../services/reports");

    const { items } = await listMyReports("actor-1");
    expect(items[0].confirmedSeverity).toBe("high");
  });

  it("returns a nextCursor when a full page comes back, decodable to the last row's (submitted_at, id)", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
      program_id: "prog-1",
      organization_id: "org-1",
      program_name: "Acme Bounty",
      organization_name: "Acme Security",
      title: `Report ${i}`,
      display_target: "https://api.example.com/admin",
      status: "new",
      submitted_at: `2026-08-27T00:00:${String(20 - i).padStart(2, "0")}Z`,
    }));
    fakeClient.query.mockImplementation(async () => queryReturning(rows));
    const { listMyReports } = await import("../../services/reports");
    const { decodeCursor } = await import("../../lib/pagination");

    const { nextCursor } = await listMyReports("actor-1");
    expect(nextCursor).not.toBeNull();
    expect(decodeCursor(nextCursor!)).toEqual({ sortValue: "2026-08-27T00:00:01Z", id: "00000000-0000-4000-8000-000000000019" });
  });

  it("decodes a supplied cursor into positional (limit, before_submitted_at, before_id) args on the next call", async () => {
    const { encodeCursor } = await import("../../lib/pagination");
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("public.list_my_reports")) captured = params;
      return queryReturning([]);
    });
    const { listMyReports } = await import("../../services/reports");

    await listMyReports("actor-1", encodeCursor("2026-08-27T00:00:01Z", "00000000-0000-4000-8000-000000000019"), 10);

    expect(captured).toEqual([10, "2026-08-27T00:00:01Z", "00000000-0000-4000-8000-000000000019", null, null, null]);
  });
});

describe("reports service: listReportsForProgram -- server-side filters, never fetched-then-filtered in React", () => {
  it("applies only the program_id predicate when no filter is given", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportsForProgram } = await import("../../services/reports");

    await listReportsForProgram("prog-1");

    expect(capturedSql).toContain("r.program_id = $1");
    expect(capturedSql).not.toContain("r.status = ");
    expect(capturedSql).not.toContain("r.confirmed_severity = ");
    expect(capturedParams).toEqual(["prog-1", 20]);
  });

  it.each([
    ["me", "r.assignee_id = $2", "actor"],
    ["11111111-1111-4111-8111-111111111111", "r.assignee_id = $2", "11111111-1111-4111-8111-111111111111"],
  ])("binds an assignee filter (%s) as a real numbered parameter", async (assignee, predicate, bound) => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportsForProgram } = await import("../../services/reports");
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    const actorId = (await getCurrentUser())?.id;

    await listReportsForProgram("prog-1", undefined, undefined, { assignee });

    expect(capturedSql).toContain(predicate);
    expect(capturedParams).toEqual(["prog-1", bound === "actor" ? actorId : bound, 20]);
  });

  it("filters unassigned reports without a parameter", async () => {
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([]);
    });
    const { listReportsForProgram } = await import("../../services/reports");

    await listReportsForProgram("prog-1", undefined, undefined, { assignee: "unassigned" });

    expect(capturedSql).toContain("r.assignee_id is null");
  });

  it("applies a real status predicate when a status filter is given", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportsForProgram } = await import("../../services/reports");

    await listReportsForProgram("prog-1", undefined, undefined, { status: "resolved" });

    expect(capturedSql).toContain("r.status = $2");
    expect(capturedParams).toEqual(["prog-1", "resolved", 20]);
  });

  it("applies a real confirmed_severity predicate when a severity filter is given", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportsForProgram } = await import("../../services/reports");

    await listReportsForProgram("prog-1", undefined, undefined, { severity: "critical" });

    expect(capturedSql).toContain("r.confirmed_severity = $2");
    expect(capturedParams).toEqual(["prog-1", "critical", 20]);
  });

  it("applies both filters together when both are given", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportsForProgram } = await import("../../services/reports");

    await listReportsForProgram("prog-1", undefined, undefined, { status: "new", severity: "high" });

    expect(capturedSql).toContain("r.status = $2");
    expect(capturedSql).toContain("r.confirmed_severity = $3");
    expect(capturedParams).toEqual(["prog-1", "new", "high", 20]);
  });

  it("decodes a supplied cursor into a real r.submitted_at < ... predicate", async () => {
    const { encodeCursor } = await import("../../lib/pagination");
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportsForProgram } = await import("../../services/reports");

    await listReportsForProgram("prog-1", encodeCursor("2026-08-27T00:00:00Z", "00000000-0000-4000-8000-000000000001"));

    expect(capturedSql).toContain("r.submitted_at < $2");
    expect(capturedParams).toEqual(["prog-1", "2026-08-27T00:00:00Z", 20]);
  });

  it("returns nextCursor null when fewer rows than the page size come back", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { listReportsForProgram } = await import("../../services/reports");

    const { nextCursor } = await listReportsForProgram("prog-1");
    expect(nextCursor).toBeNull();
  });
});

describe("reports service: listOpenReportsForOrganization -- one query, RLS narrows it per viewer", () => {
  it("filters by organization_id and only non-terminal statuses, newest-updated first", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listOpenReportsForOrganization } = await import("../../services/reports");

    await listOpenReportsForOrganization("org-1");

    expect(capturedSql).toContain("r.organization_id = $1");
    expect(capturedSql).toContain("r.status = any($2)");
    expect(capturedSql).toContain("order by r.updated_at desc");
    expect(capturedParams[0]).toBe("org-1");
    expect(capturedParams[1]).toEqual(["new", "triaging", "needs_information", "accepted"]);
  });

  it("returns the mapped reports, never a raw row shape", async () => {
    fakeClient.query.mockImplementation(async () =>
      queryReturning([
        {
          id: "report-1",
          program_id: "prog-1",
          organization_id: "org-1",
          researcher_id: "researcher-1",
          title: "IDOR on export",
          description: "desc",
          asset_type: "domain",
          target: "example.com",
          display_target: "example.com",
          matched_scope_entry_id: null,
          matched_scope_state: "in_scope",
          matched_target: "example.com",
          status: "new",
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
          researcher_display_name: null,
        },
      ]),
    );
    const { listOpenReportsForOrganization } = await import("../../services/reports");

    const reports = await listOpenReportsForOrganization("org-1");

    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe("report-1");
    expect(reports[0].programId).toBe("prog-1");
  });
});

describe("reports service: countMyReportsNeedingResponse -- an exact count, never a partial page's .length", () => {
  it("scopes the count to the caller's own reports with status = needs_information", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([{ count: "3" }]);
    });
    const { countMyReportsNeedingResponse } = await import("../../services/reports");

    const count = await countMyReportsNeedingResponse("actor-1");

    expect(count).toBe(3);
    expect(capturedSql).toContain("researcher_id = $1");
    expect(capturedSql).toContain("status = 'needs_information'");
    expect(capturedParams).toEqual(["actor-1"]);
  });
});
