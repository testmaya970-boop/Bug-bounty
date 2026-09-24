import React from "react";
import { SegmentedBar, type SegmentedBarDatum } from "../charts/segmented-bar";
import { AgingDistribution } from "../charts/aging-distribution";
import { SeverityStatusMatrix } from "../charts/severity-status-matrix";
import { OrganizationWeeklyVolume } from "./organization-weekly-volume";
import { OrganizationResolutionPerformanceTiles } from "./organization-resolution-performance";
import { SectionLabel } from "../ui/security-primitives";
import { statusTone } from "../ui/badge";
import { reportStatusLabel } from "../../lib/report-status";
import type { OrganizationResolutionPerformance, OrganizationSeverityStatusCount, OrganizationWeeklyReportVolume } from "../../types/organization";
import type { ReportSeverity, ReportStatus } from "../../types/report";

const STATUS_ORDER: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];

/**
 * Real organization-facing report analytics -- every number here comes from
 * get_organization_severity_status_breakdown / get_organization_weekly_report_volume /
 * get_organization_resolution_performance (see supabase/migrations/
 * 202609050004_organization_report_analytics.sql), never lib/mock/*. Deliberately not
 * labeled "Preview" anywhere, unlike the researcher-facing Reports page's own analytics
 * surface -- there is nothing here to disclose. A narrower slice than that page's mock
 * version by design: no lifecycle funnel (this org's audit_logs don't yet distinguish
 * every intermediate transition cleanly enough for a real one), and aging uses 4 real
 * buckets rather than a fabricated 5th.
 */
export function OrganizationReportAnalytics({
  severityStatusBreakdown,
  weeklyVolume,
  resolutionPerformance,
}: {
  severityStatusBreakdown: OrganizationSeverityStatusCount[];
  weeklyVolume: OrganizationWeeklyReportVolume[];
  resolutionPerformance: OrganizationResolutionPerformance;
}) {
  const hasAnyReports = severityStatusBreakdown.length > 0;
  if (!hasAnyReports) return null;

  const byStatus = new Map<ReportStatus, number>();
  for (const cell of severityStatusBreakdown) byStatus.set(cell.status, (byStatus.get(cell.status) ?? 0) + cell.count);
  const totalReports = severityStatusBreakdown.reduce((sum, cell) => sum + cell.count, 0);
  const statusData: SegmentedBarDatum[] = STATUS_ORDER.map((status) => ({
    label: reportStatusLabel(status),
    value: byStatus.get(status) ?? 0,
    tone: statusTone[status],
  }));

  // The matrix component's severity type has no null variant -- a report with no
  // organization-confirmed severity yet reads identically to "none" for this display
  // purpose, so it's mapped here rather than widening a shared chart component's type for
  // one caller.
  const matrixCells = severityStatusBreakdown.map((cell) => ({
    severity: (cell.severity ?? "none") as ReportSeverity,
    status: cell.status,
    count: cell.count,
    records: [],
  }));

  const agingBuckets = [
    { key: "0-7" as const, label: "0–7 days", count: resolutionPerformance.aging0To7DaysCount },
    { key: "8-30" as const, label: "8–30 days", count: resolutionPerformance.aging8To30DaysCount },
    { key: "31-60" as const, label: "31–60 days", count: resolutionPerformance.aging31To60DaysCount },
    { key: "60+" as const, label: "60+ days", count: resolutionPerformance.agingOver60DaysCount },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Reports by status</SectionLabel>
          <span className="font-mono text-xs text-ink-muted">
            {totalReports} report{totalReports === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-3">
          <SegmentedBar data={statusData} />
        </div>
      </div>

      <div>
        <SectionLabel>Weekly activity</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">Submissions and closures across every program, past 12 weeks.</p>
        <div className="mt-4">
          <OrganizationWeeklyVolume weeks={weeklyVolume} />
        </div>
      </div>

      <OrganizationResolutionPerformanceTiles performance={resolutionPerformance} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <SectionLabel>Aging (open reports)</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">How long currently-open reports have been waiting.</p>
          <div className="mt-4">
            <AgingDistribution buckets={agingBuckets} />
          </div>
        </div>

        <div>
          <SectionLabel>Severity × status</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Where the most severe findings currently sit.</p>
          <div className="mt-4">
            <SeverityStatusMatrix cells={matrixCells} />
          </div>
        </div>
      </div>
    </div>
  );
}
