import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalTime, TimeZoneProvider } from "../../components/ui/local-time";
import { isValidTimeZone } from "../../lib/format-date";

// The reported case: an event at 11:22 UTC showed as "11:22 AM" to a viewer in India,
// where it was 4:52 PM.
const INSTANT = "2026-09-28T11:22:00.000Z";
const render = (zone: string | null, node: React.ReactNode) => renderToStaticMarkup(<TimeZoneProvider initialZone={zone}>{node}</TimeZoneProvider>);

describe("LocalTime: timestamps in the viewer's own zone", () => {
  it("renders the viewer's local time, with the exact UTC time on hover and the instant in datetime", () => {
    const html = render("Asia/Kolkata", <LocalTime value={INSTANT} />);
    expect(html).toContain(">Sep 28, 2026, 4:52 PM<");
    expect(html).toContain('title="Sep 28, 2026, 11:22 AM UTC"');
    expect(html).toContain(`dateTime="${INSTANT}"`);
  });

  it("before the zone is known (first visit), says UTC instead of passing UTC off as local", () => {
    expect(render(null, <LocalTime value={INSTANT} />)).toContain(">Sep 28, 2026, 11:22 AM UTC<");
  });

  it("a date-only value shifts with the zone like any instant (late evening UTC is already tomorrow in India)", () => {
    expect(render("Asia/Kolkata", <LocalTime value="2026-09-28T20:00:00.000Z" dateOnly />)).toContain(">Sep 29, 2026<");
  });

  it("a bare YYYY-MM-DD calendar date is never shifted into another day", () => {
    expect(render("America/Los_Angeles", <LocalTime value="2026-09-28" dateOnly />)).toContain(">Sep 28, 2026<");
  });

  it("the cookie-supplied zone is validated before Intl sees it", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("<script>")).toBe(false);
  });
});
