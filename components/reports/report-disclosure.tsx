"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import { approveReportDisclosureAction, declineReportDisclosureAction, requestReportDisclosureAction } from "../../actions/report-disclosures";
import type { ReportDisclosure } from "../../types/report";
import { LocalTime } from "../ui/local-time";

const STATUS_LABEL: Record<ReportDisclosure["status"], string> = { requested: "Pending review", approved: "Published", declined: "Declined" };
const STATUS_TONE: Record<ReportDisclosure["status"], string> = { requested: "text-warning", approved: "text-success", declined: "text-danger" };

/**
 * Researcher-facing: request public disclosure of a terminal report, or see the current
 * request state. Local state updates immediately from each action's own returned row --
 * no router.refresh() wait (see docs/decisions/0055.1's own pattern for why). Only
 * rendered on a terminal report (isFinal), matching the RPC's own
 * private.get_terminal_report_for_disclosure gate.
 */
export function ResearcherDisclosurePanel({ reportId, initialDisclosure }: { reportId: string; initialDisclosure: ReportDisclosure | null }) {
  const [disclosure, setDisclosure] = useState(initialDisclosure);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const result = await requestReportDisclosureAction({ reportId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDisclosure(result.data);
    });
  }

  return (
    <div>
      <SectionLabel>Public disclosure</SectionLabel>
      {!disclosure ? (
        <>
          <p className="mt-2 text-sm text-ink-muted">Ask the organization to publish this report publicly. Nothing is published until they approve. You can see their decision here.</p>
          <Button variant="secondary" className="mt-3" pending={pending} onClick={handleRequest}>
            Request disclosure
          </Button>
        </>
      ) : (
        <>
          <p className={`mt-2 text-sm font-semibold ${STATUS_TONE[disclosure.status]}`}>{STATUS_LABEL[disclosure.status]}</p>
          {disclosure.status === "requested" && <p className="mt-1 text-sm text-ink-muted">Requested <LocalTime value={disclosure.requestedAt} />.</p>}
          {disclosure.status === "approved" && disclosure.publishedAt && (
            <p className="mt-1 text-sm text-ink-muted">
              Published <LocalTime value={disclosure.publishedAt} />.{" "}
              <a href="/disclosures" className="font-medium text-action hover:underline">
                view public page
              </a>
            </p>
          )}
          {disclosure.status === "declined" && (
            <>
              {disclosure.declineReason && <p className="mt-1 text-sm text-ink-muted">Reason: {disclosure.declineReason}</p>}
              <Button variant="secondary" className="mt-3" pending={pending} onClick={handleRequest}>
                Request again
              </Button>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Organization-facing: approve or decline a pending disclosure request. Only rendered
 * when a request is actually pending (status === "requested") -- an org manager sees
 * nothing here otherwise, matching this product's "no dead-end UI" convention.
 */
export function OrganizationDisclosureDecisionPanel({ reportId, disclosure }: { reportId: string; disclosure: ReportDisclosure }) {
  const [current, setCurrent] = useState(disclosure);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveReportDisclosureAction({ reportId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCurrent(result.data);
    });
  }

  function handleDecline(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await declineReportDisclosureAction({ reportId, reason: reason || undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCurrent(result.data);
    });
  }

  if (current.status !== "requested") {
    return (
      <div>
        <SectionLabel>Public disclosure</SectionLabel>
        <p className={`mt-2 text-sm font-semibold ${STATUS_TONE[current.status]}`}>{STATUS_LABEL[current.status]}</p>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>Public disclosure requested</SectionLabel>
      <p className="mt-2 text-sm text-ink-muted">The researcher has asked to publish this report publicly. Approving publishes the report's title and resolution summary, nothing else.</p>

      {!declining ? (
        <div className="mt-3 flex gap-2">
          <Button pending={pending} onClick={handleApprove}>
            Approve & publish
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={handleDecline}>
          <Textarea label="Reason (shown to the researcher, optional)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" pending={pending}>
              Confirm decline
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setDeclining(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
