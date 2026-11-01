"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Select, Textarea } from "../ui/form";
import { reportStatusLabel, severityLabel } from "../../lib/report-status";
import {
  acceptReportAction,
  markDuplicateAction,
  markInformativeAction,
  markNotApplicableAction,
  rejectReportAction,
  requestInformationAction,
  resolveReportAction,
  setReportSeverityAction,
  startTriageAction,
} from "../../actions/reports";
import type { ReportSeverity, ReportStatus } from "../../types/report";

type ReportRef = { organizationId: string; programId: string; reportId: string };

/**
 * The inbox's own triage action panel -- deliberately NOT the report detail page's
 * TriageActionPanel/SeverityControl (components/reports/triage-actions.tsx), which are
 * built around TriageStatusRailProvider's optimistic local status/severity. Phase 5.5's
 * explicit contract for this surface is the opposite: ONE typed server-action result,
 * buttons disabled while any action in this panel is pending, on success the page's real
 * server-rendered state is what changes (via router.refresh() re-fetching the Suspense
 * boundary this panel lives in -- see the page's own comment on why /inbox uses
 * Suspense), and on INVALID_TRANSITION (or any other rejection) the server's own message
 * is shown and NOTHING in this panel's own rendered state changes -- no local
 * status/severity flip to roll back, because none was ever made. The report detail page
 * keeps its own optimistic mechanism unchanged; this is a second, independently correct
 * pattern for a second surface, not a replacement.
 *
 * A single `pending` flag covers every action in this panel (not one per button) --
 * clicking Accept disables Reject/Resolve/etc. too, preventing a second, conflicting
 * transition from firing against the same report while the first is still in flight (the
 * database's own is_valid_report_transition would reject the loser anyway, but disabling
 * here avoids the confusing default of a click that silently does nothing).
 */
export function InboxTriageControls({
  organizationId,
  programId,
  reportId,
  status,
  allowedNext,
  currentSeverity,
  isFinal,
}: ReportRef & { status: ReportStatus; allowedNext: ReportStatus[]; currentSeverity: ReportSeverity | null; isFinal: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requestInfoOpen, setRequestInfoOpen] = useState(false);
  const [requestInfoReason, setRequestInfoReason] = useState("");
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateOfReportId, setDuplicateOfReportId] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveSummary, setResolveSummary] = useState("");

  const ref: ReportRef = { organizationId, programId, reportId };

  // Every action funnels through this one function: run the action, and on success do
  // ONLY router.refresh() -- never touch any local status/severity value. On failure,
  // surface the server's own message and change nothing else (no rollback needed, since
  // nothing was ever optimistically applied).
  function runAction(action: () => ReturnType<typeof acceptReportAction>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function handleSeverityChange(severity: ReportSeverity) {
    runAction(() => setReportSeverityAction({ ...ref, severity }));
  }

  function handleRequestInfoSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const reason = requestInfoReason;
    setRequestInfoOpen(false);
    runAction(() => requestInformationAction({ ...ref, reason }));
    setRequestInfoReason("");
  }

  function handleDuplicateSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !duplicateOfReportId) return;
    const target = duplicateOfReportId;
    setDuplicateOpen(false);
    runAction(() => markDuplicateAction({ ...ref, duplicateOfReportId: target }));
    setDuplicateOfReportId("");
  }

  function handleResolveSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const summary = resolveSummary;
    setResolveOpen(false);
    runAction(() => resolveReportAction({ ...ref, resolutionSummary: summary }));
    setResolveSummary("");
  }

  return (
    <div className="space-y-5">
      <div>
        <Select
          label="Confirmed severity"
          helperText="The organization's assessment. Visible to the researcher."
          value={currentSeverity ?? ""}
          disabled={pending || isFinal}
          onChange={(event) => handleSeverityChange(event.target.value as ReportSeverity)}
        >
          <option value="" disabled>
            Not set
          </option>
          {(["none", "low", "medium", "high", "critical"] as ReportSeverity[]).map((severity) => (
            <option key={severity} value={severity}>
              {severityLabel(severity)}
            </option>
          ))}
        </Select>
        {isFinal && <p className="mt-1 text-xs text-ink-muted">Fixed now that a final decision has been made.</p>}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {allowedNext.length === 0 ? (
        <p className="text-sm text-ink-muted">{reportStatusLabel(status)} is a terminal state. No further triage actions are available.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allowedNext.includes("triaging") && (
            <Button pending={pending} disabled={pending} onClick={() => runAction(() => startTriageAction(ref))}>
              Start triage
            </Button>
          )}
          {allowedNext.includes("needs_information") && (
            <Button variant="secondary" disabled={pending} onClick={() => setRequestInfoOpen(true)}>
              Request information
            </Button>
          )}
          {allowedNext.includes("accepted") && (
            <Button disabled={pending} onClick={() => runAction(() => acceptReportAction(ref))}>
              Accept
            </Button>
          )}
          {allowedNext.includes("resolved") && (
            <Button disabled={pending} onClick={() => setResolveOpen(true)}>
              Resolve
            </Button>
          )}
          {allowedNext.includes("duplicate") && (
            <Button variant="secondary" disabled={pending} onClick={() => setDuplicateOpen(true)}>
              Mark duplicate
            </Button>
          )}
          {allowedNext.includes("informative") && (
            <Button variant="secondary" disabled={pending} onClick={() => runAction(() => markInformativeAction(ref))}>
              Mark informative
            </Button>
          )}
          {allowedNext.includes("not_applicable") && (
            <Button variant="secondary" disabled={pending} onClick={() => runAction(() => markNotApplicableAction(ref))}>
              Mark not applicable
            </Button>
          )}
          {allowedNext.includes("rejected") && (
            <Button variant="destructive" disabled={pending} onClick={() => runAction(() => rejectReportAction(ref))}>
              Reject
            </Button>
          )}
        </div>
      )}

      {requestInfoOpen && (
        <form className="space-y-2 rounded-md border border-border p-3" onSubmit={handleRequestInfoSubmit}>
          <Textarea label="What do you need from the researcher?" required autoFocus value={requestInfoReason} onChange={(event) => setRequestInfoReason(event.target.value)} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRequestInfoOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Send request
            </Button>
          </div>
        </form>
      )}

      {duplicateOpen && (
        <form className="space-y-2 rounded-md border border-border p-3" onSubmit={handleDuplicateSubmit}>
          <p className="text-xs text-ink-muted">Enter the ID of the original report in this program.</p>
          <input
            type="text"
            required
            autoFocus
            value={duplicateOfReportId}
            onChange={(event) => setDuplicateOfReportId(event.target.value)}
            placeholder="Original report ID"
            className="min-h-9 w-full rounded border border-border bg-surface px-2 font-mono text-xs text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDuplicateOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending} disabled={!duplicateOfReportId}>
              Mark duplicate
            </Button>
          </div>
        </form>
      )}

      {resolveOpen && (
        <form className="space-y-2 rounded-md border border-border p-3" onSubmit={handleResolveSubmit}>
          <Textarea label="How was this resolved?" required autoFocus value={resolveSummary} onChange={(event) => setResolveSummary(event.target.value)} maxLength={5000} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setResolveOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Resolve report
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
