import { beforeEach, describe, expect, it, vi } from "vitest";

// services/scope.ts's data-access boundary is lib/db/pool.ts's withActorTransaction/
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

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("scope service: addScopeEntry", () => {
  it("sends the raw target_input verbatim -- canonicalization is the database's job, never duplicated here", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("add_scope_entry")) {
        captured = params;
        return queryReturning([
          { id: "entry-1", program_id: "prog-1", organization_id: "org-1", asset_type: "domain", target: "example.com", display_target: "example.com", scope_state: "in_scope", description: null, status: "active", created_by: "actor-1", created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z", removed_at: null },
        ]);
      }
      return queryReturning([]);
    });
    const { addScopeEntry } = await import("../../services/scope");

    const result = await addScopeEntry("prog-1", "domain", "EXAMPLE.COM.", "in_scope", "prod");

    expect(captured).toEqual(["prog-1", "domain", "EXAMPLE.COM.", "in_scope", "prod"]);
    expect(result).toMatchObject({ id: "entry-1", target: "example.com", assetType: "domain" });
  });

  it("maps INVALID_TARGET, DUPLICATE_TARGET, SCOPE_LOCKED, and FORBIDDEN into typed, code-discriminated errors", async () => {
    const { OrganizationServiceError } = await import("../../services/rpc-error");
    const cases = [
      { message: "INVALID_TARGET: Enter a valid hostname.", code: "INVALID_TARGET" },
      { message: "DUPLICATE_TARGET: This target is already in scope for this program.", code: "DUPLICATE_TARGET" },
      { message: "SCOPE_LOCKED: scope can only be changed while the program is in draft", code: "SCOPE_LOCKED" },
      { message: "FORBIDDEN: actor cannot manage scope for this program", code: "FORBIDDEN" },
    ];
    for (const { message, code } of cases) {
      fakeClient.query.mockImplementation(async () => {
        throw new Error(message);
      });
      const { addScopeEntry } = await import("../../services/scope");
      const error: unknown = await addScopeEntry("prog-1", "domain", "example.com", "in_scope").catch((thrown) => thrown);
      expect(error).toBeInstanceOf(OrganizationServiceError);
      expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe(code);
    }
  });

  it("does not leak a raw database error for an unrecognized failure", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error('duplicate key value violates unique constraint "program_scope_entries_unique_active_target"');
    });
    const { addScopeEntry } = await import("../../services/scope");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await addScopeEntry("prog-1", "domain", "example.com", "in_scope").catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect((error as Error).message).not.toContain("constraint");
  });
});

describe("scope service: updateScopeEntry / removeScopeEntry", () => {
  it("update sends only entry_id, scope_state, and description -- never a target/asset_type change", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("update_scope_entry")) {
        captured = params;
        return queryReturning([
          { id: "entry-1", program_id: "prog-1", organization_id: "org-1", asset_type: "domain", target: "example.com", display_target: "example.com", scope_state: "out_of_scope", description: null, status: "active", created_by: "actor-1", created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z", removed_at: null },
        ]);
      }
      return queryReturning([]);
    });
    const { updateScopeEntry } = await import("../../services/scope");

    const result = await updateScopeEntry("entry-1", "out_of_scope");

    expect(captured).toEqual(["entry-1", "out_of_scope", null]);
    expect(result.scopeState).toBe("out_of_scope");
  });

  it("remove sends only entry_id and marks it removed, not physically deleted", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("remove_scope_entry")) {
        captured = params;
        return queryReturning([
          { id: "entry-1", program_id: "prog-1", organization_id: "org-1", asset_type: "domain", target: "example.com", display_target: "example.com", scope_state: "in_scope", description: null, status: "removed", created_by: "actor-1", created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z", removed_at: "2026-08-26T01:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { removeScopeEntry } = await import("../../services/scope");

    const result = await removeScopeEntry("entry-1");

    expect(captured).toEqual(["entry-1"]);
    expect(result.status).toBe("removed");
    expect(result.removedAt).not.toBeNull();
  });
});

describe("scope service: listActiveScopeEntries", () => {
  it("filters to status=active and maps the creator join", async () => {
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([
        { id: "entry-1", program_id: "prog-1", organization_id: "org-1", asset_type: "url", target: "https://api.example.com/", display_target: "https://api.example.com/", scope_state: "in_scope", description: "prod api", status: "active", created_by: "actor-1", created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-20T00:00:00Z", removed_at: null, creator_display_name: "Alice" },
      ]);
    });
    const { listActiveScopeEntries } = await import("../../services/scope");

    const [entry] = await listActiveScopeEntries("prog-1");

    expect(capturedSql).toContain("e.status = 'active'");
    expect(entry).toMatchObject({ id: "entry-1", assetType: "url", createdByName: "Alice", description: "prod api" });
  });
});

