import { beforeEach, describe, expect, it, vi } from "vitest";

// actions/notifications.ts delegates to services/notifications.ts, whose data-access
// boundary is lib/db/pool.ts's withActorTransaction -- mocked here at that boundary, same
// "mock the thin data-access layer, exercise the service's own logic for real" pattern
// used across the native-Postgres migration's test suite.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});

let currentUser: { id: string } | null = { id: "actor-1" };
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(() => Promise.resolve(currentUser ? { id: currentUser.id, platformRole: null, username: "actor", displayName: "Actor", email: null } : null)),
}));

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

beforeEach(() => {
  fakeClient.query.mockReset();
  fakeClient.query.mockImplementation(async (sql: string) => {
    if (sql.includes("from public.notifications")) return queryReturning([]);
    return queryReturning([]);
  });
  currentUser = { id: "actor-1" };
});

describe("listNotificationsPageAction: validates input, delegates to the real self-only service", () => {
  it("rejects a non-string cursor as INVALID_INPUT without calling the service", async () => {
    const { listNotificationsPageAction } = await import("../../actions/notifications");

    const result = await listNotificationsPageAction({ cursor: 12345 as never });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Check the form and try again." });
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("delegates to the real getMyNotifications with the given cursor, self-only (no session -> empty page)", async () => {
    currentUser = null;
    const { listNotificationsPageAction } = await import("../../actions/notifications");

    const result = await listNotificationsPageAction({ cursor: "abc" });

    expect(result).toEqual({ ok: true, data: { items: [], nextCursor: null } });
  });

  it("succeeds with no cursor (first page)", async () => {
    const { listNotificationsPageAction } = await import("../../actions/notifications");

    const result = await listNotificationsPageAction({});

    expect(result.ok).toBe(true);
  });
});
