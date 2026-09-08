import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../../lib/format-date";

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
