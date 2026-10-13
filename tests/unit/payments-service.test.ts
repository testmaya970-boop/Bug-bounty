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
// The currency router hands back the manual provider (the default with no payout provider configured).
const mockedProvider = vi.hoisted(() => ({ name: "manual", mode: "manual" as const, createPayment: vi.fn() }));
vi.mock("@/lib/payment-provider", () => ({ selectPayoutProvider: () => mockedProvider, loadPayoutRecipient: vi.fn() }));

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

const OBLIGATION_ROW = {
  id: "obligation-1",
  organization_id: "org-1",
  program_id: "program-1",
  report_id: "report-1",
  researcher_id: "researcher-1",
  bounty_decision_id: "decision-1",
  amount_minor_units: 60000,
  platform_fee_minor_units: 12000,
  currency: "USD",
  status: "pending",
  created_at: "2026-08-29T00:00:00Z",
  updated_at: "2026-08-29T00:00:00Z",
};

const ATTEMPT_ROW = {
  id: "attempt-1",
  payment_obligation_id: "obligation-1",
  attempt_number: 1,
  provider: "manual",
  state: "requires_operator_action",
  requested_amount_minor_units: 60000,
  currency: "USD",
  provider_reference_id: null,
  failure_code: null,
  failure_message: null,
  started_at: "2026-08-29T00:00:00Z",
  completed_at: null,
  created_at: "2026-08-29T00:00:00Z",
};

beforeEach(() => {
  fakeClient.query.mockReset();
  mockedProvider.createPayment.mockReset().mockResolvedValue({ providerReferenceId: null, outcome: "requires_operator_action" });
});

describe("payments service: listReportPaymentObligations", () => {
  it("returns an empty list when RLS returns no row (denied and nonexistent look identical)", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { listReportPaymentObligations } = await import("../../services/payments");

    expect(await listReportPaymentObligations("report-404")).toEqual([]);
  });

  it("maps one row per recipient, carrying who is owed but never attempt-level detail", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([OBLIGATION_ROW, { ...OBLIGATION_ROW, id: "obligation-2", researcher_id: "collaborator-1", amount_minor_units: 15000 }]));
    const { listReportPaymentObligations } = await import("../../services/payments");

    const result = await listReportPaymentObligations("report-1");

    expect(result.map((o) => [o.researcherId, o.amountMinorUnits])).toEqual([
      ["researcher-1", 60000],
      ["collaborator-1", 15000],
    ]);
    expect(result[0].platformFeeMinorUnits).toBe(12000);
    expect(result[0]).not.toHaveProperty("failureCode");
    expect(result[0]).not.toHaveProperty("organizationId");
  });

  it("maps a failed read to a typed, code-discriminated error, never a raw database error", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("FORBIDDEN: actor cannot manage payment obligations for this program");
    });
    const { listReportPaymentObligations, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await listReportPaymentObligations("report-1").catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });
});

describe("payments service: createPaymentObligations calls the RPC with only the report id", () => {
  it("sends only the report id -- amounts, splits and recipients are decided by the database", async () => {
    let capturedSql = "";
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedArgs = params;
      return queryReturning([{ ...OBLIGATION_ROW, id: "obligation-2", researcher_id: "collaborator-1", amount_minor_units: 15000 }, { ...OBLIGATION_ROW, amount_minor_units: 45000 }]);
    });
    const { createPaymentObligations } = await import("../../services/payments");

    const result = await createPaymentObligations("report-1");

    expect(capturedSql).toContain("create_payment_obligation");
    expect(capturedArgs).toEqual(["report-1"]);
    expect(result.map((o) => o.researcherId)).toEqual(["collaborator-1", "researcher-1"]);
    expect(result.reduce((sum, o) => sum + o.amountMinorUnits, 0)).toBe(60000);
  });

  it.each(["OBLIGATION_ALREADY_EXISTS", "BOUNTY_DISPUTED"])("maps %s onto OrganizationServiceError with that exact code", async (code) => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error(`${code}: refused`);
    });
    const { createPaymentObligations, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await createPaymentObligations("report-1").catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe(code);
  });
});

