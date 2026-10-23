import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { CheckCircle, Circle, XCircle } from "@phosphor-icons/react/dist/ssr";
import { SeverityBadge } from "../ui/badge";
import { LocalTime } from "../ui/local-time";
import { REPORT_STATUS_TRANSITIONS } from "../../lib/report-status";
import type { ReportSeverity, ReportStatus } from "../../types/report";

// Report lists as an issue list (Oct 22, GitHub-style): one bordered list, a state icon per
// row (open, resolved, or closed without a fix), the title with its labels, and a quiet meta
// line. Open = the report still has a legal next status (lib/report-status).

export type IssueRowReport = { id: string; organizationId: string; programId: string; title: string; displayTarget: string; status: ReportStatus; confirmedSeverity: ReportSeverity | null; at: string; atLabel: string; context?: string };

const isOpen = (status: ReportStatus) => REPORT_STATUS_TRANSITIONS[status].length > 0;
const STATUS_WORD: Record<ReportStatus, string> = { new: "New", triaging: "Triaging", needs_information: "Needs information", accepted: "Accepted", resolved: "Resolved", duplicate: "Duplicate", informative: "Informative", not_applicable: "Not applicable", rejected: "Rejected" };

function StateIcon({ status }: { status: ReportStatus }) {
  if (isOpen(status)) return <Circle aria-label="Open" weight="bold" className="size-4 shrink-0 text-success" />;
  if (status === "resolved") return <CheckCircle aria-label="Resolved" weight="fill" className="size-4 shrink-0 text-[#8250df]" />;
  return <XCircle aria-label="Closed" weight="fill" className="size-4 shrink-0 text-ink-muted" />;
}

export function IssueList({ reports, footer }: { reports: IssueRowReport[]; footer?: React.ReactNode }) {
  const open = reports.filter((r) => isOpen(r.status)).length;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-4 border-b border-border bg-surface-hover px-4 py-2.5 text-[13px]">
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          <Circle aria-hidden="true" weight="bold" className="size-4 text-success" />
          {open} Open
        </span>
        <span className="flex items-center gap-1.5 text-ink-muted">
          <CheckCircle aria-hidden="true" className="size-4" />
          {reports.length - open} Closed
        </span>
      </div>
      <ul className="divide-y divide-border">
        {reports.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
            <span className="mt-0.5">
              <StateIcon status={r.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  prefetch={false}
                  href={`/organizations/${r.organizationId}/programs/${r.programId}/reports/${r.id}` as Route}
                  className="text-[15px] font-semibold text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {r.title}
                </Link>
                {r.confirmedSeverity && <SeverityBadge severity={r.confirmedSeverity} />}
                <span className="rounded-full border border-border px-2 py-px text-[11px] font-medium text-ink-muted">{STATUS_WORD[r.status]}</span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                #{r.id.slice(0, 8)} · {r.atLabel} <LocalTime value={r.at} dateOnly />
                {r.context && <> · {r.context}</>} · <span className="break-all font-mono">{r.displayTarget}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
    </div>
  );
}
