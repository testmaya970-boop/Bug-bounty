"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { TIME_ZONE_COOKIE, formatDate, formatDateTime, isValidTimeZone } from "../../lib/format-date";

const TimeZoneContext = createContext("UTC");

/**
 * Every on-screen timestamp shows the viewer's own local time. The server cannot see the
 * browser's zone, so the browser reports it once in a cookie; from then on the root layout
 * reads it and the server renders the exact string the browser would (no hydration
 * mismatch, no flash). On a first visit, before the cookie exists, times render in UTC --
 * labelled as UTC -- and switch to local time as soon as the zone is known.
 */
export function TimeZoneProvider({ initialZone, children }: { initialZone: string | null; children: React.ReactNode }) {
  const [zone, setZone] = useState(initialZone ?? "UTC");
  useEffect(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === initialZone || !isValidTimeZone(browserZone)) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(browserZone)}; path=/; max-age=31536000; samesite=lax`;
    setZone(browserZone);
  }, [initialZone]);
  return <TimeZoneContext.Provider value={zone}>{children}</TimeZoneContext.Provider>;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A timestamp in the viewer's zone; hover shows the exact UTC time. `dateOnly` drops the
 * clock. A bare YYYY-MM-DD is a calendar date, not an instant, so it is never shifted into
 * another day by a zone. */
export function LocalTime({ value, dateOnly = false }: { value: string | Date; dateOnly?: boolean }) {
  const viewerZone = useContext(TimeZoneContext);
  const calendarDate = typeof value === "string" && CALENDAR_DATE.test(value);
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return <>{String(value)}</>;
  const zone = calendarDate ? "UTC" : viewerZone;
  const format = (z: string) => (dateOnly || calendarDate ? formatDate(date, z) : formatDateTime(date, z));
  const utc = `${format("UTC")} UTC`;
  return (
    <time dateTime={calendarDate ? String(value) : date.toISOString()} title={calendarDate ? undefined : utc}>
      {zone === "UTC" && !calendarDate ? utc : format(zone)}
    </time>
  );
}