describe("scope service: evaluateProgramScope", () => {
  it("maps the RPC's snake_case row into a camelCase result", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([{ is_in_scope: true, matched_scope_state: "in_scope", matched_entry_id: "entry-1", matched_target: "*.example.com" }]);
    });
    const { evaluateProgramScope } = await import("../../services/scope");

    const result = await evaluateProgramScope("prog-1", "domain", "foo.example.com");

    expect(captured).toEqual(["prog-1", "domain", "foo.example.com"]);
    expect(result).toEqual({ isInScope: true, matchedScopeState: "in_scope", matchedEntryId: "entry-1", matchedTarget: "*.example.com" });
  });

  it("maps a no-match result to isInScope: false with null fields", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ is_in_scope: false, matched_scope_state: null, matched_entry_id: null, matched_target: null }]));
    const { evaluateProgramScope } = await import("../../services/scope");

    const result = await evaluateProgramScope("prog-1", "domain", "unrelated.org");

    expect(result).toEqual({ isInScope: false, matchedScopeState: null, matchedEntryId: null, matchedTarget: null });
  });
});

// Phase 7, Turn 2 -- Assets & Scope. Two tests specifically requested: cross-org read
// denial and member-write denial. Real RLS enforcement (the actual cross-org boundary)
// is exercised live in tests/unit/migration-security.test.ts against the migration's own
// SQL text -- a mocked-DB-boundary unit test cannot make Postgres itself reject a query,
// so what THIS test proves is the service layer's own contribution to that boundary: the
// org-scoped query is genuinely predicated on the caller-supplied organization_id (never
// a different id, never unscoped), which is the one thing a service-layer regression
// could actually break even with RLS correctly enforced underneath.
describe("scope service: listActiveScopeEntriesForOrganization (cross-org read denial)", () => {
  it("scopes the query strictly to the given organization_id -- never a second organization's rows, and RLS narrows further underneath this", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listActiveScopeEntriesForOrganization } = await import("../../services/scope");

    await listActiveScopeEntriesForOrganization("org-mine");

    expect(capturedSql).toContain("e.organization_id = $1");
    expect(capturedSql).toContain("e.status = 'active'");
    expect(capturedParams[0]).toBe("org-mine");
  });

  it("an org this actor cannot see returns an empty page, never a thrown error -- RLS-filtered reads look identical to 'nothing here,' the same not-found-vs-not-authorized property every other read in this codebase has", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { listActiveScopeEntriesForOrganization } = await import("../../services/scope");

    const result = await listActiveScopeEntriesForOrganization("org-not-mine");

    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("applies the program/type filters as real WHERE predicates, never fetched-then-filtered in application code", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listActiveScopeEntriesForOrganization } = await import("../../services/scope");

    await listActiveScopeEntriesForOrganization("org-1", undefined, undefined, { programId: "prog-1", assetType: "url" });

    expect(capturedSql).toContain("e.program_id = $2");
    expect(capturedSql).toContain("e.asset_type = $3");
    expect(capturedParams).toEqual(["org-1", "prog-1", "url", 20]);
  });
});

describe("services/reports: linkReportToScopeEntry (member-write denial)", () => {
  it("maps FORBIDDEN into a typed, code-discriminated error -- a plain organization member who does not manage this report's program cannot link an asset, the identical write-authorization boundary every other triage mutation uses (private.lock_and_authorize_report_for_triage)", async () => {
    const { OrganizationServiceError } = await import("../../services/rpc-error");
    fakeClient.query.mockImplementation(async () => {
      throw new Error("FORBIDDEN: actor cannot triage this report");
    });
    const { linkReportToScopeEntry } = await import("../../services/reports");

    const error: unknown = await linkReportToScopeEntry("report-1", "entry-1").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });

  it("maps SCOPE_ENTRY_WRONG_PROGRAM into a typed error -- a real, database-enforced rule (the chosen asset must belong to the same program as the report), never re-validated in TypeScript", async () => {
    const { OrganizationServiceError } = await import("../../services/rpc-error");
    fakeClient.query.mockImplementation(async () => {
      throw new Error("SCOPE_ENTRY_WRONG_PROGRAM: that asset belongs to a different program");
    });
    const { linkReportToScopeEntry } = await import("../../services/reports");

    const error: unknown = await linkReportToScopeEntry("report-1", "entry-from-other-program").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("SCOPE_ENTRY_WRONG_PROGRAM");
  });
});
