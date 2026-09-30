"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Card } from "../ui/feedback";
import { Button } from "../ui/button";
import { ErrorState } from "../ui/feedback";
import { StatusBadge, SeverityBadge } from "../ui/badge";
import { listReportsForProgramPageAction } from "../../actions/reports";
import type { Report } from "../../types/report";
import { LocalTime } from "../ui/local-time";

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
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <li key={report.id}>
            <Card className="p-5">
              <Link prefetch={false} href={`/organizations/${organizationId}/programs/${programId}/reports/${report.id}` as Route} className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                <h3 className="text-base font-semibold text-ink">{report.title}</h3>
              </Link>
              <p className="mt-2 break-all font-mono text-xs text-ink-muted">{report.displayTarget}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={report.status} />
                {report.confirmedSeverity && <SeverityBadge severity={report.confirmedSeverity} />}
              </div>
              <p className="mt-3 text-xs text-ink-muted">Updated <LocalTime value={report.updatedAt} /></p>
            </Card>
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
