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
export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

export function formatDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Converts a `pg`-returned `date`-typed column to a real `YYYY-MM-DD` string. `pg`
 * auto-parses SQL `date` columns into a JS Date at local midnight (unlike `timestamptz`
 * columns, which the rest of this codebase already passes through as ISO strings) --
 * every week_start/day-bucket RPC result (get_organization_weekly_report_volume,
 * get_organization_weekly_bounty_spend, get_program_weekly_report_volume, ...) hits this,
 * so mapping row.week_start straight into a `string`-typed field is a lie at runtime: a
 * client component template-literal-coercing that Date (e.g. `${iso}T00:00:00Z`) silently
 * produces "Invalid Date" (confirmed live). Reads the UTC calendar fields specifically
 * (not local getFullYear/getMonth/getDate) since `pg` parses a `date` value at UTC
 * midnight, and a server running in a non-UTC timezone would otherwise shift the day. */
export function toDateOnlyString(input: string | Date): string {
  if (typeof input === "string") return input;
  const year = input.getUTCFullYear();
  const month = String(input.getUTCMonth() + 1).padStart(2, "0");
  const day = String(input.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
