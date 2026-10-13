import { beforeEach, describe, expect, it, vi } from "vitest";

// services/reputation.ts's data-access boundary is lib/db/pool.ts's withActorTransaction/
// withPublicTransaction/callRpc -- mocked here at that boundary, same "mock the thin
// data-access layer, exercise the service's own logic for real" pattern used across the
// native-Postgres migration's test suite. A fake PoolClient's `.query` is a controllable
// mock so each test scripts exactly the rows a real query would have returned.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
    withPublicTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "researcher-1", platformRole: null, username: "actor", displayName: "Actor", email: null }) }));

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("reputation service: getMyReputationSummary", () => {
  it("maps rows to camelCase factType/count, calling the RPC with no arguments (self-only, no researcher id parameter exists to pass)", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("get_my_reputation_summary")) {
        captured = params;
        return queryReturning([
          { fact_type: "report_resolved", fact_count: 3 },
          { fact_type: "bounty_finalized", fact_count: 1 },
        ]);
      }
      return queryReturning([]);
    });
    const { getMyReputationSummary } = await import("../../services/reputation");

    const result = await getMyReputationSummary();

    expect(captured).toEqual([]);
    expect(result).toEqual([
      { factType: "report_resolved", count: 3 },
      { factType: "bounty_finalized", count: 1 },
    ]);
  });

  it("returns an empty array when the researcher has no recorded facts yet, rather than null or an error", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getMyReputationSummary } = await import("../../services/reputation");

    const result = await getMyReputationSummary();

    expect(result).toEqual([]);
  });

  it("maps a CODE: message RPC error onto OrganizationServiceError with its original code", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("AUTH_REQUIRED: authentication required");
    });
    const { getMyReputationSummary, OrganizationServiceError } = await import("../../services/reputation");

    const error: unknown = await getMyReputationSummary().catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("AUTH_REQUIRED");
  });
});

describe("reputation service: getMyReputationLedger", () => {
  it("explicitly filters by the caller's own researcher_id (P0: reputation_ledger's RLS also admits the report's own organization, so this filter is required, not merely RLS-adjacent)", async () => {
    let capturedParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedParams = params;
      return queryReturning([]);
    });
    const { getMyReputationLedger } = await import("../../services/reputation");

    await getMyReputationLedger("researcher-42");

    expect(capturedParams?.[0]).toBe("researcher-42");
  });

  it("maps rows to camelCase, newest first, never a score/value column", async () => {
    const row = { id: "l1", fact_type: "report_resolved", report_id: "r1", program_id: "p1", organization_id: "o1", confirmed_severity: "high", duplicate_of_report_id: null, occurred_at: "2026-08-29T00:00:00Z" };
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([row]);
    });
    const { getMyReputationLedger } = await import("../../services/reputation");

    const result = await getMyReputationLedger("researcher-1");

    expect(capturedSql).toContain("order by occurred_at desc");
    expect(result).toEqual({
      items: [{ id: "l1", factType: "report_resolved", reportId: "r1", programId: "p1", organizationId: "o1", confirmedSeverity: "high", duplicateOfReportId: null, occurredAt: "2026-08-29T00:00:00Z" }],
      nextCursor: null,
    });
  });

  it("applies a decoded cursor as an occurred_at < filter", async () => {
    const { encodeCursor } = await import("../../lib/pagination");
    let capturedSql = "";
    let capturedParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { getMyReputationLedger } = await import("../../services/reputation");

    await getMyReputationLedger("researcher-1", encodeCursor("2026-08-29T00:00:00Z", "00000000-0000-4000-8000-000000000019"));

    expect(capturedSql).toContain("occurred_at < $2");
    expect(capturedParams).toEqual(["researcher-1", "2026-08-29T00:00:00Z", 20]);
  });
});

describe("reputation service: getMyReputationProgramCounts", () => {
  it("returns a true total count per program (not a partial-page count), explicitly filtered by the caller's own researcher_id", async () => {
    let capturedParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedParams = params;
      return queryReturning([{ program_id: "p1" }, { program_id: "p1" }, { program_id: "p2" }]);
    });
    const { getMyReputationProgramCounts } = await import("../../services/reputation");

    const result = await getMyReputationProgramCounts("researcher-7");

    expect(capturedParams).toEqual(["researcher-7"]);
    expect(result).toEqual(expect.arrayContaining([{ programId: "p1", count: 2 }, { programId: "p2", count: 1 }]));
  });
});

