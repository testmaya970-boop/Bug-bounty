import { beforeEach, describe, expect, it, vi } from "vitest";

// services/bounty.ts's data-access boundary is lib/db/pool.ts's withActorTransaction/
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

const POLICY_VERSION_ROW = {
  id: "policy-1",
  program_id: "program-1",
  organization_id: "org-1",
  version_number: 1,
  currency: "USD",
  created_at: "2026-08-28T00:00:00Z",
  superseded_at: null,
};

const RANGE_ROWS = [
  { severity: "none", min_amount_minor_units: 0, max_amount_minor_units: 0 },
  { severity: "low", min_amount_minor_units: 0, max_amount_minor_units: 5000 },
  { severity: "medium", min_amount_minor_units: 5000, max_amount_minor_units: 25000 },
  { severity: "high", min_amount_minor_units: 25000, max_amount_minor_units: 100000 },
  { severity: "critical", min_amount_minor_units: 100000, max_amount_minor_units: 500000 },
];

const DECISION_ROW = {
  id: "decision-1",
  report_id: "report-1",
  state: "calculated",
  ineligible_reason: null,
  policy_version_id: "policy-1",
  severity_at_calculation: "high",
  currency: "USD",
  calculated_min_amount_minor_units: 25000,
  calculated_max_amount_minor_units: 100000,
  final_amount_minor_units: null,
  finalized_by: "actor-1",
  finalized_at: null,
  finalization_note: null,
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
};

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("bounty service: getEffectiveBountyPolicy", () => {
  it("returns null without reading ranges when no effective policy version exists", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from public.program_bounty_policy_versions")) return queryReturning([]);
      throw new Error(`unexpected query ${sql}`);
    });
    fakeClient.query.mockImplementation(query);
    const { getEffectiveBountyPolicy } = await import("../../services/bounty");

    const result = await getEffectiveBountyPolicy("program-1");

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("reads the effective version, then its ranges, and maps both onto the BountyPolicy shape", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.program_bounty_policy_versions")) return queryReturning([POLICY_VERSION_ROW]);
      if (sql.includes("from public.program_bounty_policy_severity_ranges")) return queryReturning(RANGE_ROWS);
      throw new Error(`unexpected query ${sql}`);
    });
    const { getEffectiveBountyPolicy } = await import("../../services/bounty");

    const result = await getEffectiveBountyPolicy("program-1");

    expect(result).not.toBeNull();
    expect(result?.versionNumber).toBe(1);
    expect(result?.currency).toBe("USD");
    expect(result?.ranges).toHaveLength(5);
    expect(result?.ranges.find((r) => r.severity === "high")).toEqual({ severity: "high", minAmountMinorUnits: 25000, maxAmountMinorUnits: 100000 });
  });

  it("maps the failure to a typed, code-discriminated error and never reads ranges when the version lookup itself fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from public.program_bounty_policy_versions")) throw new Error("FORBIDDEN: actor cannot configure bounty policy for this program");
      throw new Error(`unexpected query ${sql}`);
    });
    fakeClient.query.mockImplementation(query);
    const { getEffectiveBountyPolicy, OrganizationServiceError } = await import("../../services/bounty");

    const error: unknown = await getEffectiveBountyPolicy("program-1").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("bounty service: createBountyPolicyVersion sends all five tiers as explicit numeric parameters", () => {
  it("calls create_bounty_policy_version with every tier's min/max, never a JSON blob", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("create_bounty_policy_version")) {
        captured = params;
        return queryReturning([POLICY_VERSION_ROW]);
      }
      return queryReturning([]);
    });
    const { createBountyPolicyVersion } = await import("../../services/bounty");

    const ranges = {
      none: { min: 0, max: 0 },
      low: { min: 0, max: 5000 },
      medium: { min: 5000, max: 25000 },
      high: { min: 25000, max: 100000 },
      critical: { min: 100000, max: 500000 },
    };
    const result = await createBountyPolicyVersion("program-1", "USD", ranges);

    expect(captured).toEqual(["program-1", "USD", 0, 0, 0, 5000, 5000, 25000, 25000, 100000, 100000, 500000]);
    expect(result.ranges).toHaveLength(5);
  });

  it("maps a policy validation error onto OrganizationServiceError with its original code", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("INVALID_BOUNTY_POLICY: Each severity tier's minimum must not exceed its maximum.");
    });
    const { createBountyPolicyVersion } = await import("../../services/bounty");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await createBountyPolicyVersion("program-1", "USD", {
      none: { min: 0, max: 0 },
      low: { min: 0, max: 0 },
      medium: { min: 0, max: 0 },
      high: { min: 0, max: 0 },
      critical: { min: 0, max: 0 },
    }).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_BOUNTY_POLICY");
  });
});

