import { beforeEach, describe, expect, it, vi } from "vitest";

// services/notifications.ts's data-access boundary is lib/db/pool.ts's
// withActorTransaction/callRpc -- mocked here at that boundary, same "mock the thin
// data-access layer, exercise the service's own logic for real" pattern used across the
// native-Postgres migration's test suite.
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

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("notifications service: getMyNotifications", () => {
  it("selects the content-free column set, ordered newest first, page-sized to 50 by default -- never a denormalized report title", async () => {
    let notificationsSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.notifications")) {
        notificationsSql = sql;
        return queryReturning([{ id: "n1", category: "report_activity", notification_type: "report_created", report_id: "r1", program_id: "p1", organization_id: "o1", occurred_at: "2026-08-29T00:00:00Z", created_at: "2026-08-29T00:01:00Z", read_at: null }]);
      }
      if (sql.includes("from public.programs")) return queryReturning([{ id: "p1", name: "CloudVault" }]);
      throw new Error(`unexpected query ${sql}`);
    });
    const { getMyNotifications } = await import("../../services/notifications");

    const result = await getMyNotifications();

    expect(notificationsSql).not.toMatch(/title|description/);
    expect(notificationsSql).toContain("order by created_at desc");
    // Fewer rows than the page size -> no next page.
    expect(result).toEqual({
      items: [{ id: "n1", category: "report_activity", notificationType: "report_created", reportId: "r1", programId: "p1", organizationId: "o1", occurredAt: "2026-08-29T00:00:00Z", createdAt: "2026-08-29T00:01:00Z", readAt: null, programName: "CloudVault" }],
      nextCursor: null,
    });
  });

  it("degrades the program name to null (never throws) when the program row is unavailable to this recipient (no matching row comes back from the second, RLS-scoped query)", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.notifications")) {
        return queryReturning([{ id: "n1", category: "report_activity", notification_type: "report_created", report_id: "r1", program_id: "p1", organization_id: "o1", occurred_at: "2026-08-29T00:00:00Z", created_at: "2026-08-29T00:01:00Z", read_at: null }]);
      }
      if (sql.includes("from public.programs")) return queryReturning([]);
      throw new Error(`unexpected query ${sql}`);
    });
    const { getMyNotifications } = await import("../../services/notifications");

    const result = await getMyNotifications();

    expect(result.items[0].programName).toBeNull();
  });

  it("returns an empty page rather than null when there are no notifications yet, and skips the program lookup entirely", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from public.notifications")) return queryReturning([]);
      throw new Error(`unexpected query ${sql}`);
    });
    fakeClient.query.mockImplementation(query);
    const { getMyNotifications } = await import("../../services/notifications");

    expect(await getMyNotifications()).toEqual({ items: [], nextCursor: null });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("applies a decoded cursor as a created_at < filter, and clamps an oversized requested page size", async () => {
    const { encodeCursor } = await import("../../lib/pagination");
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("from public.notifications")) {
        capturedSql = sql;
        capturedParams = params;
        return queryReturning([]);
      }
      throw new Error(`unexpected query ${sql}`);
    });
    const { getMyNotifications } = await import("../../services/notifications");

    await getMyNotifications(encodeCursor("2026-08-29T00:00:00Z", "00000000-0000-4000-8000-000000000019"), 9999);

    expect(capturedSql).toContain("created_at < $1");
    expect(capturedParams[0]).toBe("2026-08-29T00:00:00Z");
    expect(capturedParams[1]).toBe(100); // clamped to MAX_PAGE_SIZE
  });
});

describe("notifications service: markNotificationRead", () => {
  it("calls mark_notification_read with the notification id, no recipient id -- the server derives the recipient from auth.uid()", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("mark_notification_read")) {
        captured = params;
        return queryReturning([{ id: "n1" }]);
      }
      return queryReturning([]);
    });
    const { markNotificationRead } = await import("../../services/notifications");

    await markNotificationRead("n1");

    expect(captured).toEqual(["n1"]);
  });

  it("maps a CODE: message RPC error onto OrganizationServiceError", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("NOTIFICATION_NOT_FOUND: no such notification for this recipient");
    });
    const { markNotificationRead, OrganizationServiceError } = await import("../../services/notifications");

    const error: unknown = await markNotificationRead("missing").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("NOTIFICATION_NOT_FOUND");
  });
});

describe("notifications service: preferences", () => {
  it("getMyNotificationPreferences maps category/email_enabled/is_mandatory with no parameters -- self-only", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("get_my_notification_preferences")) {
        captured = params;
        return queryReturning([
          { category: "report_activity", email_enabled: true, is_mandatory: false },
          { category: "bounty_activity", email_enabled: true, is_mandatory: true },
        ]);
      }
      return queryReturning([]);
    });
    const { getMyNotificationPreferences } = await import("../../services/notifications");

    const result = await getMyNotificationPreferences();

    expect(captured).toEqual([]);
    expect(result).toEqual([
      { category: "report_activity", emailEnabled: true, isMandatory: false },
      { category: "bounty_activity", emailEnabled: true, isMandatory: true },
    ]);
  });

  it("setNotificationPreference calls set_notification_preference with the exact category and boolean", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("set_notification_preference")) {
        captured = params;
        return queryReturning([{ user_id: "u1", category: "report_activity", email_enabled: false, updated_at: "2026-08-29T00:00:00Z" }]);
      }
      return queryReturning([]);
    });
    const { setNotificationPreference } = await import("../../services/notifications");

    await setNotificationPreference("report_activity", false);

    expect(captured).toEqual(["report_activity", false]);
  });

  it("a CATEGORY_NOT_CONFIGURABLE error (attempting to disable a mandatory category) maps to OrganizationServiceError", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("CATEGORY_NOT_CONFIGURABLE: bounty_activity cannot be disabled -- it is a mandatory notification category");
    });
    const { setNotificationPreference, OrganizationServiceError } = await import("../../services/notifications");

    const error: unknown = await setNotificationPreference("bounty_activity" as never, false).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("CATEGORY_NOT_CONFIGURABLE");
  });
});
