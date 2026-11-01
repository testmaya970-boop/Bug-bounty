import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/db/pool.ts retries a connect that timed out once (no query ran, so it is safe), and
// fails fast on anything else.
const connect = vi.fn();
vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(() => ({ connect, on: vi.fn(), query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));
vi.mock("@/lib/env", () => ({ getNativeEnv: () => ({ DATABASE_URL: "postgres://test" }) }));
vi.mock("@/lib/db/type-parsers", () => ({ ensureEnumArrayTypeParsers: vi.fn().mockResolvedValue(undefined) }));

const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };

beforeEach(() => {
  connect.mockReset();
  client.release.mockReset();
});

describe("withClient: connecting", () => {
  it("retries once when opening a connection timed out, then runs the work", async () => {
    connect.mockRejectedValueOnce(new Error("timeout exceeded when trying to connect")).mockResolvedValueOnce(client);
    const { withClient } = await import("../../lib/db/pool");
    await expect(withClient(async () => "done")).resolves.toBe("done");
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("does not retry other connection errors", async () => {
    connect.mockRejectedValueOnce(new Error('password authentication failed for user "x"'));
    const { withClient } = await import("../../lib/db/pool");
    await expect(withClient(async () => "done")).rejects.toThrow(/password authentication failed/);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
