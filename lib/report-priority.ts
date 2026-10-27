import type { ReportPriority, ReportSeverity } from "@/types/report";

/**
 * Operational priority (P0-P4) -- how a program treats a finding and which payout tier it
 * earns. Separate from severity (how bad the vulnerability is, CVSS-backed): priority only
 * DEFAULTS from confirmed severity, and a triager may set it explicitly. Mirrors
 * private.priority_for_severity / payout_tier_for_priority (202610260003); the database is
 * the authority for any payout, this is presentation and the default shown in forms.
 */
export const PRIORITY_ORDER: ReportPriority[] = ["p0", "p1", "p2", "p3", "p4"];

const PRIORITY_NAME: Record<ReportPriority, string> = { p0: "Critical", p1: "High", p2: "Medium", p3: "Low", p4: "Informational" };

/** "P0", "P1"... */
export function priorityCode(priority: ReportPriority): string {
  return priority.toUpperCase();
}

/** "P0 · Critical" */
export function priorityLabel(priority: ReportPriority): string {
  return `${priorityCode(priority)} · ${PRIORITY_NAME[priority]}`;
}

const FROM_SEVERITY: Record<ReportSeverity, ReportPriority> = { critical: "p0", high: "p1", medium: "p2", low: "p3", none: "p4" };
const PAYOUT_TIER: Record<ReportPriority, ReportSeverity> = { p0: "critical", p1: "high", p2: "medium", p3: "low", p4: "none" };

export function priorityForSeverity(severity: ReportSeverity): ReportPriority {
  return FROM_SEVERITY[severity];
}

/** The payout table row a priority draws from (policies store ranges keyed by tier). */
export function payoutTierForPriority(priority: ReportPriority): ReportSeverity {
  return PAYOUT_TIER[priority];
}

/** Explicit priority wins; otherwise the confirmed severity's default; null when neither is set. */
export function effectivePriority(report: { priority: ReportPriority | null; confirmedSeverity: ReportSeverity | null }): ReportPriority | null {
  return report.priority ?? (report.confirmedSeverity ? priorityForSeverity(report.confirmedSeverity) : null);
}