describe("payments service: initiateManualPaymentAttempt records the attempt, then calls the provider abstraction keyed by it", () => {
  it("calls the RPC with only the obligation id, then the selected provider's createPayment with the attempt id as idempotency key", async () => {
    const order: string[] = [];
    let capturedRpcArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      order.push("rpc");
      if (sql.includes("initiate_manual_payment_attempt")) capturedRpcArgs = params;
      return queryReturning([ATTEMPT_ROW]);
    });
    mockedProvider.createPayment.mockImplementation(async () => {
      order.push("provider");
      return { providerReferenceId: null, outcome: "requires_operator_action" };
    });
    const { initiateManualPaymentAttempt } = await import("../../services/payments");

    const result = await initiateManualPaymentAttempt("obligation-1");

    expect(order).toEqual(["rpc", "provider"]);
    expect(capturedRpcArgs).toEqual(["obligation-1"]);
    // The full bounty (60000), not net of the fee: the fee is billed to the organization on
    // top (202609250010) and never deducted from the researcher's payout.
    expect(mockedProvider.createPayment).toHaveBeenCalledWith({ idempotencyKey: "attempt-1", amountMinorUnits: 60000, currency: "USD" });
    expect(result.state).toBe("requires_operator_action");
  });

  it.each(["PAYMENT_ALREADY_PROCESSING", "PAYOUT_NOT_READY", "BOUNTY_DISPUTED"])("maps %s and never reaches the provider", async (code) => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error(`${code}: refused`);
    });
    const { initiateManualPaymentAttempt, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await initiateManualPaymentAttempt("obligation-1").catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe(code);
    expect(mockedProvider.createPayment).not.toHaveBeenCalled();
  });
});

describe("payments service: getReportPayoutReadiness", () => {
  it("returns only which requirement is missing per recipient, never a payout destination", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ researcher_id: "researcher-1", display_name: "Rae", blockers: ["tax_form_not_verified"] }]));
    const { getReportPayoutReadiness } = await import("../../services/payments");

    expect(await getReportPayoutReadiness("report-1")).toEqual([{ researcherId: "researcher-1", displayName: "Rae", blockers: ["tax_form_not_verified"] }]);
  });
});

describe("payments service: recordManualPaymentResult sends the RPC's exact parameter order, coercing missing optional fields to empty strings (never null, matching the real SQL function's defaults)", () => {
  it("succeeded outcome", async () => {
    const succeededRow = { ...ATTEMPT_ROW, state: "succeeded", completed_at: "2026-08-29T01:00:00Z", provider_reference_id: "wire-123" };
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedArgs = params;
      return queryReturning([succeededRow]);
    });
    const { recordManualPaymentResult } = await import("../../services/payments");

    const result = await recordManualPaymentResult("attempt-1", "succeeded", { providerReferenceId: "wire-123" });

    expect(capturedArgs).toEqual(["attempt-1", "succeeded", "wire-123", "", ""]);
    expect(result.state).toBe("succeeded");
  });

  it("failed outcome requires a failure code, surfaced by the mapped RPC error when omitted", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedArgs = params;
      throw new Error("INVALID_PAYMENT_OUTCOME: a failure code is required when recording a failed payment");
    });
    const { recordManualPaymentResult, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await recordManualPaymentResult("attempt-1", "failed", {}).catch((thrown) => thrown);

    expect(capturedArgs).toEqual(["attempt-1", "failed", "", "", ""]);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_PAYMENT_OUTCOME");
  });

  it("maps ATTEMPT_ALREADY_RESOLVED onto OrganizationServiceError -- idempotency-as-rejection, not a silent no-op", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("ATTEMPT_ALREADY_RESOLVED: this attempt has already recorded a result");
    });
    const { recordManualPaymentResult, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await recordManualPaymentResult("attempt-1", "succeeded", {}).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("ATTEMPT_ALREADY_RESOLVED");
  });
});

describe("payments service: cancelPaymentObligation sends the exact obligation id and reason", () => {
  it("calls cancel_payment_obligation with the obligation id and reason, in that order", async () => {
    const cancelledRow = { ...OBLIGATION_ROW, status: "cancelled" };
    let capturedSql = "";
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedArgs = params;
      return queryReturning([cancelledRow]);
    });
    const { cancelPaymentObligation } = await import("../../services/payments");

    const result = await cancelPaymentObligation("obligation-1", "Researcher account could not be verified");

    expect(capturedSql).toContain("cancel_payment_obligation");
    expect(capturedArgs).toEqual(["obligation-1", "Researcher account could not be verified"]);
    expect(result.status).toBe("cancelled");
  });
});

describe("payments service: listPaymentAttempts orders by attempt_number descending (latest first)", () => {
  it("queries with the expected order clause and maps every row", async () => {
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([ATTEMPT_ROW]);
    });
    const { listPaymentAttempts } = await import("../../services/payments");

    const result = await listPaymentAttempts("obligation-1");

    expect(capturedSql).toContain("order by attempt_number desc");
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe("requires_operator_action");
  });
});
