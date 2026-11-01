import React from "react";
import { ActivityTimeline } from "../ui/data-display";
import { minorUnitsToDecimalString } from "../../lib/money";
import { LocalTime } from "../ui/local-time";
import type { OrganizationAuditEventRecord } from "../../types/organization";

const ACTION_LABELS: Record<string, string> = {
  "report.created": "submitted the report",
  "report.triage_started": "started triage",
  "report.information_requested": "requested more information",
  "report.researcher_responded": "responded with more information",
  "report.accepted": "accepted the report",
  "report.marked_duplicate": "marked the report a duplicate",
  "report.marked_informative": "marked the report informative",
  "report.marked_not_applicable": "marked the report not applicable",
  "report.rejected": "rejected the report",
  "report.resolved": "resolved the report",
  "report.severity_set": "set the severity",
  "report.message_posted": "posted a message",
  "report.evidence_added": "added evidence",
  "bounty.calculated": "calculated a bounty recommendation",
  "bounty.finalized": "finalized the bounty",
  "bounty.adjusted": "adjusted the bounty",
  "payment.obligation_created": "created a payment obligation",
  "payment.initiated": "initiated a payout attempt",
  "payment.succeeded": "recorded the payout as succeeded",
  "payment.failed": "recorded the payout as failed",
  "payment.cancelled": "cancelled the payment obligation",
};

function visibilityDetail(metadata: Record<string, unknown>): string {
  return metadata.visibility === "internal" ? "Internal only" : "Researcher-visible";
}

function describeEvent(event: OrganizationAuditEventRecord, actorName: string): { title: string; detail: string } {
  const actionLabel = ACTION_LABELS[event.action] ?? event.action;
  const title = event.actorId ? `${actorName} ${actionLabel}` : `System event: ${actionLabel}`;

  if (event.action === "report.severity_set" && typeof event.metadata.new_severity === "string") {
    const previous = typeof event.metadata.previous_severity === "string" ? event.metadata.previous_severity : "none";
    return { title, detail: `${previous} → ${event.metadata.new_severity}` };
  }
  if (event.action === "report.message_posted") {
    return { title, detail: visibilityDetail(event.metadata) };
  }
  if (event.action === "report.evidence_added") {
    const type = typeof event.metadata.evidence_type === "string" ? event.metadata.evidence_type : "evidence";
    return { title, detail: `${type}: ${visibilityDetail(event.metadata)}` };
  }
  if (event.action === "bounty.calculated") {
    if (event.metadata.state === "ineligible") return { title, detail: "Not bounty-eligible" };
    const severity = typeof event.metadata.severity === "string" ? event.metadata.severity : "unknown";
    return { title, detail: `${severity} severity` };
  }
  if (event.action === "bounty.finalized" && typeof event.metadata.amount_minor_units === "number" && typeof event.metadata.currency === "string") {
    return { title, detail: `${event.metadata.currency} ${minorUnitsToDecimalString(event.metadata.amount_minor_units)}` };
  }
  if (
    event.action === "bounty.adjusted" &&
    typeof event.metadata.previous_amount_minor_units === "number" &&
    typeof event.metadata.new_amount_minor_units === "number"
  ) {
    return { title, detail: `${minorUnitsToDecimalString(event.metadata.previous_amount_minor_units)} → ${minorUnitsToDecimalString(event.metadata.new_amount_minor_units)}` };
  }
  if (
    (event.action === "payment.obligation_created" || event.action === "payment.succeeded") &&
    typeof event.metadata.amount_minor_units === "number" &&
    typeof event.metadata.currency === "string"
  ) {
    return { title, detail: `${event.metadata.currency} ${minorUnitsToDecimalString(event.metadata.amount_minor_units)}` };
  }
  if (event.action === "payment.failed" && typeof event.metadata.failure_code === "string") {
    return { title, detail: event.metadata.failure_code };
  }
  if (event.action === "payment.cancelled" && typeof event.metadata.reason === "string") {
    return { title, detail: event.metadata.reason };
  }
  return { title, detail: "" };
}

/** Triage decision history, manager-facing only -- the researcher-appropriate subset of
 * this same history is already surfaced directly on the report (status, resolution
 * summary) or through the Communication/Evidence sections' own researcher-visible view,
 * rather than as a raw log. See docs/decisions/0009-report-triage-state-machine.md and
 * docs/decisions/0010-report-evidence-and-communication.md. */
export function ReportActivity({ events, actorNames }: { events: OrganizationAuditEventRecord[]; actorNames: Record<string, string> }) {
  const items = events.map((event) => {
    const actorName = (event.actorId && actorNames[event.actorId]) || "A team member";
    const { title, detail } = describeEvent(event, actorName);
    return { id: event.id, title, detail, timestamp: <LocalTime value={event.createdAt} /> };
  });
  return <ActivityTimeline items={items} />;
}
