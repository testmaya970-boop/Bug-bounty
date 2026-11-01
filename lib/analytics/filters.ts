import type { ReportStatus } from "../../types/report";

export type SeverityFilterKey =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "none"
  | "unrated";

export const FILTER_STATUSES: ReportStatus[] = [
  "new",
  "triaging",
  "needs_information",
  "accepted",
  "resolved",
  "duplicate",
  "informative",
  "not_applicable",
  "rejected",
];

export const RANGE_PRESETS = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "180", label: "Last 180 days", days: 180 },
  { key: "365", label: "Last 12 months", days: 365 },
] as const;

export interface AnalyticsFilters {
  range: string;
  from: string;
  to: string;
  programIds: string[];
  severities: SeverityFilterKey[];
  statuses: ReportStatus[];
  assetIds: string[];
}

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return (Array.isArray(val) ? val : [val])
    .map((v) => v.trim())
    .filter(Boolean);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseAnalyticsFilters(
  raw: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): AnalyticsFilters {
  const rangeRaw = typeof raw.range === "string" ? raw.range : "90";
  const preset = RANGE_PRESETS.find((r) => r.key === rangeRaw);
  const toDefault = isoDate(now);
  const fromDefault = isoDate(
    new Date(now.getTime() - (preset?.days ?? 90) * 86_400_000),
  );

  const isDate = (s: unknown): s is string =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const from =
    rangeRaw === "custom" && isDate(raw.from) ? raw.from : fromDefault;
  const to = rangeRaw === "custom" && isDate(raw.to) ? raw.to : toDefault;

  const validSeverities = new Set<SeverityFilterKey>([
    "critical",
    "high",
    "medium",
    "low",
    "none",
    "unrated",
  ]);
  const validStatuses = new Set<string>(FILTER_STATUSES);

  return {
    range: rangeRaw === "custom" ? "custom" : (preset?.key ?? "90"),
    from,
    to,
    programIds: toArray(raw.program),
    severities: toArray(raw.severity).filter((s): s is SeverityFilterKey =>
      validSeverities.has(s as SeverityFilterKey),
    ),
    statuses: toArray(raw.status).filter((s): s is ReportStatus =>
      validStatuses.has(s),
    ),
    assetIds: toArray(raw.asset),
  };
}

export function filtersToSearch(filters: AnalyticsFilters): string {
  const sp = new URLSearchParams();
  sp.set("range", filters.range);
  if (filters.range === "custom") {
    sp.set("from", filters.from);
    sp.set("to", filters.to);
  }
  for (const p of filters.programIds) sp.append("program", p);
  for (const s of filters.severities) sp.append("severity", s);
  for (const st of filters.statuses) sp.append("status", st);
  for (const a of filters.assetIds) sp.append("asset", a);
  return sp.toString();
}

export function filtersToSaved(
  filters: AnalyticsFilters,
): Record<string, string[]> {
  return {
    program_ids: filters.programIds,
    severities: filters.severities,
    statuses: filters.statuses,
    asset_ids: filters.assetIds,
  };
}
