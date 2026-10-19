import type { ReportSeverity } from "@/types/report";

/** FIRST.org's published CVSS v3.1 qualitative severity rating scale -- the one place it is
 * defined (docs/decisions/0069). Returns ReportSeverity keys so a score reuses the severity
 * color system. */
export function cvssBand(score: number): ReportSeverity {
  if (score === 0) return "none";
  if (score < 4) return "low";
  if (score < 7) return "medium";
  if (score < 9) return "high";
  return "critical";
}

export const SEVERITY_LABEL: Record<ReportSeverity, string> = { none: "None", low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/** The confirmed severity is the organization's call and may differ from what CVSS alone says
 * (business context, chained impact). A difference is allowed, but it should never be silent:
 * returns the CVSS band when it disagrees, otherwise null. */
export function cvssSeverityMismatch(confirmed: ReportSeverity | null | undefined, baseScore: number | null | undefined): ReportSeverity | null {
  if (!confirmed || typeof baseScore !== "number") return null;
  const band = cvssBand(baseScore);
  return band === confirmed ? null : band;
}
