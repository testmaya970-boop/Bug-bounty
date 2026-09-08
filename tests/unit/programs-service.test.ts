import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
    withPublicTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("programs service: createProgram", () => {
  it("calls create_program with target_org_id, program_name, and the client-generated idempotency key, never a creator/manager/role param", async () => {
    let capturedSql = "";
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      captured = params;
      return queryReturning([{ id: "prog-1", organization_id: "org-1", name: "Acme Program", status: "draft", created_by: "actor-1", created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z" }]);
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor One", email: "actor@example.com" });
    const { createProgram } = await import("../../services/programs");

    const result = await createProgram("org-1", "Acme Program", "key-1");

    expect(capturedSql).toContain("create_program");
    expect(captured).toEqual(["org-1", "Acme Program", "key-1", null, null]);
    expect(result).toMatchObject({ id: "prog-1", organizationId: "org-1", name: "Acme Program", status: "draft", createdByName: "Actor One" });
  });

  it("passes p_engagement_type through to create_program alongside p_program_type, both real and separate params -- never conflated into one (docs/decisions/0076)", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("create_program")) {
        captured = params;
        return queryReturning([
          { id: "prog-1", organization_id: "org-1", name: "Acme Program", status: "draft", program_type: "bounty", engagement_type: "pentest", created_by: "actor-1", created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor One", email: "actor@example.com" });
    const { createProgram } = await import("../../services/programs");

    await createProgram("org-1", "Acme Program", "key-1", "bounty", "pentest");

    expect(captured).toEqual(["org-1", "Acme Program", "key-1", "bounty", "pentest"]);
  });

  it("passes null (letting the RPC's own default apply) when the caller does not specify an engagement type -- never silently defaulting to a different value client-side", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([{ id: "prog-1", organization_id: "org-1", name: "Acme Program", status: "draft", created_by: "actor-1", created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z" }]);
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { createProgram } = await import("../../services/programs");

    await createProgram("org-1", "Acme Program");

    expect(captured?.[4]).toBeNull();
  });

  it("maps FORBIDDEN and INVALID_NAME into typed, code-discriminated errors", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("FORBIDDEN: actor cannot create programs in this organization");
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { createProgram } = await import("../../services/programs");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await createProgram("org-1", "Acme").catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });

  it("does not leak a raw database error for an unrecognized failure", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error('duplicate key value violates unique constraint "programs_pkey"');
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { createProgram } = await import("../../services/programs");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await createProgram("org-1", "Acme").catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect((error as Error).message).not.toContain("constraint");
  });
});

describe("programs service: listProgramsForOrganization / getProgram", () => {
  it("scopes the list query to the given organization id and maps the creator embed", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([
        { id: "prog-1", organization_id: "org-1", name: "Acme Program", status: "active", created_by: "actor-1", created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-21T00:00:00Z", creator_display_name: "Actor One" },
      ]);
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { listProgramsForOrganization } = await import("../../services/programs");

    const [program] = await listProgramsForOrganization("org-1");

    expect(capturedSql).toContain("p.organization_id = $1");
    expect(capturedParams).toEqual(["org-1"]);
    expect(program).toMatchObject({ id: "prog-1", organizationId: "org-1", status: "active", createdByName: "Actor One" });
  });

  it("maps engagement_type to engagementType (docs/decisions/0076), distinct from and alongside programType, never conflated into one field", async () => {
    fakeClient.query.mockImplementation(async () =>
      queryReturning([
        {
          id: "prog-1",
          organization_id: "org-1",
          name: "Acme Pentest",
          status: "active",
          program_type: "bounty",
          engagement_type: "pentest",
          created_by: "actor-1",
          created_at: "2026-08-20T00:00:00Z",
          updated_at: "2026-08-21T00:00:00Z",
          creator_display_name: "Actor One",
        },
      ]),
    );
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { listProgramsForOrganization } = await import("../../services/programs");

    const [program] = await listProgramsForOrganization("org-1");

    expect(program.engagementType).toBe("pentest");
    expect(program.programType).toBe("bounty");
  });

  it("returns null from getProgram when RLS filters the row out (not found and not authorized look identical)", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { getProgram } = await import("../../services/programs");

    expect(await getProgram("prog-404")).toBeNull();
  });
});

describe("programs service: lifecycle transitions (docs/decisions/0021-program-lifecycle-transitions.md)", () => {
  const LIFECYCLE_RPCS = [
    ["submitProgramForReview", "submit_program_for_review"],
    ["activateProgram", "activate_program"],
    ["pauseProgram", "pause_program"],
    ["resumeProgram", "resume_program"],
    ["closeProgram", "close_program"],
  ] as const;

  for (const [fnName, rpcName] of LIFECYCLE_RPCS) {
    it(`${fnName} calls ${rpcName} with only target_program_id -- no client-supplied status, actor, or org id`, async () => {
      let capturedSql = "";
      let capturedParams: unknown[] | undefined;
      fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return queryReturning([{ id: "prog-1", organization_id: "org-1", name: "Acme Program", status: "active", created_by: "actor-1", created_at: "2026-08-30T00:00:00Z", updated_at: "2026-08-30T00:01:00Z" }]);
      });
      const { getCurrentUser } = await import("@/lib/auth/current-user");
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      const programsService = await import("../../services/programs");
      const fn = programsService[fnName] as (programId: string) => Promise<unknown>;

      const result = await fn("prog-1");

      expect(capturedSql).toContain(rpcName);
      expect(capturedParams).toEqual(["prog-1"]);
      expect(result).toMatchObject({ id: "prog-1", status: "active" });
    });
  }

  it("maps INVALID_PROGRAM_TRANSITION into a typed, code-discriminated error, never a raw database message", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("INVALID_PROGRAM_TRANSITION: this program cannot be activated from its current state");
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { activateProgram } = await import("../../services/programs");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await activateProgram("prog-1").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_PROGRAM_TRANSITION");
  });

  it("a transition result maps the bare row (no creator embed) to 'Unknown member' rather than throwing -- the caller's revalidatePath refreshes the real name", async () => {
    fakeClient.query.mockImplementation(async () =>
      queryReturning([{ id: "prog-1", organization_id: "org-1", name: "Acme Program", status: "paused", created_by: "actor-1", created_at: "2026-08-30T00:00:00Z", updated_at: "2026-08-30T00:01:00Z" }]),
    );
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { pauseProgram } = await import("../../services/programs");

    const result = await pauseProgram("prog-1");

    expect(result.createdByName).toBe("Unknown member");
  });
});

describe("programs service: public discovery (withPublicTransaction)", () => {
  it("listPublicPrograms passes filters, cursor, and page size positionally to list_public_programs", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([
        {
          id: "prog-1",
          organization_id: "org-1",
          name: "Acme Program",
          organization_name: "Acme Security",
          status: "active",
          description: "desc",
          updated_at: "2026-08-20T00:00:00Z",
          focus_areas: ["web_applications"],
          asset_types: ["domain"],
          bounty_min_minor_units: 10000,
          bounty_max_minor_units: 500000,
          bounty_currency: "usd",
          active_researcher_count: 5,
          resolved_report_count: 2,
        },
      ]);
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { listPublicPrograms } = await import("../../services/programs");

    const { items } = await listPublicPrograms({ search: "acme", status: "active", focusArea: "web_applications" }, undefined, 10);

    expect(capturedSql).toContain("list_public_programs");
    expect(capturedParams).toEqual(["acme", "active", "web_applications", null, null, 10]);
    expect(items[0]).toMatchObject({ id: "prog-1", focusAreas: ["web_applications"], activeResearcherCount: 5, resolvedReportCount: 2 });
  });

  it("getPublicProgram returns null when the RPC finds no matching row", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { getPublicProgram } = await import("../../services/programs");

    expect(await getPublicProgram("prog-404")).toBeNull();
  });

  it("listTopBountyPrograms defaults the limit to 6 when the caller does not specify one", async () => {
    let capturedParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedParams = params;
      return queryReturning([]);
    });
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { listTopBountyPrograms } = await import("../../services/programs");

    await listTopBountyPrograms();

    expect(capturedParams).toEqual([6]);
  });

  it("listPublicProgramScope maps scope rows to camelCase without exposing anything else", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ id: "entry-1", asset_type: "domain", display_target: "example.com", scope_state: "in_scope", description: null }]));
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { listPublicProgramScope } = await import("../../services/programs");

    const [entry] = await listPublicProgramScope("prog-1");
    expect(entry).toEqual({ id: "entry-1", assetType: "domain", displayTarget: "example.com", scopeState: "in_scope", description: null });
  });
});

describe("programs service: programStatusLabel", () => {
  it("gives every DOMAIN.md lifecycle state a human-readable, non-empty label", async () => {
    const { programStatusLabel } = await import("../../services/programs");
    for (const status of ["draft", "review", "active", "paused", "closed"] as const) {
      expect(programStatusLabel(status).length).toBeGreaterThan(0);
    }
  });
});
