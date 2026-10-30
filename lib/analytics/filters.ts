import type { ReportStatus } from "../../types/report";
import { SEVERITY_KEYS } from "./report-metrics";

// Explore-tab filters, from the URL (page and export links) or a saved schedule. Anything
// malformed is dropped, never passed to SQL as-is.

export type AnalyticsFilters = { from: string; to: string; programIds: string[]; severities: string[]; statuses: ReportStatus[]; assetIds: string[] };

export const RANGE_PRESETS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "180", label: "Last 6 months", days: 180 },
  { key: "365", label: "Last 12 months", days: 365 },
] as const;

export const FILTER_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

const day = (d: Date) => d.toISOString().slice(0, 10);
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);
const validDate = (s: string | undefined) => (s && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null);

export function parseAnalyticsFilters(params: Record<string, string | string[] | undefined>, today: Date = new Date()): AnalyticsFilters & { range: string } {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]![0] : (params[k] as string | undefined));
  let from = validDate(one("from"));
  let to = validDate(one("to"));
  let range = "custom";
  // Custom dates count when asked for ("range=custom", the form) or given alone (shared links).
  const wantsCustom = one("range") === "custom" || !one("range");
  if (!wantsCustom || !from || !to || from > to || (Date.parse(to) - Date.parse(from)) / DAY > 731) {
    const preset = RANGE_PRESETS.find((p) => p.key === one("range")) ?? RANGE_PRESETS[2];
    range = preset.key;
    to = day(today);
    from = day(new Date(today.getTime() - (preset.days - 1) * DAY));
  }
  return {
    range,
    from,
    to,
    programIds: [...new Set(list(params.program).filter((s) => UUID.test(s)))].slice(0, 100),
    severities: [...new Set(list(params.severity).filter((s) => (SEVERITY_KEYS as readonly string[]).includes(s)))],
    statuses: [...new Set(list(params.status).filter((s): s is ReportStatus => (FILTER_STATUSES as string[]).includes(s)))],
    assetIds: [...new Set(list(params.asset).filter((s) => UUID.test(s)))].slice(0, 100),
  };
}

/** The same filters as query-string pairs (repeated keys for lists). */
export function filtersToSearch(f: AnalyticsFilters & { range?: string }, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.range && f.range !== "custom") q.set("range", f.range);
  else {
    q.set("from", f.from);
    q.set("to", f.to);
  }
  for (const id of f.programIds) q.append("program", id);
  for (const s of f.severities) q.append("severity", s);
  for (const s of f.statuses) q.append("status", s);
  for (const id of f.assetIds) q.append("asset", id);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

/** A schedule's saved filters plus the period it covers when run at `runAt`: the previous
 * Monday-Sunday week, or the previous calendar month. */
export function scheduledFilters(saved: unknown, frequency: "weekly" | "monthly", runAt: Date): AnalyticsFilters {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(s[k]) ? (s[k] as unknown[]).filter((v): v is string => typeof v === "string") : []);
  const parsed = parseAnalyticsFilters({ program: arr("program_ids"), severity: arr("severities"), status: arr("statuses"), asset: arr("asset_ids") });
  const today = new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth(), runAt.getUTCDate()));
  let from: Date;
  let to: Date;
  if (frequency === "weekly") {
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
    from = new Date(monday.getTime() - 7 * DAY);
    to = new Date(monday.getTime() - DAY);
  } else {
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  }
  return { from: day(from), to: day(to), programIds: parsed.programIds, severities: parsed.severities, statuses: parsed.statuses, assetIds: parsed.assetIds };
}

/** Saved form of the non-date filters (what create_analytics_export_schedule stores). */
export function filtersToSaved(f: AnalyticsFilters) {
  return { program_ids: f.programIds, severities: f.severities, statuses: f.statuses, asset_ids: f.assetIds };
}
