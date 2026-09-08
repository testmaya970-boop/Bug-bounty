"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { ErrorState } from "../ui/feedback";
import { ReportSummaryCard } from "./report-summary-card";
import { listMyReportsPageAction } from "../../actions/reports";
import { applyReportFilters, type ReportFilters } from "../../lib/report-status";
import type { ReportSummary } from "../../types/report";

/** The researcher's own report history, keyset-paginated (see docs/decisions/0018's
 * Page<T> contract). The first page is server-rendered directly; "Load more" fetches the
 * next page via a Server Action and appends -- the same pattern as the organization
 * triage inbox (components/reports/report-inbox-table.tsx).
 *
 * `filters` is the same status/program/severity/sort choice the Reports page's own filter
 * form applied to `initialReports` server-side. list_my_reports has no filter parameter
 * (docs/decisions/0018), so a newly loaded "Load more" page arrives unfiltered -- this
 * component re-applies the identical filter to each new batch before appending, so the
 * visible list stays consistent with what the filter form promised. */
export function MyReportsList({
  initialReports,
  initialNextCursor,
  filters,
  isFiltered,
}: {
  initialReports: ReportSummary[];
  initialNextCursor: string | null;
  filters: ReportFilters;
  isFiltered: boolean;
}) {
  const [reports, setReports] = useState(initialReports);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listMyReportsPageAction({ cursor: nextCursor });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      const newlyMatched = isFiltered ? applyReportFilters(result.data.items, filters) : result.data.items;
      setReports((current) => applyReportFilters([...current, ...newlyMatched], filters));
      setNextCursor(result.data.nextCursor);
    });
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <li key={report.id}>
            <ReportSummaryCard report={report} />
          </li>
        ))}
      </ul>

      {loadError && <ErrorState>{loadError}</ErrorState>}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" pending={pending} onClick={handleLoadMore}>
            Load more
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-ink-muted">End of results.</p>
      )}
    </div>
  );
}
