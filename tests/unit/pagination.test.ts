import { describe, expect, it } from "vitest";
import { clampPageSize, decodeCursor, encodeCursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../lib/pagination";

describe("pagination: cursor encode/decode round-trips, opaque to the caller", () => {
  it("round-trips a (sortValue, id) pair", () => {
    const cursor = encodeCursor("2026-08-29T00:00:00Z", "row-1");
    expect(decodeCursor(cursor)).toEqual({ sortValue: "2026-08-29T00:00:00Z", id: "row-1" });
  });

  it("is not the raw, human-readable value -- an opaque token, not a documented shape", () => {
    const cursor = encodeCursor("2026-08-29T00:00:00Z", "row-1");
    expect(cursor).not.toContain("2026-08-29");
    expect(cursor).not.toContain("row-1");
  });

  it("returns null for garbage input rather than throwing", () => {
    expect(decodeCursor("not-a-real-cursor-!!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("handles a sortValue that itself contains the '|' separator by splitting only on the first occurrence", () => {
    const cursor = encodeCursor("a|b|c", "row-1");
    expect(decodeCursor(cursor)).toEqual({ sortValue: "a|b|c", id: "row-1" });
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
