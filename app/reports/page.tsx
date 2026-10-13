import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { MyReportsList } from "../../components/reports/my-reports-list";
import { ResearcherDashboard } from "../../components/dashboards/researcher-dashboard";
import { getMyResearcherDashboard } from "../../services/dashboards";
import { rangeDays } from "../../lib/viz";
import { getMyReportStatusCounts, listMyReportedPrograms, listMyReports } from "../../services/reports";
import { getCurrentUser } from "../../lib/auth/current-user";
import Link from "next/link";
import { REPORT_SEVERITY_ORDER, REPORT_STATUS_ORDER, reportStatusLabel } from "../../lib/report-status";
import type { ReportSeverity, ReportStatus } from "../../types/report";

type ReportsSearchParams = { status?: string; programId?: string; severity?: string; range?: string };

function parseStatusParam(value: string | undefined): ReportStatus | undefined {
  return value && (REPORT_STATUS_ORDER as string[]).includes(value) ? (value as ReportStatus) : undefined;
}

function parseSeverityParam(value: string | undefined): ReportSeverity | undefined {
  return value && (REPORT_SEVERITY_ORDER as string[]).includes(value) ? (value as ReportSeverity) : undefined;
}


export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/reports" as Route);

  const resolvedSearchParams = await searchParams;
  const status = parseStatusParam(resolvedSearchParams.status);
  const programId = /^[0-9a-f-]{36}$/.test(resolvedSearchParams.programId ?? "") ? resolvedSearchParams.programId : undefined;
  const severity = parseSeverityParam(resolvedSearchParams.severity);
  const isFiltered = Boolean(status || programId || severity);
  const filters = { status, programId, severity };

  // Filtered in the database; the status tiles are true totals across every report.
  const days = rangeDays(resolvedSearchParams.range);
  const [{ items: reports, nextCursor }, statusCounts, programOptions, dashboard] = await Promise.all([
    listMyReports(user.id, undefined, undefined, filters),
    getMyReportStatusCounts(user.id),
    listMyReportedPrograms(user.id),
    getMyResearcherDashboard(days),
  ]);
  const totalReports = statusCounts.reduce((sum, row) => sum + row.count, 0);

  return (
    <AppShell title="Reports" user={user}>
      {totalReports === 0 && !isFiltered ? (
        <EmptyState title="You haven't submitted any reports yet">
          Reports you submit to a program you're authorized for will appear here.{" "}
          <Link prefetch={false} href="/programs" className="font-semibold text-action hover:underline">
            Find a program
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <ResearcherDashboard data={dashboard} days={days} />
          <div className="border-t border-border pt-6">
            <form method="get" className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-muted p-2">
              <label className="sr-only" htmlFor="my-reports-status">
                Filter by status
              </label>
              <select
                id="my-reports-status"
                name="status"
                defaultValue={status ?? ""}
                className="min-h-11 rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
              >
                <option value="">All statuses</option>
                {REPORT_STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {reportStatusLabel(value)}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="my-reports-program">
                Filter by program
              </label>
              <select
                id="my-reports-program"
                name="programId"
                defaultValue={programId ?? ""}
                className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
              >
                <option value="">All programs</option>
                {programOptions.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="my-reports-severity">
                Filter by confirmed severity
              </label>
              <select
                id="my-reports-severity"
                name="severity"
                defaultValue={severity ?? ""}
                className="min-h-11 rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
              >
                <option value="">All severities</option>
                {REPORT_SEVERITY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-ink px-5 text-sm font-semibold text-canvas transition hover:bg-ink/85 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Apply
              </button>
            </form>

            {reports.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No matching reports">No report matches these filters. Clear the filters to see everything you&apos;ve submitted.</EmptyState>
              </div>
            ) : (
              <div className="mt-4">
                <MyReportsList key={JSON.stringify(filters)} initialReports={reports} initialNextCursor={nextCursor} filters={filters} />
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
