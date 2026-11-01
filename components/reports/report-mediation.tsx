"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Select, Textarea } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import { escalateReportMediationAction, openReportMediationAction, resolveReportMediationAction } from "../../actions/reports";
import type { ReportMediation, ReportMediationReason, ReportMediationStatus } from "../../types/report";
import { LocalTime } from "../ui/local-time";

type ReportRef = { organizationId: string; programId: string; reportId: string };

const MEDIATION_REASON_LABEL: Record<ReportMediationReason, string> = {
  disagree_with_outcome: "I disagree with the outcome",
  disagree_with_severity: "I disagree with the confirmed severity",
  disagree_with_bounty: "I disagree with the bounty amount",
  unresponsive_communication: "The organization stopped responding",
  other: "Other",
};

const MEDIATION_STATUS_LABEL: Record<ReportMediationStatus, string> = { open: "Open", escalated: "Escalated to platform review", resolved: "Resolved", declined: "Declined" };
const MEDIATION_STATUS_TONE: Record<ReportMediationStatus, string> = { open: "text-warning", escalated: "text-danger", resolved: "text-success", declined: "text-ink-muted" };

function MediationRow({ mediation, canEscalate, organizationId, programId, reportId }: { mediation: ReportMediation; canEscalate: boolean } & ReportRef) {
  return (
    <li className="py-3 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${MEDIATION_STATUS_TONE[mediation.status]}`}>
          {MEDIATION_STATUS_LABEL[mediation.status]} · {MEDIATION_REASON_LABEL[mediation.reason]}
        </span>
        <time className="text-xs text-ink-muted">Opened <LocalTime value={mediation.openedAt} /></time>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink-muted">{mediation.description}</p>
      {mediation.escalatedAt && (
        <p className="mt-2 text-xs font-medium text-danger">Escalated for platform review <LocalTime value={mediation.escalatedAt} />. A platform administrator will review this independently of the organization.</p>
      )}
      {mediation.resolvedAt && (
        <div className="mt-2 rounded-md bg-surface-muted p-2.5">
          <p className="text-xs font-semibold text-ink-muted">Response · <LocalTime value={mediation.resolvedAt} /></p>
          {mediation.resolutionNotes && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{mediation.resolutionNotes}</p>}
        </div>
      )}
      {canEscalate && mediation.status === "open" && (
        <div className="mt-2">
          <EscalateButton organizationId={organizationId} programId={programId} reportId={reportId} mediationId={mediation.id} />
        </div>
      )}
    </li>
  );
}

function EscalateButton({ organizationId, programId, reportId, mediationId }: ReportRef & { mediationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEscalate() {
    setError(null);
    startTransition(async () => {
      const result = await escalateReportMediationAction({ organizationId, programId, reportId, mediationId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Button type="button" variant="quiet" pending={pending} onClick={handleEscalate} className="text-danger hover:bg-danger/10">
        Escalate to platform review
      </Button>
      <p className="mt-1 text-xs text-ink-muted">If the organization hasn't responded or you disagree with how this is being handled, escalate for an independent platform review.</p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A researcher-initiated dispute over a terminal report's outcome, severity, or bounty --
 * resolved by the organization's own owner/security_admin, since no platform-level
 * adjudicator exists in this schema yet (see docs/decisions/0075, supabase/migrations/
 * 202609050006_report_mediation.sql's own comment). Only ever shown on a report that has
 * reached a terminal status -- the caller (report detail page) gates visibility. */
export function ReportMediationPanel({
  organizationId,
  programId,
  reportId,
  mediations,
  canOpen,
  canResolve,
}: ReportRef & { mediations: ReportMediation[]; canOpen: boolean; canResolve: boolean }) {
  const hasOpenOrEscalatedDispute = mediations.some((m) => m.status === "open" || m.status === "escalated");

  return (
    <div className="space-y-4">
      <SectionLabel>Mediation</SectionLabel>
      {mediations.length === 0 ? (
        <p className="text-sm text-ink-muted">No dispute has been raised on this report.</p>
      ) : (
        <ul className="divide-y divide-border">
          {mediations.map((mediation) => (
            <MediationRow key={mediation.id} mediation={mediation} canEscalate={canOpen} organizationId={organizationId} programId={programId} reportId={reportId} />
          ))}
        </ul>
      )}

      {canOpen && !hasOpenOrEscalatedDispute && <OpenMediationForm organizationId={organizationId} programId={programId} reportId={reportId} />}

      {canResolve &&
        mediations
          .filter((m) => m.status === "open")
          .map((mediation) => <ResolveMediationForm key={mediation.id} organizationId={organizationId} programId={programId} reportId={reportId} mediationId={mediation.id} />)}
    </div>
  );
}

function OpenMediationForm({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const [reason, setReason] = useState<ReportMediationReason>("disagree_with_outcome");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await openReportMediationAction({ organizationId, programId, reportId, reason, description });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDescription("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 border-t border-border pt-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm text-ink-muted">If you believe this report's outcome, severity, or bounty was wrong, say so here.</p>
      <Select label="Reason" value={reason} onChange={(event) => setReason(event.target.value as ReportMediationReason)}>
        {(Object.keys(MEDIATION_REASON_LABEL) as ReportMediationReason[]).map((value) => (
          <option key={value} value={value}>
            {MEDIATION_REASON_LABEL[value]}
          </option>
        ))}
      </Select>
      <Textarea label="Explain what you're disputing" required value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" pending={pending}>
          Open mediation
        </Button>
      </div>
    </form>
  );
}

function ResolveMediationForm({ organizationId, programId, reportId, mediationId }: ReportRef & { mediationId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Extract<ReportMediationStatus, "resolved" | "declined">>("resolved");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await resolveReportMediationAction({ organizationId, programId, reportId, mediationId, outcome, resolutionNotes: notes });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 border-t border-border pt-4" onSubmit={handleSubmit} noValidate>
      <SectionLabel>Respond to dispute</SectionLabel>
      <Select label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
        <option value="resolved">Resolved</option>
        <option value="declined">Declined</option>
      </Select>
      <Textarea label="Explain the resolution" required value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={3000} error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save response
        </Button>
      </div>
    </form>
  );
}
