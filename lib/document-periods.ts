// Date periods the billing and tax documents are cut on. Dates are "YYYY-MM-DD" strings in
// UTC, matching what the database functions take. India's financial year runs 1 April to
// 31 March ("2026-27"); TDS certificates are quarterly within it (Q1 = Apr-Jun). The US
// reports on the calendar year.

export type Range = { from: string; to: string };

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** "2026-09" -> 1 to 30 September 2026. Null for anything that is not a real month. */
export function monthRange(month: string): Range | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  return { from: iso(y, mo, 1), to: iso(y, mo + 1, 0) };
}

/** The Indian financial year a date falls in: 2026-04-01 and 2027-03-31 are both "2026-27". */
export function financialYearOf(date: string): string {
  const y = Number(date.slice(0, 4)), mo = Number(date.slice(5, 7));
  const start = mo >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Q1 (Apr-Jun) to Q4 (Jan-Mar) of the Indian financial year. */
export function financialQuarterOf(date: string): "Q1" | "Q2" | "Q3" | "Q4" {
  const mo = Number(date.slice(5, 7));
  return mo >= 4 && mo <= 6 ? "Q1" : mo >= 7 && mo <= 9 ? "Q2" : mo >= 10 ? "Q3" : "Q4";
}

/** "2026-27" -> 1 April 2026 to 31 March 2027; "2026-27-Q2" -> 1 July to 30 September 2026. */
export function financialPeriodRange(period: string): Range | null {
  const m = /^(\d{4})-(\d{2})(?:-(Q[1-4]))?$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  if ((y + 1) % 100 !== Number(m[2])) return null;
  if (!m[3]) return { from: iso(y, 4, 1), to: iso(y + 1, 3, 31) };
  const q = Number(m[3][1]);
  const startMonth = q === 4 ? 1 : 1 + q * 3; // Q1 Apr, Q2 Jul, Q3 Oct, Q4 Jan (next calendar year)
  const year = q === 4 ? y + 1 : y;
  return { from: iso(year, startMonth, 1), to: iso(year, startMonth + 3, 0) };
}

/** "2026" -> the calendar year. */
export function calendarYearRange(year: string): Range | null {
  return /^\d{4}$/.test(year) ? { from: `${year}-01-01`, to: `${year}-12-31` } : null;
}

/** A from/to pair from a query string, defaulting to the last 30 days; null if malformed or reversed. */
export function parseRange(from: string | undefined, to: string | undefined, today = new Date().toISOString().slice(0, 10)): Range | null {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  const end = to && valid(to) ? to : today;
  const start = from && valid(from) ? from : new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  return start <= end ? { from: start, to: end } : null;
}

/** The last n calendar months, newest first: ["2026-10", "2026-09", ...]. */
export function recentMonths(n: number, today = new Date().toISOString().slice(0, 10)): string[] {
  const y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
  return Array.from({ length: n }, (_, i) => iso(y, mo - i, 1).slice(0, 7));
}
