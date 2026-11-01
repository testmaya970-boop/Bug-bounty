"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { Dialog } from "../ui/navigation";
import { EmptyState, ErrorState, Skeleton } from "../ui/feedback";
import { SeverityBadge, StatusBadge } from "../ui/badge";
import { reportStatusLabel, reportNextActionLabel, severityLabel } from "../../lib/report-status";
import { bulkMarkDuplicateAction, listReportsForProgramPageAction } from "../../actions/reports";
import type { Report, ReportInboxWorkloadSummary, ReportSeverity, ReportStatus } from "../../types/report";

import { LocalTime } from "../ui/local-time";

const FILTERABLE_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];
const FILTERABLE_SEVERITIES: ReportSeverity[] = ["none", "low", "medium", "high", "critical"];

/**
 * Workload-at-a-glance, read before scanning a single row -- the exact "what needs
 * attention right now" framing this codebase's own platform-tier design principle already
 * states (see docs/decisions/0026 Section N), applied to the org-tier inbox for the first
 * time. Three real counts (never a fabricated total): reports still awaiting a first
 * triage action, reports where the ball is in the organization's own court (the
 * researcher already responded to an information request), and unresolved high/critical
 * severity -- the one number that should visually read as urgent, not just informational.
 * A zero count in any tile still renders (a quiet "0", not hidden) -- an honest empty
 * workload is itself useful information, matching this file's own EmptyState convention.
 */
