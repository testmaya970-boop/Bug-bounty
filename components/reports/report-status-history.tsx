import React from "react";
import { LocalTime } from "../ui/local-time";
import type { ReportStatusEvent } from "../../services/reports";

const LABELS: Record<string, string> = {
  "report.created": "Submitted",
  "report.triage_started": "Triage started",
  "report.information_requested": "More information requested",
  "report.researcher_responded": "You responded",
  "report.accepted": "Accepted",
  "report.resolved": "Resolved",
  "report.marked_duplicate": "Marked duplicate",
  "report.marked_informative": "Marked informative",
  "report.marked_not_applicable": "Marked not applicable",
  "report.rejected": "Rejected",
  "report.severity_set": "Severity set",
  "report.reopened": "Reopened after a failed retest",
  "report.retest_requested": "Retest requested",
  "report.retest_decided": "Retest decided",
  "report.mediation_opened": "Mediation requested",
  "report.mediation_resolved": "Mediation answered",
  "bounty.finalized": "Bounty finalized",
  "bounty.adjusted": "Bounty adjusted",
  "report_disclosure.requested": "Disclosure requested",
  "report_disclosure.approved": "Disclosure approved",
  "report_disclosure.declined": "Disclosure declined",
  "report_disclosure.unpublished": "Disclosure unpublished",
};

const DETAIL: Record<string, string> = {
  confirmed_fixed: "confirmed fixed",
  still_vulnerable: "still vulnerable",
  resolved: "resolved",
  declined: "declined",
};

/** The researcher's view of what happened to their report (get_report_status_history):
 * decisions and when, never who on the organization's side or any internal note. */
export function ReportStatusHistory({ events }: { events: ReportStatusEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-ink-muted">Nothing has happened to this report yet.</p>;
  return (
    <ol className="space-y-2">
      {events.map((event, index) => (
        <li key={`${event.action}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-ink">
            {LABELS[event.action] ?? event.action}
            {event.detail && <span className="text-ink-muted"> · {DETAIL[event.detail] ?? event.detail}</span>}
          </span>
          <span className="text-xs text-ink-muted">
            <LocalTime value={event.occurredAt} />
          </span>
        </li>
      ))}
    </ol>
  );
}
