import { describe, expect, it } from "vitest";
import { clampPageSize, decodeCursor, encodeCursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../lib/pagination";

const ID = "3f0c8a8e-1b2d-4c5e-8f9a-0b1c2d3e4f50";

describe("pagination: cursor encode/decode round-trips, opaque to the caller", () => {
  it("round-trips a (sortValue, id) pair", () => {
    const cursor = encodeCursor("2026-08-29T00:00:00Z", ID);
    expect(decodeCursor(cursor)).toEqual({ sortValue: "2026-08-29T00:00:00Z", id: ID });
  });

  it("is not the raw, human-readable value -- an opaque token, not a documented shape", () => {
    const cursor = encodeCursor("2026-08-29T00:00:00Z", ID);
    expect(cursor).not.toContain("2026-08-29");
    expect(cursor).not.toContain(ID);
  });

  it("returns null for garbage input rather than throwing", () => {
    expect(decodeCursor("not-a-real-cursor-!!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("refuses a forged id half (it reached the query and caused a 500)", () => {
    expect(decodeCursor(Buffer.from("x|1 OR 1=1", "utf8").toString("base64url"))).toBeNull();
  });

  it("handles a sortValue that itself contains the '|' separator by splitting only on the first occurrence", () => {
    const cursor = encodeCursor("a|b|c", ID);
    expect(decodeCursor(cursor)).toEqual({ sortValue: "a|b|c", id: ID });
  });
});

describe("pagination: clampPageSize never trusts a client-supplied limit large enough to defeat pagination", () => {
  it("defaults to DEFAULT_PAGE_SIZE when nothing is requested", () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps an oversized request down to MAX_PAGE_SIZE", () => {
    expect(clampPageSize(999999)).toBe(MAX_PAGE_SIZE);
  });

  it("clamps a zero or negative request up to 1, never zero rows or a negative limit", () => {
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-5)).toBe(1);
  });

  it("floors a fractional request", () => {
    expect(clampPageSize(10.9)).toBe(10);
  });

  it("passes through a reasonable, in-range request unchanged", () => {
    expect(clampPageSize(30)).toBe(30);
  });
});
