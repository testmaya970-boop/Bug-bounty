"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { ErrorState } from "../ui/feedback";
import { IssueList } from "./issue-list";
import { listMyReportsPageAction } from "../../actions/reports";
import type { ReportSeverity, ReportStatus } from "../../types/report";
import type { ReportSummary } from "../../types/report";

/** The researcher's reports. Filters are applied by the database (list_my_reports,
 * 202610060014), so "Load more" fetches the next page of the same filtered set. */
export function MyReportsList({
  initialReports,
  initialNextCursor,
  filters,
}: {
  initialReports: ReportSummary[];
  initialNextCursor: string | null;
  filters: { status?: ReportStatus; programId?: string; severity?: ReportSeverity };
}) {
  const [reports, setReports] = useState(initialReports);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listMyReportsPageAction({ ...filters, cursor: nextCursor });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setReports((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  return (
    <div className="space-y-4">
      <IssueList reports={reports.map((r) => ({ ...r, at: r.submittedAt, atLabel: "submitted", context: `${r.programName} · ${r.organizationName}` }))} />

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
