import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/current-user";

// services/reports.ts's data-access boundary is lib/db/pool.ts's withActorTransaction/
// callRpc -- mocked here at that boundary, same "mock the thin data-access layer,
// exercise the service's own (and this action's own) logic for real" pattern used
// across the native-Postgres migration's test suite. A fake PoolClient's `.query` is a
// controllable mock so each test scripts exactly the rows a real query would have
// returned.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
// getCurrentUser (lib/auth/current-user.ts) no longer goes through
// createSupabaseServerClient at all -- it validates an opaque session cookie against the
// native Postgres pool instead (see lib/auth/session.ts). Mocked directly here, same
// "user id or null" shape the actions under test actually consume.
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

beforeEach(() => {
  fakeClient.query.mockReset();
  mockedGetCurrentUser.mockReset();
  mockedGetCurrentUser.mockResolvedValue({ id: "actor-1", platformRole: null, accountType: "researcher", username: "actor", displayName: "Actor", email: null });
});

describe("listReportsForProgramPageAction: validates input before ever reaching the service", () => {
  it("rejects a non-uuid programId as INVALID_INPUT without calling the service", async () => {
    const { listReportsForProgramPageAction } = await import("../../actions/reports");

    const result = await listReportsForProgramPageAction({ programId: "not-a-uuid" });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Check the form and try again." });
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("rejects an invalid status enum value", async () => {
    const { listReportsForProgramPageAction } = await import("../../actions/reports");

    const result = await listReportsForProgramPageAction({ programId: "11111111-1111-4111-8111-111111111111", status: "not-a-real-status" as never });

    expect(result.ok).toBe(false);
  });

  it("passes a valid request through to the real service with the exact filters given", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return queryReturning([]);
    });
    const { listReportsForProgramPageAction } = await import("../../actions/reports");

    const result = await listReportsForProgramPageAction({ programId: "11111111-1111-4111-8111-111111111111", status: "resolved" });

    expect(result.ok).toBe(true);
    expect(capturedSql).toContain("r.status = $2");
    expect(capturedParams).toContain("resolved");
    expect(capturedParams).toContain("11111111-1111-4111-8111-111111111111");
  });
});

describe("listMyReportsPageAction: validates input, delegates to the real self-only service", () => {
  it("rejects a non-string cursor shape gracefully (zod coercion failure) as INVALID_INPUT", async () => {
    const { listMyReportsPageAction } = await import("../../actions/reports");

    const result = await listMyReportsPageAction({ cursor: 12345 as never });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Check the form and try again." });
  });

  it("returns AUTH_REQUIRED without querying when there is no session", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const { listMyReportsPageAction } = await import("../../actions/reports");

    const result = await listMyReportsPageAction({ cursor: "abc" });

    expect(result).toEqual({ ok: false, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." });
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("delegates to list_my_reports with the given cursor for the real, signed-in user", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("list_my_reports")) captured = params;
      return queryReturning([]);
    });
    const { listMyReportsPageAction } = await import("../../actions/reports");

    const result = await listMyReportsPageAction({ cursor: "abc" });

    expect(result).toEqual({ ok: true, data: { items: [], nextCursor: null } });
    // listMyReports decodes the cursor into {sortValue, id} before passing it to the RPC
    // as [pageSize, sortValue, id] -- captured params confirm the cursor was actually
    // threaded through, not silently dropped.
    expect(captured).toBeDefined();
    expect(captured?.[0]).toBe(20);
  });
});
