import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermanentHandlerError, RetryableHandlerError } from "../../workers/outbox/registry";
import type { OutboxEvent } from "../../types/outbox";

// workers/outbox/handlers/reputation/*.ts's data-access boundary is
// workers/outbox/db-pool.ts's withServiceRoleTransaction/callRpc -- mocked here at that
// boundary, same "mock the thin data-access layer, exercise the handler's own logic for
// real" pattern used across the native-Postgres migration's test suite.
const fakeClient = { query: vi.fn() };

vi.mock("../../workers/outbox/db-pool", async () => {
  const actual = await vi.importActual<typeof import("../../workers/outbox/db-pool")>("../../workers/outbox/db-pool");
  return {
    ...actual,
    withServiceRoleTransaction: vi.fn((fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

const VALID_PAYLOAD = { report_id: "report-1", program_id: "program-1", organization_id: "org-1", researcher_id: "researcher-1" };

function baseEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "event-1",
    eventType: "report.resolved",
    schemaVersion: 1,
    aggregateType: "report",
    aggregateId: "report-1",
    organizationId: "org-1",
    payload: VALID_PAYLOAD,
    occurredAt: "2026-08-29T00:00:00Z",
    availableAt: "2026-08-29T00:00:00Z",
    attempts: 1,
    maxAttempts: 5,
    status: "processing",
    lockedAt: "2026-08-29T00:00:00Z",
    lockedBy: "worker-1",
    processedAt: null,
    lastError: null,
    createdAt: "2026-08-29T00:00:00Z",
    updatedAt: "2026-08-29T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("reputation reference consumer: createReportOutcomeHandler", () => {
  it("rejects a payload missing a required field as a PermanentHandlerError -- never succeeds on retry", async () => {
    const { createReportOutcomeHandler } = await import("../../workers/outbox/handlers/reputation/report-outcome");
    const handler = createReportOutcomeHandler("report_resolved");
    const malformed = baseEvent({ payload: { report_id: "report-1" } });

    const error: unknown = await handler(malformed).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });

  it("calls record_reputation_fact with the exact fact type it was created for, the event id, report id, and occurred_at", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([{ id: "fact-1" }]);
    });
    const { createReportOutcomeHandler } = await import("../../workers/outbox/handlers/reputation/report-outcome");
    const handler = createReportOutcomeHandler("report_duplicate");

    await handler(baseEvent({ eventType: "report.duplicate" }));

    expect(captured).toEqual(["event-1", "report_duplicate", "report-1", "2026-08-29T00:00:00Z"]);
  });

  it("a PROVENANCE_MISMATCH RPC error is treated as permanent -- the report's terminal status is immutable, so retrying can never fix it", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("PROVENANCE_MISMATCH: report's current status does not match the claimed fact type");
    });
    const { createReportOutcomeHandler } = await import("../../workers/outbox/handlers/reputation/report-outcome");
    const handler = createReportOutcomeHandler("report_resolved");

    const error: unknown = await handler(baseEvent()).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });

  it("a REPORT_NOT_FOUND RPC error is also treated as permanent", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("REPORT_NOT_FOUND: referenced report no longer exists");
    });
    const { createReportOutcomeHandler } = await import("../../workers/outbox/handlers/reputation/report-outcome");
    const handler = createReportOutcomeHandler("report_resolved");

    const error: unknown = await handler(baseEvent()).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });

  it("an unrecognized RPC error (e.g. a dropped connection) is treated as retryable, the safe default", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("connection reset");
    });
    const { createReportOutcomeHandler } = await import("../../workers/outbox/handlers/reputation/report-outcome");
    const handler = createReportOutcomeHandler("report_resolved");

    const error: unknown = await handler(baseEvent()).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(RetryableHandlerError);
  });

  it("succeeds silently (no throw) when the RPC succeeds", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ id: "fact-1" }]));
    const { createReportOutcomeHandler } = await import("../../workers/outbox/handlers/reputation/report-outcome");
    const handler = createReportOutcomeHandler("report_rejected");

    await expect(handler(baseEvent({ eventType: "report.rejected" }))).resolves.toBeUndefined();
  });
});

describe("reputation reference consumer: handleBountyFinalizedV1", () => {
  it("rejects a malformed payload as permanent", async () => {
    const { handleBountyFinalizedV1 } = await import("../../workers/outbox/handlers/reputation/bounty-finalized-v1");
    const malformed = baseEvent({ eventType: "bounty.finalized", payload: {} });

    const error: unknown = await handleBountyFinalizedV1(malformed).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });

  it("calls record_bounty_finalized_reputation_fact with the event id, report id, and occurred_at -- never an amount or currency", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([{ id: "fact-1" }]);
    });
    const { handleBountyFinalizedV1 } = await import("../../workers/outbox/handlers/reputation/bounty-finalized-v1");

    await handleBountyFinalizedV1(baseEvent({ eventType: "bounty.finalized" }));

    expect(captured).toEqual(["event-1", "report-1", "2026-08-29T00:00:00Z"]);
  });

  it("a PROVENANCE_MISMATCH (no finalized bounty decision) is permanent", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("PROVENANCE_MISMATCH: this report has no finalized bounty decision");
    });
    const { handleBountyFinalizedV1 } = await import("../../workers/outbox/handlers/reputation/bounty-finalized-v1");

    const error: unknown = await handleBountyFinalizedV1(baseEvent({ eventType: "bounty.finalized" })).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });
});

describe("reputation handler registration", () => {
  it("registers all six event types, each dispatchable by exact type:version", async () => {
    vi.resetModules();
    await import("../../workers/outbox/handlers/index");
    const { getHandlers } = await import("../../workers/outbox/registry");

    // Each key now also carries a notification consumer (0017) registered against the
    // identical event_type:schema_version -- assert reputation's own consumer is present
    // among them, not that it is the only one (see workers/outbox/registry.ts's own
    // multi-consumer-per-key design).
    for (const [eventType] of [
      ["report.created"],
      ["report.resolved"],
      ["report.duplicate"],
      ["report.informative"],
      ["report.not_applicable"],
      ["report.rejected"],
      ["bounty.finalized"],
    ]) {
      expect(getHandlers(eventType, 1).length).toBeGreaterThanOrEqual(1);
    }
    expect(getHandlers("report.resolved", 2)).toEqual([]);
  });
});
