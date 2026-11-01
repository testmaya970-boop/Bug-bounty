import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermanentHandlerError, RetryableHandlerError } from "../../workers/outbox/registry";
import type { OutboxEvent } from "../../types/outbox";

// workers/outbox/handlers/report-created-v1.ts's data-access boundary is
// workers/outbox/db-pool.ts's withServiceRoleTransaction -- mocked here at that
// boundary, same "mock the thin data-access layer, exercise the handler's own logic for
// real" pattern used across the native-Postgres migration's test suite. A fake
// PoolClient's `.query` is a controllable mock so each test scripts exactly the rows a
// real query would have returned.
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

const VALID_PAYLOAD = {
  report_id: "report-1",
  program_id: "program-1",
  organization_id: "org-1",
  researcher_id: "researcher-1",
  title: "Reflected XSS",
  asset_type: "domain",
  display_target: "example.com",
};

const BASE_EVENT: OutboxEvent = {
  id: "event-1",
  eventType: "report.created",
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
};

function mockQueries(options: { reportOrgId?: string | null; reportExists?: boolean; upsertRows?: unknown[]; reportsQueryError?: string }) {
  const reportExists = options.reportExists ?? true;
  const upsertRows = options.upsertRows ?? [{ event_id: BASE_EVENT.id }];
  fakeClient.query.mockImplementation(async (sql: string) => {
    if (sql.includes("from public.reports")) {
      if (options.reportsQueryError) throw new Error(options.reportsQueryError);
      return queryReturning(reportExists ? [{ organization_id: options.reportOrgId ?? "org-1" }] : []);
    }
    if (sql.includes("insert into public.outbox_event_receipts")) {
      return queryReturning(upsertRows);
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("report.created v1 reference handler: payload validation", () => {
  it("rejects a payload missing a required field as a PermanentHandlerError -- this can never succeed on retry", async () => {
    const { handleReportCreatedV1 } = await import("../../workers/outbox/handlers/report-created-v1");
    const malformed = { ...BASE_EVENT, payload: { report_id: "report-1" } };

    const error: unknown = await handleReportCreatedV1(malformed).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });
});

describe("report.created v1 reference handler: defense-in-depth organization check", () => {
  it("rejects with PermanentHandlerError when the referenced report no longer exists", async () => {
    mockQueries({ reportExists: false });
    const { handleReportCreatedV1 } = await import("../../workers/outbox/handlers/report-created-v1");

    const error: unknown = await handleReportCreatedV1(BASE_EVENT).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });

  it("rejects with PermanentHandlerError when the event's organization_id does not match the report's real one", async () => {
    mockQueries({ reportOrgId: "a-different-org" });
    const { handleReportCreatedV1 } = await import("../../workers/outbox/handlers/report-created-v1");

    const error: unknown = await handleReportCreatedV1(BASE_EVENT).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
    expect((error as Error).message).toMatch(/organization_id/);
  });

  it("a transient read error on the reports table is retryable, not permanent", async () => {
    mockQueries({ reportsQueryError: "connection reset" });
    const { handleReportCreatedV1 } = await import("../../workers/outbox/handlers/report-created-v1");

    const error: unknown = await handleReportCreatedV1(BASE_EVENT).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(RetryableHandlerError);
  });
});

describe("report.created v1 reference handler: idempotency", () => {
  it("performs its side effect on first processing (a receipt row is inserted)", async () => {
    mockQueries({ upsertRows: [{ event_id: BASE_EVENT.id }] });
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { handleReportCreatedV1 } = await import("../../workers/outbox/handlers/report-created-v1");

    await handleReportCreatedV1(BASE_EVENT);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it("skips the side effect entirely when the receipt insert reports zero rows (already processed by this consumer)", async () => {
    mockQueries({ upsertRows: [] });
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { handleReportCreatedV1 } = await import("../../workers/outbox/handlers/report-created-v1");

    await handleReportCreatedV1(BASE_EVENT);

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
