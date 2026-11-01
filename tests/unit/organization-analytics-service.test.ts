import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("organization-analytics service: listResearchersForOrganization", () => {
  it("calls list_researchers_for_organization with the exact organization id, and maps every snake_case field to its camelCase equivalent", async () => {
    let capturedArgs: unknown[] | undefined;
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedArgs = params;
      return queryReturning([
        {
          researcher_id: "researcher-1",
          display_name: "Riley Researcher",
          programs: [{ programId: "prog-1", programName: "Acme Bounty", status: "active" }],
          resolved_count: 3,
          resolved_critical: 1,
          resolved_high: 1,
          resolved_medium: 1,
          resolved_low: 0,
          resolved_none: 0,
          last_submitted_at: "2026-08-01T00:00:00Z",
        },
      ]);
    });
    const { listResearchersForOrganization } = await import("../../services/organization-analytics");

    const result = await listResearchersForOrganization("org-1");

    expect(capturedSql).toContain("list_researchers_for_organization");
    expect(capturedArgs).toEqual(["org-1"]);
    expect(result).toEqual([
      {
        researcherId: "researcher-1",
        displayName: "Riley Researcher",
        programs: [{ programId: "prog-1", programName: "Acme Bounty", status: "active" }],
        resolvedCount: 3,
        resolvedCritical: 1,
        resolvedHigh: 1,
        resolvedMedium: 1,
        resolvedLow: 0,
        resolvedNone: 0,
        lastSubmittedAt: "2026-08-01T00:00:00Z",
      },
    ]);
  });

  it("maps a null last_submitted_at through as null, never coercing it to a fabricated date", async () => {
    fakeClient.query.mockImplementation(async () =>
      queryReturning([
        {
          researcher_id: "researcher-2",
          display_name: "Never Submitted",
          programs: [{ programId: "prog-1", programName: "Acme Bounty", status: "active" }],
          resolved_count: 0,
          resolved_critical: 0,
          resolved_high: 0,
          resolved_medium: 0,
          resolved_low: 0,
          resolved_none: 0,
          last_submitted_at: null,
        },
      ]),
    );
    const { listResearchersForOrganization } = await import("../../services/organization-analytics");

    const result = await listResearchersForOrganization("org-1");
    expect(result[0].lastSubmittedAt).toBeNull();
  });

  it("preserves multiple (program, status) relationships for a single researcher verbatim, never collapsing them", async () => {
    fakeClient.query.mockImplementation(async () =>
      queryReturning([
        {
          researcher_id: "researcher-3",
          display_name: "Multi Program",
          programs: [
            { programId: "prog-1", programName: "Acme Bounty", status: "active" },
            { programId: "prog-2", programName: "Acme Mobile", status: "revoked" },
          ],
          resolved_count: 0,
          resolved_critical: 0,
          resolved_high: 0,
          resolved_medium: 0,
          resolved_low: 0,
          resolved_none: 0,
          last_submitted_at: null,
        },
      ]),
    );
    const { listResearchersForOrganization } = await import("../../services/organization-analytics");

    const result = await listResearchersForOrganization("org-1");
    expect(result[0].programs).toHaveLength(2);
    expect(result[0].programs[0].status).toBe("active");
    expect(result[0].programs[1].status).toBe("revoked");
  });
});
