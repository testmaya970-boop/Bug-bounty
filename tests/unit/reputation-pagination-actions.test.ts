import { beforeEach, describe, expect, it, vi } from "vitest";

// actions/reputation.ts delegates to services/reputation.ts, whose data-access boundary is
// lib/db/pool.ts's withActorTransaction -- mocked here at that boundary, same "mock the thin
// data-access layer, exercise the real action + service logic" pattern used across the
// native-Postgres migration's test suite.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/current-user";
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

beforeEach(() => {
  fakeClient.query.mockReset();
  mockedGetCurrentUser.mockReset();
  fakeClient.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe("listReputationLedgerPageAction: validates input, delegates to the real self-only service", () => {
  it("rejects a non-string cursor as INVALID_INPUT without calling the service", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "researcher-1", platformRole: null, username: "researcher-1", displayName: "Researcher", email: null } as never);
    const { listReputationLedgerPageAction } = await import("../../actions/reputation");

    const result = await listReputationLedgerPageAction({ cursor: 12345 as never });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Check the form and try again." });
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("returns AUTH_REQUIRED without calling the service when there is no session (no session -> auth-required error, not an empty page)", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const { listReputationLedgerPageAction } = await import("../../actions/reputation");

    const result = await listReputationLedgerPageAction({ cursor: "abc" });

    expect(result).toEqual({ ok: false, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." });
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("succeeds with no cursor (first page)", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "researcher-1", platformRole: null, username: "researcher-1", displayName: "Researcher", email: null } as never);
    const { listReputationLedgerPageAction } = await import("../../actions/reputation");

    const result = await listReputationLedgerPageAction({});

    expect(result.ok).toBe(true);
  });
});
