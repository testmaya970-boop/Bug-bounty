import type { ReportSeverity, ReportStatus } from "../types/report";

/** Chart identity colors, in the palette's fixed order (app/globals.css --viz-*). */
export const VIZ = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"] as const;

/**
 * Report status as chart series. Status badges use good/bad tones (accepted and resolved are
 * both "success"), which made two statuses one green in charts. Here each status owns one
 * identity color, in lifecycle order, so adjacent segments are adjacent palette slots (the
 * pairs the palette is validated for). Nine statuses don't fit eight colors: "not
 * applicable" and "rejected" share the last slot as "Not valid".
 */
export const REPORT_STATUS_SERIES: { key: string; label: string; statuses: ReportStatus[]; color: string }[] = [
  { key: "new", label: "New", statuses: ["new"], color: VIZ[0] },
  { key: "triaging", label: "Triaging", statuses: ["triaging"], color: VIZ[1] },
  { key: "needs_information", label: "Needs info", statuses: ["needs_information"], color: VIZ[2] },
  { key: "accepted", label: "Accepted", statuses: ["accepted"], color: VIZ[3] },
  { key: "resolved", label: "Resolved", statuses: ["resolved"], color: VIZ[4] },
  { key: "informative", label: "Informative", statuses: ["informative"], color: VIZ[5] },
  { key: "duplicate", label: "Duplicate", statuses: ["duplicate"], color: VIZ[6] },
  { key: "not_valid", label: "Not valid", statuses: ["not_applicable", "rejected"], color: VIZ[7] },
];

/** Severity keeps the app's established severity colors (badges, report pages): readers
 * already know critical is red. Always shown with its label, never color alone. */
export const SEVERITY_SERIES: { key: ReportSeverity | "unrated"; label: string; color: string }[] = [
  { key: "critical", label: "Critical", color: "var(--severity-critical)" },
  { key: "high", label: "High", color: "var(--severity-high)" },
  { key: "medium", label: "Medium", color: "var(--severity-medium)" },
  { key: "low", label: "Low", color: "var(--severity-low)" },
  { key: "none", label: "None", color: "var(--severity-none)" },
  { key: "unrated", label: "Not yet rated", color: "var(--viz-axis)" },
];

/** 1,284 / 12.9K / 4.2M */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Minor units -> "$1.5K", compact for tiles and axes. */
export function compactMoney(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(minorUnits / 100);
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "--";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Signed change vs the previous window, or null when there is nothing to compare with. */
export function change(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
] as const;

export function rangeDays(param: string | undefined): number {
  return RANGES.find((r) => r.key === param)?.days ?? 90;
}

export function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Status counts -> segmented-bar data in REPORT_STATUS_SERIES order and colors. */
export function reportStatusSegments(byStatus: Map<ReportStatus, number>): { label: string; value: number; color: string }[] {
  return REPORT_STATUS_SERIES.map((s) => ({ label: s.label, value: s.statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0), color: s.color }));
}
