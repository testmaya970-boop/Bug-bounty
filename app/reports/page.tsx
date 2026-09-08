import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { MyReportsList } from "../../components/reports/my-reports-list";
import { ReportsAnalytics } from "../../components/reports/analytics/reports-analytics";
import { getMyReportStatusCounts, listMyReports } from "../../services/reports";
import { getCurrentUser } from "../../lib/auth/current-user";
import { applyReportFilters, REPORT_SEVERITY_ORDER, REPORT_STATUS_ORDER, reportStatusLabel, type ReportSortOption } from "../../lib/report-status";
import type { ReportSeverity, ReportStatus } from "../../types/report";

type ReportsSearchParams = { status?: string; programId?: string; severity?: string; sort?: string };

function parseStatusParam(value: string | undefined): ReportStatus | undefined {
  return value && (REPORT_STATUS_ORDER as string[]).includes(value) ? (value as ReportStatus) : undefined;
}

function parseSeverityParam(value: string | undefined): ReportSeverity | undefined {
  return value && (REPORT_SEVERITY_ORDER as string[]).includes(value) ? (value as ReportSeverity) : undefined;
}

function parseSortParam(value: string | undefined): ReportSortOption {
  return value === "oldest" || value === "severity" ? value : "newest";
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/reports" as Route);

  const resolvedSearchParams = await searchParams;
  const status = parseStatusParam(resolvedSearchParams.status);
  const programId = resolvedSearchParams.programId?.trim() || undefined;
  const severity = parseSeverityParam(resolvedSearchParams.severity);
  const sort = parseSortParam(resolvedSearchParams.sort);
  const isFiltered = Boolean(status || programId || severity);

  // First page server-rendered directly; MyReportsList fetches further pages on demand
  // via a Server Action -- see docs/decisions/0018's Page<T>/cursor contract.
  // statusCounts is a separate, true-total aggregate (see getMyReportStatusCounts) --
  // never derived from the one loaded page, which would undercount past its own size.
  const [{ items: reports, nextCursor }, statusCounts] = await Promise.all([listMyReports(user.id), getMyReportStatusCounts(user.id)]);

  // The program filter's option list is derived from the reports already fetched above --
  // no separate "distinct programs I've reported to" query. A program that exists only on
  // an unloaded later page simply won't appear as a filter option until it's loaded.
  const programOptions = Array.from(new Map(reports.map((report) => [report.programId, report.programName])).entries()).sort((a, b) => a[1].localeCompare(b[1]));

  const filteredReports = applyReportFilters(reports, { status, programId, severity, sort });

  return (
    <AppShell title="Reports" user={user}>
      {reports.length === 0 ? (
        <EmptyState title="You haven't submitted any reports yet">Reports you submit to a program you're authorized for will appear here.</EmptyState>
      ) : (
        <div className="space-y-8">
          <ReportsAnalytics statusCounts={statusCounts} />
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
                {programOptions.map(([id, name]) => (
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

              <label className="sr-only" htmlFor="my-reports-sort">
                Sort
              </label>
              <select
                id="my-reports-sort"
                name="sort"
                defaultValue={sort}
                className="min-h-11 rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="severity">Most severe first</option>
              </select>

              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-ink px-5 text-sm font-semibold text-canvas transition hover:bg-ink/85 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Apply
              </button>
            </form>

            {filteredReports.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No matching reports loaded yet">
                  {nextCursor
                    ? "No report loaded so far matches these filters. Load more below to keep searching, or clear the filters."
                    : "No report matches these filters. Clear the filters to see everything you've submitted."}
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4">
                <MyReportsList
                  initialReports={filteredReports}
                  initialNextCursor={nextCursor}
                  filters={{ status, programId, severity, sort }}
                  isFiltered={isFiltered}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
