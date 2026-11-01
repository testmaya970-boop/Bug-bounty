import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, toDateOnlyString } from "../../lib/format-date";

const ISO = "2026-08-29T21:26:00.000Z";

describe("format-date: same instant always produces the same string (the SSR/CSR hydration invariant)", () => {
  it("formatDateTime is stable across repeated calls with the identical input", () => {
    const first = formatDateTime(ISO);
    for (let i = 0; i < 5; i += 1) {
      expect(formatDateTime(ISO)).toBe(first);
    }
  });

  it("formatDate is stable across repeated calls with the identical input", () => {
    const first = formatDate(ISO);
    for (let i = 0; i < 5; i += 1) {
      expect(formatDate(ISO)).toBe(first);
    }
  });

  it("formatDateTime does not vary with the host process's local timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      const pacific = formatDateTime(ISO);
      process.env.TZ = "Asia/Kolkata";
      const indian = formatDateTime(ISO);
      process.env.TZ = "UTC";
      const utc = formatDateTime(ISO);
      // Node reads TZ lazily per Date/Intl call, so all three must agree once the
      // formatter pins its own explicit timeZone -- this is the exact invariant the
      // live-browser-observed hydration bug violated (server and client silently
      // disagreeing on the ambient timezone/locale).
      expect(pacific).toBe(indian);
      expect(indian).toBe(utc);
    } finally {
      process.env.TZ = original;
    }
  });

  it("formatDateTime always resolves to the pinned en-US locale and UTC time zone, never the ambient default", () => {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).resolvedOptions();
    expect(resolved.locale).toBe("en-US");
    expect(resolved.timeZone).toBe("UTC");
  });

  it("formatDateTime renders a fixed 12-hour clock, never the ambient default's 24-hour style", () => {
    expect(formatDateTime(ISO)).toMatch(/\b(AM|PM)\b/);
  });
});

describe("format-date: exact rendering for a known instant", () => {
  it("formatDateTime renders date, 12-hour time, in UTC", () => {
    expect(formatDateTime(ISO)).toBe("Aug 29, 2026, 9:26 PM");
  });

  it("formatDate renders the date only, no time component", () => {
    expect(formatDate(ISO)).toBe("Aug 29, 2026");
  });

  it("accepts a Date object as well as an ISO string, with identical output", () => {
    expect(formatDateTime(new Date(ISO))).toBe(formatDateTime(ISO));
    expect(formatDate(new Date(ISO))).toBe(formatDate(ISO));
  });
});

// Phase 7, Turn 3's own falsification step found this exact, live, previously-untested
// regression: lib/db/type-parsers.ts's global date/timestamp/timestamptz fix (Phase 5.5)
// made `pg` return a `date` column as a full ISO timestamp STRING, not a Date object --
// but toDateOnlyString's own string branch, written before that fix existed, returned a
// string input completely unchanged, skipping truncation. Every weekly-volume/weekly-
// spend chart's axis label (organization-weekly-volume.tsx, organization-bounty-
// spend.tsx) then built a malformed double-timestamp string via
// `${weekStart}T00:00:00Z` and silently rendered "Invalid Date" -- confirmed live via a
// clean .next rebuild + hard reload + browser-console prop trace, not inferred.
describe("format-date: toDateOnlyString truncates a full ISO timestamp to date-only, regardless of whether pg handed it a string or a Date object", () => {
  it("truncates a full ISO timestamp STRING (the real shape pg now returns for a `date` column, post the global type-parser fix) to YYYY-MM-DD", () => {
    expect(toDateOnlyString("2026-06-22T00:00:00.000Z")).toBe("2026-06-22");
  });

  it("truncates a Date object identically (the shape pg would return with no type-parser fix registered at all -- defense in depth, not the primary case anymore)", () => {
    expect(toDateOnlyString(new Date("2026-06-22T00:00:00.000Z"))).toBe("2026-06-22");
  });

  it("a string input and the equivalent Date object produce the identical result -- no divergent branch between the two input shapes", () => {
    expect(toDateOnlyString("2026-06-22T00:00:00.000Z")).toBe(toDateOnlyString(new Date("2026-06-22T00:00:00.000Z")));
  });

  it("the result round-trips through the exact client-side coercion formatWeekLabel uses (`${result}T00:00:00Z`) without producing Invalid Date -- the real end-to-end assertion for the bug this fixes", () => {
    const result = toDateOnlyString("2026-06-22T00:00:00.000Z");
    const reparsed = new Date(`${result}T00:00:00Z`);
    expect(reparsed.toString()).not.toBe("Invalid Date");
    expect(reparsed.getUTCFullYear()).toBe(2026);
  });

  it("reads UTC calendar fields, not local ones -- a date-only value must not shift by timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14, the most extreme positive offset that exists
      const fromPositiveOffsetTz = toDateOnlyString("2026-06-22T00:00:00.000Z");
      process.env.TZ = "Etc/GMT+12"; // UTC-12, the most extreme negative offset that exists
      const fromNegativeOffsetTz = toDateOnlyString("2026-06-22T00:00:00.000Z");
      expect(fromPositiveOffsetTz).toBe("2026-06-22");
      expect(fromNegativeOffsetTz).toBe("2026-06-22");
    } finally {
      process.env.TZ = original;
    }
  });
});
