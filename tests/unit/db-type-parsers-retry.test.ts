import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ensureEnumArrayTypeParsers } from "../../lib/db/type-parsers";

describe("ensureEnumArrayTypeParsers: a failed first attempt is retried", () => {
  it("does not cache a rejected registration, so the server recovers after a database blip", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await expect(ensureEnumArrayTypeParsers(pool)).rejects.toThrow(/connection timeout/);
    // Before the fix every later call replayed this same failure without touching the database.
    await expect(ensureEnumArrayTypeParsers(pool)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);

    // Once registered, it is not re-queried.
    await ensureEnumArrayTypeParsers(pool);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
