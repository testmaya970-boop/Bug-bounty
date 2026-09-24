import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Card } from "../ui/feedback";
import { SeverityBadge, StatusBadge } from "../ui/badge";
import { formatDate } from "../../lib/format-date";
import type { ReportSummary } from "../../types/report";

export function ReportSummaryCard({ report }: { report: ReportSummary }) {
  return (
    <Card className="p-5">
      <Link prefetch={false}
        href={`/organizations/${report.organizationId}/programs/${report.programId}/reports/${report.id}` as Route}
        className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <h3 className="text-base font-semibold text-ink">{report.title}</h3>
      </Link>
      <p className="mt-1 text-sm text-ink-muted">
        {report.programName} · {report.organizationName}
      </p>
      <p className="mt-2 break-all font-mono text-xs text-ink-muted">{report.displayTarget}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {report.confirmedSeverity && <SeverityBadge severity={report.confirmedSeverity} />}
        <StatusBadge status={report.status} />
      </div>
      <p className="mt-3 text-xs text-ink-muted">Submitted {formatDate(report.submittedAt)}</p>
    </Card>
  );
}