describe("reputation service: getResearcherReputationScore (public-callable)", () => {
  it("calls get_researcher_reputation_score via withPublicTransaction with the researcher id", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("get_researcher_reputation_score")) {
        captured = params;
        return queryReturning([{ get_researcher_reputation_score: 42 }]);
      }
      return queryReturning([]);
    });
    const { getResearcherReputationScore } = await import("../../services/reputation");

    const result = await getResearcherReputationScore("researcher-9");

    expect(captured).toEqual(["researcher-9"]);
    expect(result).toBe(42);
  });

  it("defaults to 0 when no row is returned", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getResearcherReputationScore } = await import("../../services/reputation");

    const result = await getResearcherReputationScore("researcher-9");

    expect(result).toBe(0);
  });
});

describe("reputation service: getPublicLeaderboard (public-callable)", () => {
  it("maps rows to camelCase and passes the limit through", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("get_public_leaderboard")) {
        captured = params;
        return queryReturning([
          { researcher_id: "r1", display_name: "Alice", public_username: "alice", score: 100, resolved_count: 5, bounty_finalized_count: 2 },
        ]);
      }
      return queryReturning([]);
    });
    const { getPublicLeaderboard } = await import("../../services/reputation");

    const result = await getPublicLeaderboard(10);

    expect(captured).toEqual([10]);
    expect(result).toEqual([
      { researcherId: "r1", displayName: "Alice", publicUsername: "alice", score: 100, resolvedCount: 5, bountyFinalizedCount: 2 },
    ]);
  });
});

describe("reputation service: getMyLeaderboardPosition", () => {
  it("maps the RPC's row into a camelCase result", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ rank: 3, score: 77, total_researchers: 200 }]));
    const { getMyLeaderboardPosition } = await import("../../services/reputation");

    const result = await getMyLeaderboardPosition();

    expect(result).toEqual({ rank: 3, score: 77, totalResearchers: 200 });
  });

  it("returns null when no row is returned", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getMyLeaderboardPosition } = await import("../../services/reputation");

    const result = await getMyLeaderboardPosition();

    expect(result).toBeNull();
  });
});

describe("reputation service: getPublicResearcherProfile (public-callable)", () => {
  it("maps a found profile row to camelCase", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("get_public_researcher_profile")) {
        captured = params;
        return queryReturning([
          { researcher_id: "r1", display_name: "Alice", public_username: "alice", biography: "hi", hacking_interests: ["web"], security_focus: ["appsec"], score: 100, resolved_count: 5, bounty_finalized_count: 2 },
        ]);
      }
      return queryReturning([]);
    });
    const { getPublicResearcherProfile } = await import("../../services/reputation");

    const result = await getPublicResearcherProfile("alice");

    expect(captured).toEqual(["alice"]);
    expect(result).toEqual({
      researcherId: "r1",
      displayName: "Alice",
      publicUsername: "alice",
      biography: "hi",
      hackingInterests: ["web"],
      securityFocus: ["appsec"],
      score: 100,
      resolvedCount: 5,
      bountyFinalizedCount: 2,
    });
  });

  it("returns null identically for 'no such username' and 'exists but has no public profile set'", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getPublicResearcherProfile } = await import("../../services/reputation");

    const result = await getPublicResearcherProfile("nobody");

    expect(result).toBeNull();
  });
});

describe("reputation service: getResearcherBadges (public-callable)", () => {
  it("maps rows to camelCase, and a badge family with zero progress is simply absent", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("get_researcher_badges")) {
        captured = params;
        return queryReturning([{ badge_key: "resolver", tier: "gold", current_value: 12, next_threshold: 20 }]);
      }
      return queryReturning([]);
    });
    const { getResearcherBadges } = await import("../../services/reputation");

    const result = await getResearcherBadges("researcher-9");

    expect(captured).toEqual(["researcher-9"]);
    expect(result).toEqual([{ badgeKey: "resolver", tier: "gold", currentValue: 12, nextThreshold: 20 }]);
  });

  it("returns an empty array when the researcher has no badge progress at all", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getResearcherBadges } = await import("../../services/reputation");

    const result = await getResearcherBadges("researcher-9");

    expect(result).toEqual([]);
  });
});

describe("reputation service: setMyPublicUsername / getMyPublicUsername", () => {
  it("setMyPublicUsername sends the username to the RPC", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("set_my_public_username")) {
        captured = params;
        return queryReturning([]);
      }
      return queryReturning([]);
    });
    const { setMyPublicUsername } = await import("../../services/reputation");

    await setMyPublicUsername("newname");

    expect(captured).toEqual(["newname"]);
  });

  it("setMyPublicUsername maps a USERNAME_TAKEN RPC error onto OrganizationServiceError", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("USERNAME_TAKEN: that username is already in use");
    });
    const { setMyPublicUsername } = await import("../../services/reputation");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await setMyPublicUsername("taken").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("USERNAME_TAKEN");
  });

  it("getMyPublicUsername returns the stored value, or null if never set", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ public_username: null }]));
    const { getMyPublicUsername } = await import("../../services/reputation");

    const result = await getMyPublicUsername("researcher-1");

    expect(result).toBeNull();
  });
});