function WorkloadSummaryStrip({ summary }: { summary: ReportInboxWorkloadSummary }) {
  const tiles: { label: string; value: number; urgent?: boolean }[] = [
    { label: "New, awaiting triage", value: summary.newCount },
    { label: "Needs your response", value: summary.needsInformationCount },
    { label: "Unresolved high/critical", value: summary.unresolvedHighSeverityCount, urgent: summary.unresolvedHighSeverityCount > 0 },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border p-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className={tile.urgent ? "rounded-md border-2 border-danger bg-danger/5 px-3 py-2" : "rounded-md border border-border px-3 py-2"}>
          <p className={tile.urgent ? "text-2xl font-semibold tabular-nums text-danger" : "text-2xl font-semibold tabular-nums text-ink"}>{tile.value}</p>
          <p className="text-xs font-medium text-ink-muted">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Bulk-mark-duplicate only -- the one real, common triage tedium at real report volume
 * (several near-identical low-effort reports about the same known issue), not a generic
 * bulk-action framework. Same interaction shape as the existing single-report
 * MarkDuplicateDialog (components/reports/triage-actions.tsx): type the original report's
 * id, confirm. Applies bulkMarkDuplicateAction, which calls the identical markDuplicate
 * RPC once per selected report -- no new backend primitive.
 */
function BulkMarkDuplicateDialog({
  organizationId,
  programId,
  selectedReportIds,
  onDone,
}: {
  organizationId: string;
  programId: string;
  selectedReportIds: string[];
  onDone: (result: { succeededReportIds: string[]; failed: { reportId: string; message: string }[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [duplicateOfReportId, setDuplicateOfReportId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setDuplicateOfReportId("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await bulkMarkDuplicateAction({ organizationId, programId, reportIds: selectedReportIds, duplicateOfReportId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setDuplicateOfReportId("");
      onDone(result.data);
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Mark {selectedReportIds.length} as duplicate
      </Button>
      <Dialog open={open} title={`Mark ${selectedReportIds.length} reports as a duplicate`} onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">
            Enter the ID of the original report in this same program. Each selected report becomes a duplicate of it independently -- this is a terminal state per report, and cannot be moved to another status afterward.
          </p>
          <Input label="Original report ID" required autoFocus value={duplicateOfReportId} onChange={(event) => setDuplicateOfReportId(event.target.value)} className="[&_input]:font-mono" error={error ?? undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Mark {selectedReportIds.length} duplicate
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * The organization triage inbox: server-filtered (status/severity are real `.eq()`
 * predicates -- see services/reports.ts's listReportsForProgram -- never fetched-then-
 * filtered in React) and keyset-paginated (the initial page is server-rendered; "Load
 * more" fetches the next page via a Server Action and appends, never re-fetching or
 * discarding what's already loaded). Changing a filter navigates to a fresh URL (query
 * params), which naturally resets pagination to page one -- there is no client state that
 * could drift from what the URL says is currently filtered.
 *
 * Responsive: a real table at `md` and above; below that, the identical rows render as
 * labelled cards (see the `md:hidden` block) -- never a horizontally-scrolled table on a
 * narrow viewport, per DESIGN.md's responsive requirement.
 */
export function ReportInboxTable({
  organizationId,
  programId,
  initialReports,
  initialNextCursor,
  status,
  severity,
  workloadSummary,
  assignee = "all",
  assignableStaff = [],
}: {
  organizationId: string;
  programId: string;
  initialReports: Report[];
  initialNextCursor: string | null;
  status: ReportStatus | "all";
  severity: ReportSeverity | "all";
  workloadSummary: ReportInboxWorkloadSummary;
  /** "all", "me", "unassigned", or a staff member's id (202610060011). */
  assignee?: string;
  assignableStaff?: { userId: string; displayName: string }[];
}) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filterPending, startFilterTransition] = useTransition();
  // Selection is a plain array of report ids, reset whenever the filtered result set
  // changes underneath it (a status/severity filter change navigates to a fresh URL,
  // which remounts this component with new initialReports -- see the filter form below --
  // so a stale selection referencing a now-filtered-out report can never linger).
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null);

  function toggleSelected(reportId: string) {
    setSelectedReportIds((current) => (current.includes(reportId) ? current.filter((id) => id !== reportId) : [...current, reportId]));
  }

  function toggleSelectAll() {
    setSelectedReportIds((current) => (current.length === reports.length ? [] : reports.map((report) => report.id)));
  }

  function handleBulkMarkDuplicateDone(result: { succeededReportIds: string[]; failed: { reportId: string; message: string }[] }) {
    setSelectedReportIds([]);
    if (result.failed.length === 0) {
      setBulkResultMessage(`Marked ${result.succeededReportIds.length} ${result.succeededReportIds.length === 1 ? "report" : "reports"} as duplicate.`);
    } else {
      setBulkResultMessage(
        `Marked ${result.succeededReportIds.length} as duplicate. ${result.failed.length} could not be changed (e.g. already moved to a different status).`,
      );
    }
    router.refresh();
  }

  function navigateWithFilters(next: { status?: ReportStatus | "all"; severity?: ReportSeverity | "all"; assignee?: string }) {
    const params = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextSeverity = next.severity ?? severity;
    const nextAssignee = next.assignee ?? assignee;
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextSeverity !== "all") params.set("severity", nextSeverity);
    if (nextAssignee !== "all") params.set("assignee", nextAssignee);
    const query = params.toString();
    // Wrapped in a transition so `pending` (surfaced on the two Selects below) flips
    // immediately on change, instead of the dropdown looking inert until the new
    // server-rendered page arrives -- router.push itself gives no pending signal on its own.
    startFilterTransition(() => {
      router.push((`/organizations/${organizationId}/programs/${programId}/reports` + (query ? `?${query}` : "")) as Route);
    });
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listReportsForProgramPageAction({
        programId,
        cursor: nextCursor,
        status: status === "all" ? undefined : status,
        severity: severity === "all" ? undefined : severity,
        assignee: assignee === "all" ? undefined : assignee,
      });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setReports((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  return (
    <div>
      <WorkloadSummaryStrip summary={workloadSummary} />

      {selectedReportIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-muted px-3 py-2.5">
          <p className="text-sm font-medium text-ink">
            {selectedReportIds.length} {selectedReportIds.length === 1 ? "report" : "reports"} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="quiet" onClick={() => setSelectedReportIds([])}>
              Clear selection
            </Button>
            <BulkMarkDuplicateDialog organizationId={organizationId} programId={programId} selectedReportIds={selectedReportIds} onDone={handleBulkMarkDuplicateDone} />
          </div>
        </div>
      )}
      {bulkResultMessage && (
        <p role="status" className="border-b border-border px-3 py-2 text-sm text-ink-muted">
          {bulkResultMessage}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
        <Select label="Filter by status" className="max-w-xs" disabled={filterPending} value={status} onChange={(event) => navigateWithFilters({ status: event.target.value as ReportStatus | "all" })}>
          <option value="all">All statuses</option>
          {FILTERABLE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {reportStatusLabel(value)}
            </option>
          ))}
        </Select>
        <Select label="Filter by severity" className="max-w-xs" disabled={filterPending} value={severity} onChange={(event) => navigateWithFilters({ severity: event.target.value as ReportSeverity | "all" })}>
          <option value="all">All severities</option>
          {FILTERABLE_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {severityLabel(value)}
            </option>
          ))}
        </Select>
        <Select label="Assigned to" className="max-w-xs" disabled={filterPending} value={assignee} onChange={(event) => navigateWithFilters({ assignee: event.target.value })}>
          <option value="all">Anyone</option>
          <option value="me">Me</option>
          <option value="unassigned">Unassigned</option>
          {assignableStaff.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.displayName}
            </option>
          ))}
        </Select>
        {filterPending && <span aria-hidden="true" className="mb-2.5 size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent text-ink-muted motion-reduce:animate-none" />}
      </div>

      {reports.length === 0 ? (
        status === "all" && severity === "all" && assignee === "all" ? (
          <EmptyState title="No reports yet">This program hasn't received any reports yet. They'll appear here as researchers submit findings.</EmptyState>
        ) : (
          <EmptyState title="No matching reports">No report in this program matches the current filters.</EmptyState>
        )
      ) : (
        <>
          {/* Desktop/tablet: a real table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    <span className="sr-only">Select</span>
                    <input
                      type="checkbox"
                      aria-label="Select all reports on this page"
                      checked={reports.length > 0 && selectedReportIds.length === reports.length}
                      onChange={toggleSelectAll}
                      className="size-4 accent-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    />
                  </th>
                  {["Severity", "Report", "Target", "Status", "Assignee", "Researcher", "Updated", "Next action"].map((header) => (
                    <th key={header} scope="col" className="px-4 py-3 font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    tabIndex={0}
                    className="border-b border-border relative last:border-0 transition-colors duration-150 hover:z-10 hover:bg-surface-muted hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)] motion-reduce:transition-none focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select report: ${report.title}`}
                        checked={selectedReportIds.includes(report.id)}
                        onChange={() => toggleSelected(report.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="size-4 accent-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      />
                    </td>
                    <td className="px-4 py-3">{report.confirmedSeverity ? <SeverityBadge severity={report.confirmedSeverity} /> : <span className="text-sm text-ink-muted">Not set</span>}</td>
                    <td className="px-4 py-3">
                      <Link prefetch={false}
                        href={`/organizations/${organizationId}/programs/${programId}/reports/${report.id}` as Route}
                        className="font-medium text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {report.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="break-all font-mono text-sm">{report.displayTarget}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{report.assigneeName ?? <span className="italic">Unassigned</span>}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{report.researcherName}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted"><LocalTime value={report.updatedAt} /></td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{reportNextActionLabel(report.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: labelled cards, never a shrunk/scrolled table. */}
          <ul className="divide-y divide-border md:hidden">
            {reports.map((report) => (
              <li key={report.id} className="p-4 transition-colors duration-150 hover:bg-surface-muted motion-reduce:transition-none">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select report: ${report.title}`}
                    checked={selectedReportIds.includes(report.id)}
                    onChange={() => toggleSelected(report.id)}
                    className="mt-0.5 size-4 shrink-0 accent-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  />
                  <Link prefetch={false}
                    href={`/organizations/${organizationId}/programs/${programId}/reports/${report.id}` as Route}
                    className="font-medium text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {report.title}
                  </Link>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-ink-muted">Severity</dt>
                  <dd>{report.confirmedSeverity ? <SeverityBadge severity={report.confirmedSeverity} /> : <span className="text-ink-muted">Not set</span>}</dd>
                  <dt className="text-ink-muted">Target</dt>
                  <dd className="break-all font-mono text-xs text-ink">{report.displayTarget}</dd>
                  <dt className="text-ink-muted">Status</dt>
                  <dd>
                    <StatusBadge status={report.status} />
                  </dd>
                  <dt className="text-ink-muted">Researcher</dt>
                  <dd className="text-ink">{report.researcherName}</dd>
                  <dt className="text-ink-muted">Updated</dt>
                  <dd className="text-ink"><LocalTime value={report.updatedAt} /></dd>
                  <dt className="text-ink-muted">Next action</dt>
                  <dd className="text-ink">{reportNextActionLabel(report.status)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      {pending && (
        <div className="space-y-2 border-t border-border p-4" role="status" aria-label="Loading more reports">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {loadError && (
        <div className="p-4">
          <ErrorState>{loadError}</ErrorState>
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center border-t border-border p-4">
          <Button variant="secondary" pending={pending} onClick={handleLoadMore}>
            Load more
          </Button>
        </div>
      ) : (
        reports.length > 0 && <p className="border-t border-border p-4 text-center text-sm text-ink-muted">End of results.</p>
      )}
    </div>
  );
}
