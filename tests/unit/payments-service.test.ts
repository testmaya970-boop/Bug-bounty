import { beforeEach, describe, expect, it, vi } from "vitest";
import { activePaymentProvider } from "@/lib/payment-provider";

const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null }) }));
vi.mock("@/lib/payment-provider", () => ({
  activePaymentProvider: { name: "manual", createPayment: vi.fn(), getPaymentStatus: vi.fn(), cancelPayment: vi.fn() },
}));

const mockedProvider = vi.mocked(activePaymentProvider, true);

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
  mockedProvider.getPaymentStatus.mockReset();
  mockedProvider.cancelPayment.mockReset();
});

describe("payments service: getPaymentObligation", () => {
  it("returns null when RLS returns no row (denied and nonexistent look identical)", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getPaymentObligation } = await import("../../services/payments");

    const result = await getPaymentObligation("report-404");

    expect(result).toBeNull();
  });

  it("maps a row without ever including attempt-level detail on the obligation type", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([OBLIGATION_ROW]));
    const { getPaymentObligation } = await import("../../services/payments");

    const result = await getPaymentObligation("report-1");

    expect(result).not.toBeNull();
    expect(result?.status).toBe("pending");
    expect(result?.amountMinorUnits).toBe(60000);
    expect(result?.platformFeeMinorUnits).toBe(12000);
    expect(result).not.toHaveProperty("failureCode");
    expect(result).not.toHaveProperty("organizationId");
  });

  it("maps a failed read to a typed, code-discriminated error, never a raw database error", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("FORBIDDEN: actor cannot manage payment obligations for this program");
    });
    const { getPaymentObligation, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await getPaymentObligation("report-1").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });
});

describe("payments service: createPaymentObligation calls the RPC with only the report id", () => {
  it("sends only the report id -- amount/currency/researcher are never client parameters", async () => {
    let capturedSql = "";
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedArgs = params;
      return queryReturning([OBLIGATION_ROW]);
    });
    const { createPaymentObligation } = await import("../../services/payments");

    const result = await createPaymentObligation("report-1");

    expect(capturedSql).toContain("create_payment_obligation");
    expect(capturedArgs).toEqual(["report-1"]);
    expect(result.status).toBe("pending");
  });

  it("maps OBLIGATION_ALREADY_EXISTS onto OrganizationServiceError with that exact code", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("OBLIGATION_ALREADY_EXISTS: a payment obligation already exists for this bounty decision");
    });
    const { createPaymentObligation, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await createPaymentObligation("report-1").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("OBLIGATION_ALREADY_EXISTS");
  });
});

describe("payments service: initiateManualPaymentAttempt calls the provider abstraction before the RPC, never a concrete SDK", () => {
  it("reads the obligation, calls activePaymentProvider.createPayment, then calls the RPC with only the obligation id", async () => {
    let capturedRpcArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("initiate_manual_payment_attempt")) {
        capturedRpcArgs = params;
        return queryReturning([ATTEMPT_ROW]);
      }
      return queryReturning([OBLIGATION_ROW]);
    });
    const { initiateManualPaymentAttempt } = await import("../../services/payments");

    const result = await initiateManualPaymentAttempt("obligation-1");

    // The full bounty (60000), not net of the 12000 fee: the fee is billed to the
    // organization on top (202609250010) and never deducted from the researcher's payout.
    expect(mockedProvider.createPayment).toHaveBeenCalledWith({ idempotencyKey: "obligation-1", amountMinorUnits: 60000, currency: "USD" });
    expect(capturedRpcArgs).toEqual(["obligation-1"]);
    expect(result.state).toBe("requires_operator_action");
  });

  it("throws OBLIGATION_NOT_FOUND without ever calling the provider when the obligation cannot be read", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { initiateManualPaymentAttempt, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await initiateManualPaymentAttempt("obligation-404").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("OBLIGATION_NOT_FOUND");
    expect(mockedProvider.createPayment).not.toHaveBeenCalled();
  });

  it("maps PAYMENT_ALREADY_PROCESSING onto OrganizationServiceError with that exact code, rather than silently succeeding", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("initiate_manual_payment_attempt")) {
        throw new Error("PAYMENT_ALREADY_PROCESSING: an attempt is already in progress for this obligation");
      }
      return queryReturning([OBLIGATION_ROW]);
    });
    const { initiateManualPaymentAttempt, OrganizationServiceError } = await import("../../services/payments");

    const error: unknown = await initiateManualPaymentAttempt("obligation-1").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("PAYMENT_ALREADY_PROCESSING");
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
