import { describe, expect, it } from "vitest";
import { types as pgTypes } from "pg";
import { registerDateTimeTypeParsers } from "@/lib/db/type-parsers";

// No live Postgres connection exists in the unit test harness (every service test mocks
// lib/db/pool.ts's withActorTransaction/callRpc at the module boundary instead -- see
// e.g. tests/unit/report-triage-service.test.ts's own header comment), so this test
// cannot round-trip a real query through `pg`. It instead calls the exact function every
// real entry point (lib/db/pool.ts, workers/outbox/db-pool.ts, and each scripts/
// live-test-*.mjs) relies on, then invokes pg's own registered parser for each OID
// directly -- the same call pg's wire protocol layer makes internally when a row with
// that column type arrives -- confirming what a real query result would actually
// contain, not a reimplementation of the fix under a different name.
describe("lib/db/type-parsers: registerDateTimeTypeParsers", () => {
  registerDateTimeTypeParsers();

  it("registers a parser for date (1082), timestamp (1114), and timestamptz (1184) that returns a string, not a Date", () => {
    for (const oid of [1082, 1114, 1184]) {
      const parser = pgTypes.getTypeParser(oid);
      const result = parser("2026-09-08 17:47:12.988+00");
      expect(typeof result).toBe("string");
      expect(result instanceof Date).toBe(false);
    }
  });

  it("returns a real, parseable ISO 8601 string for a timestamptz value, not a hand-rolled format", () => {
    const parser = pgTypes.getTypeParser(1184);
    const result = parser("2026-09-08 17:47:12.988+00");

    expect(result).toBe("2026-09-08T17:47:12.988Z");
    expect(new Date(result).toString()).not.toBe("Invalid Date");
  });

  it("returns UTC midnight for a bare date value -- the exact case that previously produced 'Invalid Date' downstream (see lib/format-date.ts's toDateOnlyString)", () => {
    const parser = pgTypes.getTypeParser(1082);
    const result = parser("2026-09-08");

    expect(result).toBe("2026-09-08T00:00:00.000Z");
  });

  it("is idempotent -- calling it again does not throw or double-register", () => {
    expect(() => {
      registerDateTimeTypeParsers();
      registerDateTimeTypeParsers();
    }).not.toThrow();
    const parser = pgTypes.getTypeParser(1184);
    expect(typeof parser("2026-09-08 00:00:00+00")).toBe("string");
  });
});
