import React from "react";
import { SegmentedBar, type SegmentedBarDatum } from "../charts/segmented-bar";
import { AgingDistribution } from "../charts/aging-distribution";
import { SeverityStatusMatrix } from "../charts/severity-status-matrix";
import { OrganizationWeeklyVolume } from "../organizations/organization-weekly-volume";
import { OrganizationResolutionPerformanceTiles } from "../organizations/organization-resolution-performance";
import { SectionLabel } from "../ui/security-primitives";
import { reportStatusSegments } from "../../lib/viz";
import type { OrganizationResolutionPerformance, OrganizationSeverityStatusCount, OrganizationWeeklyReportVolume } from "../../types/organization";
import type { ReportSeverity, ReportStatus } from "../../types/report";

/**
 * Real per-program report analytics -- every number here comes from
 * get_program_severity_status_breakdown / get_program_weekly_report_volume /
 * get_program_resolution_performance (see supabase/migrations/
 * 202609050015_program_report_analytics.sql), never lib/mock/*. Deliberately the exact
 * same composition and chart components as components/organizations/
 * organization-report-analytics.tsx's OrganizationReportAnalytics, just fed this one
 * program's data instead of every program in an organization -- see
 * services/program-analytics.ts's own comment for why the data shapes are identical.
 */
export function ProgramHealthSection({
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
  // Chart identity colors, one per status (lib/viz.ts) -- badge tones made accepted and resolved the same green.
  const statusData: SegmentedBarDatum[] = reportStatusSegments(byStatus);

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
        <p className="mt-1 text-sm text-ink-muted">Submissions and closures for this program, past 12 weeks.</p>
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
