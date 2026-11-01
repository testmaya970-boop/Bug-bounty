import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SeverityBadge, StatusBadge } from "../ui/badge";
import { EmptyState } from "../ui/feedback";
import { cn } from "../../lib/cn";
import type { Report } from "../../types/report";

/**
 * The inbox's left pane -- a compact, scannable report list, deliberately denser than
 * ReportInboxTable's own full data-table row (severity + status + title + reporter, no
 * target/updated/next-action columns; those live in the middle/right panes once a report
 * is selected). Selecting a report updates the URL's `?reportId=` search param (a plain
 * <Link>, not client state) -- the whole point of a real query param here is that the
 * selected report is shareable/bookmarkable/back-button-navigable, matching every other
 * filter in this codebase's own "URL is the source of truth" convention (see
 * ReportInboxTable's own status/severity filters).
 *
 * "New" unread dot: this schema has no per-viewer read-tracking table (a genuine gap, not
 * an oversight -- notifications.read_at tracks notification delivery, not "has this
 * specific triager opened this specific report"). status === "new" is the one real signal
 * that already exists and means approximately the same thing for a shared team inbox: no
 * one has started triage on this report yet. Using it here is a disclosed simplification,
 * not a fabricated one -- the dot never claims anything this schema cannot actually back.
 */
export function InboxReportList({
  reports,
  selectedReportId,
  buildHref,
}: {
  reports: Report[];
  selectedReportId: string | null;
  buildHref: (reportId: string) => Route;
}) {
  if (reports.length === 0) {
    return <EmptyState title="No reports">Reports submitted to this program will appear here.</EmptyState>;
  }

  return (
    <ul className="divide-y divide-border">
      {reports.map((report) => {
        const isSelected = report.id === selectedReportId;
        const isUnread = report.status === "new";
        return (
          <li key={report.id}>
            <Link prefetch={false}
              href={buildHref(report.id)}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "block px-3 py-3 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                isSelected ? "bg-surface-muted" : "hover:bg-surface-muted",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", isUnread ? "bg-action motion-safe:animate-status-pulse" : "bg-transparent")}
                  // Not aria-hidden -- aria-hidden strips both the visual dot AND its
                  // title from the accessibility tree, so a screen-reader user would get
                  // neither (found while reviewing this exact element: the previous
                  // aria-hidden + title combination meant no assistive tech ever saw
                  // "New, awaiting triage" at all). role="img" + aria-label is the correct
                  // shape for a purely decorative element that also carries real meaning.
                  // Label reads "Awaiting triage" (not "New") -- status === "new" IS the
                  // real ReportStatus value underneath, but the dot's own English label
                  // should describe what it means to a triager, not restate the status
                  // word StatusBadge right next to it already shows. No per-viewer
                  // read-tracking exists (see this file's own header comment on why
                  // status === "new" is the real, disclosed signal here) -- an empty
                  // title/no aria-label on the read/non-"new" case, never a second,
                  // fabricated "read" label this schema cannot actually back.
                  role={isUnread ? "img" : undefined}
                  aria-label={isUnread ? "Awaiting triage" : undefined}
                  title={isUnread ? "Awaiting triage" : undefined}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {report.confirmedSeverity && <SeverityBadge severity={report.confirmedSeverity} />}
                    <StatusBadge status={report.status} />
                  </div>
                  {/* Two lines, not one: single-line truncation hid most of a typical report title. */}
                  <p title={report.title} className={cn("mt-1 line-clamp-2 break-words text-sm", isSelected ? "font-semibold text-ink" : "font-medium text-ink")}>
                    {report.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">{report.researcherName}</p>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
