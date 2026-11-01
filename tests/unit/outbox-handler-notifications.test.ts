import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeEmailProvider } from "../../lib/email-provider";
import { PermanentHandlerError, RetryableHandlerError } from "../../workers/outbox/registry";
import type { OutboxEvent } from "../../types/outbox";

// workers/outbox/handlers/notifications/notification-handler.ts's data-access boundary
// is workers/outbox/db-pool.ts's withServiceRoleTransaction/callRpc -- mocked here at
// that boundary, same "mock the thin data-access layer, exercise the handler's own
// logic for real" pattern used across the native-Postgres migration's test suite. Each
// of the four RPCs this handler calls in sequence is distinguished by a substring match
// on the SQL text (the function name callRpc interpolates), same convention every other
// converted test file in this suite uses.
const fakeClient = { query: vi.fn() };

vi.mock("../../workers/outbox/db-pool", async () => {
  const actual = await vi.importActual<typeof import("../../workers/outbox/db-pool")>("../../workers/outbox/db-pool");
  return {
    ...actual,
    withServiceRoleTransaction: vi.fn((fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("../../lib/email-provider", () => ({ activeEmailProvider: { name: "test", send: vi.fn() } }));

const mockedSend = vi.mocked(activeEmailProvider.send);

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

function baseEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "event-1",
    eventType: "report.resolved",
    schemaVersion: 1,
    aggregateType: "report",
    aggregateId: "report-1",
    organizationId: "org-1",
    payload: { report_id: "report-1" },
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

const NOTIFICATION = { id: "notif-1", recipient_id: "researcher-1" };
const DELIVERY_PENDING = { id: "delivery-1", notification_id: "notif-1", channel: "email", state: "pending", attempts: 0, max_attempts: 5 };
const PREPARED = {
  deliverable: true,
  reason: null,
  recipient_email: "researcher@example.test",
  recipient_display_name: "Researcher One",
  report_title: "XSS in login form",
  program_name: "Acme Program",
  organization_name: "Acme Corp",
  notification_type: "report_resolved",
  occurred_at: "2026-08-29T00:00:00Z",
};

/** Maps each of the four RPC names this handler calls, in order, to a canned
 * rows-array (or a thrown error) -- mirrors the real callRpc's `select * from fn(...)`
 * shape, distinguished by matching the function name inside the query text. */
function mockRpcs(overrides: Record<string, unknown[] | { errorMessage: string }>) {
  fakeClient.query.mockImplementation(async (sql: string) => {
    for (const [fnName, result] of Object.entries(overrides)) {
      if (sql.includes(fnName)) {
        if (!Array.isArray(result)) throw new Error(result.errorMessage);
        return queryReturning(result);
      }
    }
    throw new Error(`unexpected rpc call, sql: ${sql}`);
  });
}

beforeEach(() => {
  fakeClient.query.mockReset();
  mockedSend.mockReset();
});

describe("notification handler: createNotificationHandler", () => {
  it("rejects a payload missing report_id as a PermanentHandlerError -- never succeeds on retry", async () => {
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");
    const malformed = baseEvent({ payload: {} });

    const error: unknown = await handler(malformed).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(PermanentHandlerError);
  });

  it("routes, ensures a delivery, prepares content, sends via the active email provider, and records success -- full happy path", async () => {
    let recordParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("route_and_create_notifications")) return queryReturning([NOTIFICATION]);
      if (sql.includes("ensure_email_delivery")) return queryReturning([DELIVERY_PENDING]);
      if (sql.includes("prepare_notification_email")) return queryReturning([PREPARED]);
      if (sql.includes("record_email_delivery_result")) {
        recordParams = params;
        return queryReturning([{ ...DELIVERY_PENDING, state: "delivered" }]);
      }
      throw new Error(`unexpected rpc call, sql: ${sql}`);
    });
    mockedSend.mockResolvedValue({ success: true, providerReference: "dev-delivery-1" });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    await handler(baseEvent());

    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ to: "researcher@example.test", idempotencyKey: "delivery-1" }));
    expect(recordParams).toEqual(["delivery-1", true, false, "dev-delivery-1", null]);
  });

  it("never sends an email for a delivery already 'delivered' -- idempotent, skips re-sending", async () => {
    mockRpcs({
      route_and_create_notifications: [NOTIFICATION],
      ensure_email_delivery: [{ ...DELIVERY_PENDING, state: "delivered" }],
    });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    await handler(baseEvent());

    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("never sends an email when prepare_notification_email reports not deliverable (e.g. recipient no longer authorized)", async () => {
    mockRpcs({
      route_and_create_notifications: [NOTIFICATION],
      ensure_email_delivery: [DELIVERY_PENDING],
      prepare_notification_email: [{ deliverable: false, reason: "RECIPIENT_NO_LONGER_AUTHORIZED", recipient_email: null, recipient_display_name: null, report_title: null, program_name: null, organization_name: null, notification_type: null, occurred_at: null }],
    });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    await handler(baseEvent());

    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("a retryable send failure surfaces as RetryableHandlerError so the outer outbox event retries", async () => {
    mockRpcs({
      route_and_create_notifications: [NOTIFICATION],
      ensure_email_delivery: [DELIVERY_PENDING],
      prepare_notification_email: [PREPARED],
      record_email_delivery_result: [{ ...DELIVERY_PENDING, state: "retryable_failure" }],
    });
    mockedSend.mockResolvedValue({ success: false, permanent: false, error: "provider timeout" });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    const error: unknown = await handler(baseEvent()).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(RetryableHandlerError);
  });

  it("a permanent send failure does NOT retry the whole event -- it is recorded and the handler returns normally", async () => {
    let recordParams: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("route_and_create_notifications")) return queryReturning([NOTIFICATION]);
      if (sql.includes("ensure_email_delivery")) return queryReturning([DELIVERY_PENDING]);
      if (sql.includes("prepare_notification_email")) return queryReturning([PREPARED]);
      if (sql.includes("record_email_delivery_result")) {
        recordParams = params;
        return queryReturning([{ ...DELIVERY_PENDING, state: "permanent_failure" }]);
      }
      throw new Error(`unexpected rpc call, sql: ${sql}`);
    });
    mockedSend.mockResolvedValue({ success: false, permanent: true, error: "invalid address" });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    await expect(handler(baseEvent())).resolves.toBeUndefined();
    expect(recordParams).toEqual(["delivery-1", false, true, null, "invalid address"]);
  });

  it("PROVENANCE_MISMATCH/REPORT_NOT_FOUND/INVALID_NOTIFICATION_TYPE from route_and_create_notifications are permanent", async () => {
    for (const message of ["PROVENANCE_MISMATCH: report's current status does not match the claimed notification type", "REPORT_NOT_FOUND: referenced report no longer exists", "INVALID_NOTIFICATION_TYPE: bogus is not a recognized notification type"]) {
      mockRpcs({ route_and_create_notifications: { errorMessage: message } });
      const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
      const handler = createNotificationHandler("report_resolved");

      const error: unknown = await handler(baseEvent()).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(PermanentHandlerError);
    }
  });

  it("an unrecognized routing error (e.g. a dropped connection) is retryable, the safe default", async () => {
    mockRpcs({ route_and_create_notifications: { errorMessage: "connection reset" } });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    const error: unknown = await handler(baseEvent()).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(RetryableHandlerError);
  });

  it("zero recipients (an empty array back from routing) is a clean no-op -- no email attempted, no error", async () => {
    mockRpcs({ route_and_create_notifications: [] });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    await expect(handler(baseEvent())).resolves.toBeUndefined();
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

// Turn 8: closes the notification gap the Turn 5 outbox trace found -- report.message_posted
// and the start_triage/accept_report state transitions now emit a real outbox event
// (db/migrations/202609090007_message_and_triage_notifications.sql) and are registered
// against this same handler factory (workers/outbox/handlers/index.ts). The actor-scoped
// routing itself (sender never notified of their own message) lives in
// route_and_create_notifications, a SQL function -- proven live against a real database this
// session (see the turn's own output) and by the static source checks below. What IS real,
// testable TypeScript here is that this handler passes the event payload's actor_id through
// to the RPC call -- the one piece of plumbing between the outbox event and that SQL
// function's own routing decision.
describe("notification handler: report_message_posted actor-scoping plumbing", () => {
  it("passes payload.actor_id as the RPC's 5th argument when present", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("route_and_create_notifications")) {
        capturedArgs = params;
        return queryReturning([{ id: "notif-1", recipient_id: "org-admin-1" }]);
      }
      if (sql.includes("ensure_email_delivery")) return queryReturning([{ ...DELIVERY_PENDING, state: "delivered" }]);
      throw new Error(`unexpected rpc call, sql: ${sql}`);
    });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_message_posted");
    const event = baseEvent({
      eventType: "report.message_posted",
      payload: { report_id: "report-1", actor_id: "researcher-1", message_id: "msg-1", visibility: "researcher_visible" },
    });

    await handler(event);

    expect(capturedArgs).toEqual(["event-1", "report_message_posted", "report-1", "2026-08-29T00:00:00Z", "researcher-1"]);
  });

  it("passes null as the 5th argument for a notification type with no actor_id in its payload (every pre-existing type)", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("route_and_create_notifications")) {
        capturedArgs = params;
        return queryReturning([]);
      }
      throw new Error(`unexpected rpc call, sql: ${sql}`);
    });
    const { createNotificationHandler } = await import("../../workers/outbox/handlers/notifications/notification-handler");
    const handler = createNotificationHandler("report_resolved");

    await handler(baseEvent());

    expect(capturedArgs).toEqual(["event-1", "report_resolved", "report-1", "2026-08-29T00:00:00Z", null]);
  });
});
