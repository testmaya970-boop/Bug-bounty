// Every stored timestamp in this schema is `timestamptz` -- a genuine instant, not tied
// to any particular viewer's timezone (see docs/architecture.md). Rendering one used to
// call `toLocaleString(undefined, ...)`/`toLocaleDateString(undefined, ...)` directly,
// which resolves BOTH the locale and the timezone from whatever environment happens to
// run the code. Node (server render) and the browser (client hydration) resolve that
// `undefined` differently -- confirmed live: the identical instant rendered as
// "29 Aug 2026, 21:26" server-side and "29 Aug 2026, 9:26 pm" client-side (24h vs 12h
// AM/PM) -- which is a real React hydration mismatch, not a cosmetic one.
//
// Fix: pin every part of the format explicitly so the exact same string comes out
// regardless of which environment renders it.
//
//   - Locale: "en-US", matching this codebase's existing American-English convention
//     ("color", "behavior", etc. throughout AGENTS.md/DESIGN.md and the app itself) --
//     chosen from that evidence, not merely copied from a prior suggestion.
//   - Time zone: "UTC". No per-user timezone preference exists anywhere in this domain
//     model or schema (nothing to read at render time even if we wanted to), and a
//     server-rendered page has no reliable signal for a visitor's real browser timezone
//     without a client-only progressive-enhancement re-render -- out of scope for a
//     formatter fix. UTC is also arguably the more *correct* choice for a security-audit
//     product: SECURITY.md requires sensitive mutations to carry a trustworthy timestamp,
//     and a single canonical timeline is less ambiguous than each viewer's own local time
//     when researchers and organizations sit in different real-world timezones. This is a
//     deliberate, disclosed policy decision (see docs/decisions -- this fix's own entry),
//     not a silent one: every previously browser-local-converted timestamp on Sentinel now
//     reads as UTC for every viewer, not their own local time.
//   - hour12: true, so the 12-hour "9:26 PM" style (already what most viewers were
//     actually seeing post-hydration) is the format everyone sees, deterministically.
//
// Update 2026-09-28: unlabelled UTC read as local time ("11:22 AM" for an event at 4:52 PM
// in India), so on-screen timestamps now render in the viewer's own zone through
// components/ui/local-time.tsx, which passes that zone in here explicitly -- same input
// and zone, same string, on server and client alike. The default stays "UTC" for callers
// that cannot know the viewer (email, anything server-only); those must say "UTC".
export function formatDateTime(input: string | Date, timeZone = "UTC"): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

export function formatDate(input: string | Date, timeZone = "UTC"): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

/** The cookie the browser reports its zone in (components/ui/local-time.tsx) and the root
 * layout reads. Lives here, not in that "use client" module: a server component importing
 * a plain value from a client module gets a client-reference placeholder, not the string. */
export const TIME_ZONE_COOKIE = "tz";

/** A real IANA zone Intl accepts. The zone arrives in a cookie (client-controlled), and
 * Intl throws RangeError on anything else -- never let that reach a render. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Converts a `pg`-returned `date`-typed column to a real `YYYY-MM-DD` string (no time
 * component) -- every week_start/day-bucket RPC result (get_organization_weekly_report_
 * volume, get_organization_weekly_bounty_spend, get_program_weekly_report_volume, ...)
 * hits this. Reads the UTC calendar fields specifically (not local getFullYear/getMonth/
 * getDate) since a `date` value is conceptually UTC-midnight, and a server running in a
 * non-UTC timezone would otherwise shift the day.
 *
 * A real, confirmed-live bug this function's own EARLIER version caused, not merely
 * "could cause": lib/db/type-parsers.ts's registerDateTimeTypeParsers (Phase 5.5) made
 * `pg` return every date/timestamp/timestamptz column as a full ISO 8601 STRING at the
 * driver level, not a JS Date object. This function's old `typeof input === "string" ?
 * return input as-is` branch was written for the world BEFORE that fix existed, when a
 * string input only ever meant "already date-only, nothing to do." Once the global fix
 * shipped, `pg` started handing this function a FULL ISO TIMESTAMP string
 * ("2026-06-22T00:00:00.000Z") for a `date` column -- and the old string branch returned
 * it completely unchanged, skipping truncation entirely. Every downstream consumer that
 * coerces the result via a template literal (e.g. `${weekStart}T00:00:00Z` in
 * components/organizations/organization-weekly-volume.tsx's formatWeekLabel) then built a
 * malformed double-timestamp string ("...000ZT00:00:00Z"), which `new Date()` cannot
 * parse -- producing "Invalid Date" on every weekly-volume/weekly-spend chart's axis
 * labels. Confirmed live (Phase 7, Turn 3's own falsification step): the browser-received
 * prop was the full timestamp string, not a date-only one.
 *
 * The fix: always route through `new Date(...)` regardless of whether the input already
 * arrived as a string or a Date object, so a full-ISO-string input is truncated exactly
 * the same way a raw Date object always was -- there is no longer a "the input is
 * already correct" case to special-case for, because pg's own output shape for these
 * columns changed underneath this function once the global parser fix shipped. */
export function toDateOnlyString(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
