import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimOutboxEvents, completeOutboxEvent } from "../../workers/outbox/queue";
import { getHandlers, PermanentHandlerError, RetryableHandlerError } from "../../workers/outbox/registry";
import type { OutboxEvent } from "../../types/outbox";

vi.mock("../../workers/outbox/queue", () => ({ claimOutboxEvents: vi.fn(), completeOutboxEvent: vi.fn() }));
vi.mock("../../workers/outbox/registry", async () => {
  const actual = await vi.importActual<typeof import("../../workers/outbox/registry")>("../../workers/outbox/registry");
  return { ...actual, getHandlers: vi.fn() };
});

const mockedClaim = vi.mocked(claimOutboxEvents);
const mockedComplete = vi.mocked(completeOutboxEvent);
const mockedGetHandlers = vi.mocked(getHandlers);

const EVENT: OutboxEvent = {
  id: "event-1",
  eventType: "report.created",
  schemaVersion: 1,
  aggregateType: "report",
  aggregateId: "report-1",
  organizationId: "org-1",
  payload: {},
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
};

beforeEach(() => {
  mockedClaim.mockReset();
  mockedComplete.mockReset().mockResolvedValue(EVENT);
  mockedGetHandlers.mockReset();
});

describe("outbox worker: processEvent dispatches to every registered handler, never guessing at an unknown type", () => {
  it("an unknown event_type:schema_version is dead-lettered immediately -- no handler is ever invoked", async () => {
    mockedGetHandlers.mockReturnValue([]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: false, permanent: true, error: expect.stringContaining("no handler registered for report.created:1") });
  });

  it("a successful handler completes the event as success", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    mockedGetHandlers.mockReturnValue([handler]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(handler).toHaveBeenCalledWith(EVENT);
    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: true });
  });

  it("a PermanentHandlerError is treated as permanent -- dead-lettered regardless of remaining attempts", async () => {
    const handler = vi.fn().mockRejectedValue(new PermanentHandlerError("malformed payload"));
    mockedGetHandlers.mockReturnValue([handler]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: false, permanent: true, error: "malformed payload" });
  });

  it("a RetryableHandlerError (or any other thrown error) is treated as retryable -- the safe default, never silently swallowed", async () => {
    const handler = vi.fn().mockRejectedValue(new RetryableHandlerError("dependency unavailable"));
    mockedGetHandlers.mockReturnValue([handler]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: false, permanent: false, error: "dependency unavailable" });
  });

  it("a plain, unclassified thrown error also defaults to retryable, never crashes the caller", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    mockedGetHandlers.mockReturnValue([handler]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await expect(processEvent(EVENT, "worker-1")).resolves.toBeDefined();
    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: false, permanent: false, error: "boom" });
  });

  it("multiple independent consumers for the same key all run, concurrently -- the event succeeds only if every consumer succeeds", async () => {
    const consumerA = vi.fn().mockResolvedValue(undefined);
    const consumerB = vi.fn().mockResolvedValue(undefined);
    mockedGetHandlers.mockReturnValue([consumerA, consumerB]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(consumerA).toHaveBeenCalledWith(EVENT);
    expect(consumerB).toHaveBeenCalledWith(EVENT);
    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: true });
  });

  it("one consumer failing retryably retries the WHOLE event even though a sibling consumer succeeded -- consumers must be idempotent for exactly this reason", async () => {
    const succeeds = vi.fn().mockResolvedValue(undefined);
    const fails = vi.fn().mockRejectedValue(new RetryableHandlerError("transient"));
    mockedGetHandlers.mockReturnValue([succeeds, fails]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(succeeds).toHaveBeenCalledWith(EVENT);
    expect(fails).toHaveBeenCalledWith(EVENT);
    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: false, permanent: false, error: "transient" });
  });

  it("a mix of one permanent and one retryable failure still retries the whole event -- only ALL-permanent failures dead-letter", async () => {
    const permanentlyFails = vi.fn().mockRejectedValue(new PermanentHandlerError("will never work"));
    const retryablyFails = vi.fn().mockRejectedValue(new RetryableHandlerError("transient"));
    mockedGetHandlers.mockReturnValue([permanentlyFails, retryablyFails]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: false, permanent: false, error: expect.stringContaining("will never work") });
  });

  it("every consumer failing permanently dead-letters the event", async () => {
    const firstPermanent = vi.fn().mockRejectedValue(new PermanentHandlerError("bad shape"));
    const secondPermanent = vi.fn().mockRejectedValue(new PermanentHandlerError("also bad"));
    mockedGetHandlers.mockReturnValue([firstPermanent, secondPermanent]);
    const { processEvent } = await import("../../workers/outbox/worker");

    await processEvent(EVENT, "worker-1");

    expect(mockedComplete).toHaveBeenCalledWith("event-1", "worker-1", { success: false, permanent: true, error: expect.stringContaining("bad shape") });
  });
});

describe("outbox worker: runBatch claims once and processes every claimed event concurrently, returning the claimed count", () => {
  it("processes zero events without error when nothing is claimable", async () => {
    mockedClaim.mockResolvedValue([]);
    const { runBatch } = await import("../../workers/outbox/worker");

    const count = await runBatch({ workerId: "worker-1" });

    expect(count).toBe(0);
    expect(mockedComplete).not.toHaveBeenCalled();
  });

  it("processes every event in the claimed batch, independently -- one failing event never blocks another's completion", async () => {
    const okHandler = vi.fn().mockResolvedValue(undefined);
    const failHandler = vi.fn().mockRejectedValue(new PermanentHandlerError("bad"));
    mockedGetHandlers.mockImplementation((eventType) => (eventType === "will.succeed" ? [okHandler] : [failHandler]));
    mockedClaim.mockResolvedValue([
      { ...EVENT, id: "event-ok", eventType: "will.succeed" },
      { ...EVENT, id: "event-fail", eventType: "will.fail" },
    ]);
    const { runBatch } = await import("../../workers/outbox/worker");

    const count = await runBatch({ workerId: "worker-1", batchSize: 10, leaseSeconds: 60 });

    expect(mockedClaim).toHaveBeenCalledWith("worker-1", 10, 60);
    expect(count).toBe(2);
    expect(mockedComplete).toHaveBeenCalledWith("event-ok", "worker-1", { success: true });
    expect(mockedComplete).toHaveBeenCalledWith("event-fail", "worker-1", { success: false, permanent: true, error: "bad" });
  });
});
