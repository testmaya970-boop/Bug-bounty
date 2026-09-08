import { beforeEach, describe, expect, it, vi } from "vitest";

// workers/outbox/queue.ts's data-access boundary is workers/outbox/db-pool.ts's
// withServiceRoleTransaction/callRpc -- mocked here at that boundary, same "mock the
// thin data-access layer, exercise the service's own logic for real" pattern used across
// the native-Postgres migration's test suite. A fake PoolClient's `.query` is a
// controllable mock so each test scripts exactly the rows a real query would have
// returned.
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

const EVENT_ROW = {
  id: "event-1",
  event_type: "report.created",
  schema_version: 1,
  aggregate_type: "report",
  aggregate_id: "report-1",
  organization_id: "org-1",
  payload: { report_id: "report-1" },
  occurred_at: "2026-08-29T00:00:00Z",
  available_at: "2026-08-29T00:00:00Z",
  attempts: 1,
  max_attempts: 5,
  status: "processing",
  locked_at: "2026-08-29T00:00:00Z",
  locked_by: "worker-1",
  processed_at: null,
  last_error: null,
  created_at: "2026-08-29T00:00:00Z",
  updated_at: "2026-08-29T00:00:00Z",
};

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("outbox queue: claimOutboxEvents calls the RPC with exact positional parameters and maps every returned row", () => {
  it("sends [workerId, batchSize, leaseSeconds] and maps the array response", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([EVENT_ROW]);
    });
    const { claimOutboxEvents } = await import("../../workers/outbox/queue");

    const result = await claimOutboxEvents("worker-1", 5, 30);

    expect(captured).toEqual(["worker-1", 5, 30]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "event-1", eventType: "report.created", schemaVersion: 1, aggregateType: "report", status: "processing", lockedBy: "worker-1" });
  });

  it("defaults batchSize=10, leaseSeconds=60 when omitted", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([]);
    });
    const { claimOutboxEvents } = await import("../../workers/outbox/queue");

    await claimOutboxEvents("worker-1");

    expect(captured).toEqual(["worker-1", 10, 60]);
  });

  it("maps a CODE: message RPC error onto OutboxQueueError with its original code", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("INVALID_BATCH_SIZE: batch size must be between 1 and 100");
    });
    const { claimOutboxEvents, OutboxQueueError } = await import("../../workers/outbox/queue");

    const error: unknown = await claimOutboxEvents("worker-1", 0).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OutboxQueueError);
    expect((error as InstanceType<typeof OutboxQueueError>).code).toBe("INVALID_BATCH_SIZE");
  });
});

describe("outbox queue: completeOutboxEvent sends exact positional parameters, coercing a missing error to an empty string (never null)", () => {
  it("success outcome sends [eventId, workerId, true, false, '']", async () => {
    const succeededRow = { ...EVENT_ROW, status: "succeeded", locked_at: null, locked_by: null };
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([succeededRow]);
    });
    const { completeOutboxEvent } = await import("../../workers/outbox/queue");

    const result = await completeOutboxEvent("event-1", "worker-1", { success: true });

    expect(captured).toEqual(["event-1", "worker-1", true, false, ""]);
    expect(result.status).toBe("succeeded");
  });

  it("retryable failure outcome sends [eventId, workerId, false, false, errorText]", async () => {
    const pendingRow = { ...EVENT_ROW, status: "pending", locked_at: null, locked_by: null, last_error: "transient" };
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([pendingRow]);
    });
    const { completeOutboxEvent } = await import("../../workers/outbox/queue");

    await completeOutboxEvent("event-1", "worker-1", { success: false, error: "transient" });

    expect(captured).toEqual(["event-1", "worker-1", false, false, "transient"]);
  });

  it("permanent failure outcome sends permanent=true", async () => {
    const deadRow = { ...EVENT_ROW, status: "dead_letter", locked_at: null, locked_by: null, last_error: "permanent" };
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      captured = params;
      return queryReturning([deadRow]);
    });
    const { completeOutboxEvent } = await import("../../workers/outbox/queue");

    await completeOutboxEvent("event-1", "worker-1", { success: false, permanent: true, error: "permanent" });

    expect(captured).toEqual(["event-1", "worker-1", false, true, "permanent"]);
  });

  it("maps LEASE_LOST onto OutboxQueueError with that exact code -- a worker completing an event it no longer owns is rejected, not silently accepted", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("LEASE_LOST: this event is no longer leased by this worker");
    });
    const { completeOutboxEvent, OutboxQueueError } = await import("../../workers/outbox/queue");

    const error: unknown = await completeOutboxEvent("event-1", "stale-worker", { success: true }).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OutboxQueueError);
    expect((error as InstanceType<typeof OutboxQueueError>).code).toBe("LEASE_LOST");
  });
});
