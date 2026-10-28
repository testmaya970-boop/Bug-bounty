import { describe, expect, it } from "vitest";
import { buildIcs } from "../../lib/calendar-ics";

describe("buildIcs", () => {
  const item = { uid: "event-1", title: "Live hack; day, one", startsAt: "2026-11-02T10:00:00.000Z", endsAt: "2026-11-02T18:00:00.000Z", url: "https://app.example/events", description: "Online\nbring a laptop" };

  it("produces a valid calendar with UTC times and escaped text", () => {
    const ics = buildIcs([item], "2026-10-28T00:00:00.000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261102T100000Z");
    expect(ics).toContain("DTEND:20261102T180000Z");
    expect(ics).toContain("SUMMARY:Live hack\\; day\\, one");
    expect(ics).toContain("DESCRIPTION:Online\\nbring a laptop");
    expect(ics).toContain("UID:event-1@unpatched");
  });

  it("folds long lines at 75 octets", () => {
    const ics = buildIcs([{ ...item, title: "x".repeat(200) }]);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(ics).toContain("\r\n x");
  });

  it("an empty calendar is still a valid file", () => {
    expect(buildIcs([])).toBe("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Unpatched//Researcher calendar//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n");
  });
});
