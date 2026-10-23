"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { ErrorState } from "../ui/feedback";
import { listReportsForProgramPageAction } from "../../actions/reports";
import type { Report } from "../../types/report";
import { IssueList } from "./issue-list";

/** A researcher's own reports for one program -- keyset-paginated (see
 * docs/decisions/0018's Page<T> contract), the same "first page server-rendered, load
 * more via a Server Action" pattern as components/reports/my-reports-list.tsx. RLS on
 * `reports` already scopes listReportsForProgram to the caller's own rows for a plain
 * researcher, so this never needs a client-supplied researcher filter. */
export function ProgramReportList({ organizationId, programId, initialReports, initialNextCursor }: { organizationId: string; programId: string; initialReports: Report[]; initialNextCursor: string | null }) {
  const [reports, setReports] = useState(initialReports);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listReportsForProgramPageAction({ programId, cursor: nextCursor });
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
      <IssueList reports={reports.map((r) => ({ ...r, organizationId, programId, at: r.updatedAt, atLabel: "updated" }))} />

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
