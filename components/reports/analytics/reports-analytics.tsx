import React from "react";
import { ReportStatusChart } from "../report-status-chart";
import type { ReportStatus } from "../../../types/report";

/**
 * The researcher's own report analytics: the real status distribution across every report
 * they've submitted (getMyReportStatusCounts). The funnel, volume, aging, resolution and
 * severity sections that used to sit here were sample data captioned as the researcher's
 * own ("Every report you've submitted..."), so they were removed rather than shown as real
 * (2026-10-06); each needs its own real query before it returns.
 */
export function ReportsAnalytics({ statusCounts }: { statusCounts: { status: ReportStatus; count: number }[] }) {
  return <ReportStatusChart counts={statusCounts} />;
}
