import type { ReportSeverity, ReportStatus, ReportWeaknessType } from "../types/report";
import { weaknessTypeLabel } from "./report-weakness-labels";

// Findings overview figures and per-report technical facts, computed only from the reports
// themselves. Anything the data doesn't hold (an org-wide SLA rate, median triage time) is
// passed in from real queries, or left null and shown as "no data".

export type FindingsOverviewMetrics = {
  totalCount: number;
  openFindings: number;
  criticalOpenCount: number;
  highOpenCount: number;
  needsTriageCount: number;
  resolvedCount: number;
  /** First-response SLA met, across reports tracked by a published SLA; null when none are. */
  slaComplianceRate: number | null;
  /** Median hours from submission to first triage; null without data. */
  medianTriageHours: number | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  newCount: number;
  triagingCount: number;
  needsInfoCount: number;
  acceptedCount: number;
  severityCounts: Record<ReportSeverity, number>;
  statusCounts: Record<ReportStatus, number>;
};

const OPEN_STATUSES = new Set<ReportStatus>(["new", "triaging", "needs_information", "accepted"]);

export function computeFindingsOverviewMetrics(
  reports: { status: ReportStatus; confirmedSeverity: ReportSeverity | null; researcherSeverity?: ReportSeverity | null }[],
  real: { slaComplianceRate?: number | null; medianTriageHours?: number | null } = {},
): FindingsOverviewMetrics {
  const severityCounts: Record<ReportSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
  const statusCounts: Record<ReportStatus, number> = { new: 0, triaging: 0, needs_information: 0, accepted: 0, resolved: 0, duplicate: 0, informative: 0, not_applicable: 0, rejected: 0 };
  let openFindings = 0;
  let criticalOpenCount = 0;
  let highOpenCount = 0;
  for (const r of reports) {
    const severity = r.confirmedSeverity ?? r.researcherSeverity ?? "none";
    severityCounts[severity] += 1;
    statusCounts[r.status] += 1;
    if (OPEN_STATUSES.has(r.status)) {
      openFindings += 1;
      if (severity === "critical") criticalOpenCount += 1;
      if (severity === "high") highOpenCount += 1;
    }
  }
  return {
    totalCount: reports.length,
    openFindings,
    criticalOpenCount,
    highOpenCount,
    needsTriageCount: statusCounts.new + statusCounts.triaging,
    resolvedCount: statusCounts.resolved,
    slaComplianceRate: real.slaComplianceRate ?? null,
    medianTriageHours: real.medianTriageHours ?? null,
    criticalCount: severityCounts.critical,
    highCount: severityCounts.high,
    mediumCount: severityCounts.medium,
    lowCount: severityCounts.low + severityCounts.none,
    newCount: statusCounts.new,
    triagingCount: statusCounts.triaging,
    needsInfoCount: statusCounts.needs_information,
    acceptedCount: statusCounts.accepted,
    severityCounts,
    statusCounts,
  };
}

export type FindingTechnicalFacts = {
  /** The report's own CVSS (4.0 preferred, else 3.1); null when it was never scored. */
  cvssScore: number | null;
  cvssVector: string | null;
  cvssVersion: "4.0" | "3.1" | null;
  weakness: string | null;
  affectedComponent: string;
  environment: string;
  impactSummary: string | null;
};

const ASSET_TYPE_LABEL: Record<string, string> = { domain: "Domain", wildcard: "Wildcard domain", url: "URL", ip_cidr: "IP / CIDR", api: "API", mobile_ios: "iOS app", mobile_android: "Android app", source_code: "Source code", other: "Other asset" };

export function getFindingTechnicalFacts(report: {
  displayTarget: string;
  assetType?: string | null;
  weaknessType?: ReportWeaknessType | null;
  impact?: string | null;
  cvssBaseScore?: number | string | null;
  cvss4Score?: number | string | null;
  cvss4Vector?: string | null;
}): FindingTechnicalFacts {
  const v4 = report.cvss4Score !== null && report.cvss4Score !== undefined ? Number(report.cvss4Score) : null;
  const v3 = report.cvssBaseScore !== null && report.cvssBaseScore !== undefined ? Number(report.cvssBaseScore) : null;
  return {
    cvssScore: v4 ?? v3,
    cvssVector: v4 !== null ? (report.cvss4Vector ?? null) : null,
    cvssVersion: v4 !== null ? "4.0" : v3 !== null ? "3.1" : null,
    weakness: report.weaknessType ? weaknessTypeLabel(report.weaknessType) : null,
    affectedComponent: report.displayTarget,
    environment: (report.assetType && ASSET_TYPE_LABEL[report.assetType]) || "Asset",
    impactSummary: report.impact?.trim() ? report.impact.trim().split("\n")[0] : null,
  };
}
