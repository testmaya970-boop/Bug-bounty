"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Select } from "../ui/form";
import { ErrorState, EmptyState, Skeleton } from "../ui/feedback";
import { Button } from "../ui/button";
import { SeverityBadge, StatusBadge } from "../ui/badge";
import { reportStatusLabel, reportNextActionLabel } from "../../lib/report-status";
import { listReportsForOrganizationPageAction } from "../../actions/reports";
import { formatDateTime } from "../../lib/format-date";
import type { Report, ReportSeverity, ReportStatus } from "../../types/report";

const FILTERABLE_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];
const FILTERABLE_SEVERITIES: ReportSeverity[] = ["none", "low", "medium", "high", "critical"];

/**
 * Findings: a flat, read-only, cross-program report list -- the org-wide counterpart to
 * ReportInboxTable (components/reports/report-inbox-table.tsx), which stays the
 * single-program surface that owns triage actions/bulk operations. This component is
 * deliberately narrower: no row selection, no bulk-mark-duplicate, no per-row triage
 * controls -- "scan everything across every engagement, then open the one report you
 * actually need to act on" (which lands on the real report detail page, where every
 * triage action already lives). Adding a Program column/filter is the one real structural
 * difference from the per-program table; everything else (server-side status/severity
 * filtering via URL query params, keyset "Load more" pagination, responsive table/card
 * split) follows that component's own established shape exactly.
 */
export function OrganizationFindingsTable({
  organizationId,
  initialReports,
  initialNextCursor,
  programId,
  status,
  severity,
  programOptions,
}: {
  organizationId: string;
  initialReports: Report[];
  initialNextCursor: string | null;
  programId: string | "all";
  status: ReportStatus | "all";
  severity: ReportSeverity | "all";
  programOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filterPending, startFilterTransition] = useTransition();

  const programNameById = new Map(programOptions.map((program) => [program.id, program.name]));

  function navigateWithFilters(next: { programId?: string | "all"; status?: ReportStatus | "all"; severity?: ReportSeverity | "all" }) {
    const params = new URLSearchParams();
    const nextProgramId = next.programId ?? programId;
    const nextStatus = next.status ?? status;
    const nextSeverity = next.severity ?? severity;
    if (nextProgramId !== "all") params.set("program", nextProgramId);
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextSeverity !== "all") params.set("severity", nextSeverity);
    const query = params.toString();
    startFilterTransition(() => {
      router.push((`/organizations/${organizationId}/findings` + (query ? `?${query}` : "")) as Route);
    });
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listReportsForOrganizationPageAction({
        organizationId,
        cursor: nextCursor,
        programId: programId === "all" ? undefined : programId,
        status: status === "all" ? undefined : status,
        severity: severity === "all" ? undefined : severity,
      });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setReports((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  const hasActiveFilter = programId !== "all" || status !== "all" || severity !== "all";

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
        <Select label="Engagement" className="max-w-xs" disabled={filterPending} value={programId} onChange={(event) => navigateWithFilters({ programId: event.target.value })}>
          <option value="all">All engagements</option>
          {programOptions.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </Select>
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
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </Select>
        {filterPending && <span aria-hidden="true" className="mb-2.5 size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent text-ink-muted motion-reduce:animate-none" />}
      </div>

      {reports.length === 0 ? (
        hasActiveFilter ? (
          <EmptyState title="No matching findings">No report across this organization's engagements matches the current filters.</EmptyState>
        ) : (
          <EmptyState title="No findings yet">Reports submitted to any of this organization's engagements will appear here.</EmptyState>
        )
      ) : (
        <>
          {/* Desktop/tablet: a real table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  {["Severity", "Report", "Engagement", "Target", "Status", "Researcher", "Updated", "Next action"].map((header) => (
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
                    className="border-b border-border relative last:border-0 transition-colors duration-150 hover:z-10 hover:bg-surface-muted hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)] motion-reduce:transition-none"
                  >
                    <td className="px-4 py-3">{report.confirmedSeverity ? <SeverityBadge severity={report.confirmedSeverity} /> : <span className="text-sm text-ink-muted">Not set</span>}</td>
                    <td className="px-4 py-3">
                      <Link prefetch={false}
                        href={`/organizations/${organizationId}/programs/${report.programId}/reports/${report.id}` as Route}
                        className="font-medium text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {report.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{programNameById.get(report.programId) ?? "Unknown engagement"}</td>
                    <td className="px-4 py-3">
                      <span className="break-all font-mono text-sm">{report.displayTarget}</span>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {report.matchedScopeEntryId ? (report.matchedScopeState === "in_scope" ? "In scope asset" : "Out-of-scope asset") : "No asset linked"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{report.researcherName}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{formatDateTime(report.updatedAt)}</td>
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
                <Link prefetch={false}
                  href={`/organizations/${organizationId}/programs/${report.programId}/reports/${report.id}` as Route}
                  className="font-medium text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {report.title}
                </Link>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-ink-muted">Severity</dt>
                  <dd>{report.confirmedSeverity ? <SeverityBadge severity={report.confirmedSeverity} /> : <span className="text-ink-muted">Not set</span>}</dd>
                  <dt className="text-ink-muted">Engagement</dt>
                  <dd className="text-ink">{programNameById.get(report.programId) ?? "Unknown engagement"}</dd>
                  <dt className="text-ink-muted">Target</dt>
                  <dd className="break-all font-mono text-xs text-ink">{report.displayTarget}</dd>
                  <dt className="text-ink-muted">Asset</dt>
                  <dd className="text-ink">{report.matchedScopeEntryId ? (report.matchedScopeState === "in_scope" ? "In scope" : "Out of scope") : "No asset linked"}</dd>
                  <dt className="text-ink-muted">Status</dt>
                  <dd>
                    <StatusBadge status={report.status} />
                  </dd>
                  <dt className="text-ink-muted">Researcher</dt>
                  <dd className="text-ink">{report.researcherName}</dd>
                  <dt className="text-ink-muted">Updated</dt>
                  <dd className="text-ink">{formatDateTime(report.updatedAt)}</dd>
                  <dt className="text-ink-muted">Next action</dt>
                  <dd className="text-ink">{reportNextActionLabel(report.status)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      {pending && (
        <div className="space-y-2 border-t border-border p-4" role="status" aria-label="Loading more findings">
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