describe("bounty service: getReportBountyDecision never exposes finalizedBy through the mapped type", () => {
  it("returns null when RLS returns no row (denied and nonexistent look identical)", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getReportBountyDecision } = await import("../../services/bounty");

    const result = await getReportBountyDecision("report-404");

    expect(result).toBeNull();
  });

  it("maps a decision row without ever including finalized_by/finalizedBy on the returned object", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([DECISION_ROW]));
    const { getReportBountyDecision } = await import("../../services/bounty");

    const result = await getReportBountyDecision("report-1");

    expect(result).not.toBeNull();
    expect(result?.state).toBe("calculated");
    expect(result).not.toHaveProperty("finalizedBy");
    expect(result).not.toHaveProperty("finalized_by");
  });
});

describe("bounty service: calculateBountyRecommendation / finalizeBounty / adjustBounty call the exact RPC with the exact parameter order", () => {
  it("calculateBountyRecommendation calls calculate_bounty_recommendation with only the report id", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("calculate_bounty_recommendation")) {
        captured = params;
        return queryReturning([DECISION_ROW]);
      }
      return queryReturning([]);
    });
    const { calculateBountyRecommendation } = await import("../../services/bounty");

    const result = await calculateBountyRecommendation("report-1");

    expect(captured).toEqual(["report-1"]);
    expect(result.severityAtCalculation).toBe("high");
  });

  it("finalizeBounty sends the amount and note in the RPC's exact parameter order", async () => {
    const finalizedRow = { ...DECISION_ROW, state: "finalized", final_amount_minor_units: 60000, finalized_at: "2026-08-28T01:00:00Z", finalization_note: "Great find" };
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("finalize_bounty")) {
        captured = params;
        return queryReturning([finalizedRow]);
      }
      return queryReturning([]);
    });
    const { finalizeBounty } = await import("../../services/bounty");

    const result = await finalizeBounty("report-1", 60000, "Great find");

    expect(captured).toEqual(["report-1", 60000, "Great find"]);
    expect(result.finalAmountMinorUnits).toBe(60000);
  });

  it("finalizeBounty maps BOUNTY_ALREADY_FINALIZED onto OrganizationServiceError with that exact code, rather than silently succeeding", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("BOUNTY_ALREADY_FINALIZED: this report's bounty has already been finalized");
    });
    const { finalizeBounty } = await import("../../services/bounty");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await finalizeBounty("report-1", 60000, "").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("BOUNTY_ALREADY_FINALIZED");
  });

  it("adjustBounty sends the new amount and reason in the RPC's exact parameter order", async () => {
    const adjustedRow = { ...DECISION_ROW, state: "finalized", final_amount_minor_units: 75000, finalized_at: "2026-08-28T02:00:00Z", finalization_note: "Exceptional impact" };
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("adjust_bounty")) {
        captured = params;
        return queryReturning([adjustedRow]);
      }
      return queryReturning([]);
    });
    const { adjustBounty } = await import("../../services/bounty");

    const result = await adjustBounty("report-1", 75000, "Exceptional impact");

    expect(captured).toEqual(["report-1", 75000, "Exceptional impact"]);
    expect(result.finalAmountMinorUnits).toBe(75000);
  });
});
