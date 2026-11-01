"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Select, Textarea } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import { decideReportRetestAction, escalateReportRetestAction, requestReportRetestAction } from "../../actions/reports";
import type { ReportRetest, ReportRetestStatus } from "../../types/report";
import { LocalTime } from "../ui/local-time";

type ReportRef = { organizationId: string; programId: string; reportId: string };

const RETEST_STATUS_LABEL: Record<ReportRetestStatus, string> = {
  requested: "Awaiting retest",
  confirmed_fixed: "Confirmed fixed",
  still_vulnerable: "Still vulnerable",
  escalated: "Escalated to platform review",
};

const RETEST_STATUS_TONE: Record<ReportRetestStatus, string> = {
  requested: "text-warning",
  confirmed_fixed: "text-success",
  still_vulnerable: "text-danger",
  escalated: "text-danger",
};

function RetestRow({ retest, canEscalate, organizationId, programId, reportId }: { retest: ReportRetest; canEscalate: boolean } & ReportRef) {
  return (
    <li className="py-3 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${RETEST_STATUS_TONE[retest.status]}`}>{RETEST_STATUS_LABEL[retest.status]}</span>
        <time className="text-xs text-ink-muted">Requested <LocalTime value={retest.requestedAt} /></time>
      </div>
      {retest.requesterNotes && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink-muted">{retest.requesterNotes}</p>}
      {retest.escalatedAt && (
        <p className="mt-2 text-xs font-medium text-danger">Escalated for platform review <LocalTime value={retest.escalatedAt} />. A platform administrator will review this independently of the organization.</p>
      )}
      {retest.decidedAt && (
        <div className="mt-2 rounded-md bg-surface-muted p-2.5">
          <p className="text-xs font-semibold text-ink-muted">Organization response · <LocalTime value={retest.decidedAt} /></p>
          {retest.decisionNotes && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{retest.decisionNotes}</p>}
        </div>
      )}
      {canEscalate && retest.status === "requested" && (
        <div className="mt-2">
          <EscalateButton organizationId={organizationId} programId={programId} reportId={reportId} retestId={retest.id} />
        </div>
      )}
    </li>
  );
}

function EscalateButton({ organizationId, programId, reportId, retestId }: ReportRef & { retestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEscalate() {
    setError(null);
    startTransition(async () => {
      const result = await escalateReportRetestAction({ organizationId, programId, reportId, retestId });
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

/** Retest is a real, narrowly-scoped sibling concept to report status -- never a reopening
 * of the report's own lifecycle (see docs/decisions/0075, supabase/migrations/
 * 202609050005_report_retest.sql). Only ever shown on a report the researcher submitted
 * that has reached 'resolved' -- the caller (report detail page) is responsible for that
 * gate, matching how ReportCollaboratorsPanel's own visibility is gated by its caller. */
export function ReportRetestPanel({
  organizationId,
  programId,
  reportId,
  retests,
  canRequest,
  canDecide,
  canEscalate,
}: ReportRef & { retests: ReportRetest[]; canRequest: boolean; canDecide: boolean; canEscalate: boolean }) {
  const hasOpenRequest = retests.some((r) => r.status === "requested");

  return (
    <div className="space-y-4">
      <SectionLabel>Retest</SectionLabel>
      {retests.length === 0 ? (
        <p className="text-sm text-ink-muted">No retest has been requested for this report yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {retests.map((retest) => (
            <RetestRow key={retest.id} retest={retest} canEscalate={canEscalate} organizationId={organizationId} programId={programId} reportId={reportId} />
          ))}
        </ul>
      )}

      {canRequest && !hasOpenRequest && <RequestRetestForm organizationId={organizationId} programId={programId} reportId={reportId} />}

      {canDecide && (
        <>
          {retests
            .filter((r) => r.status === "requested")
            .map((retest) => (
              <DecideRetestForm key={retest.id} organizationId={organizationId} programId={programId} reportId={reportId} retestId={retest.id} />
            ))}
        </>
      )}
    </div>
  );
}

function RequestRetestForm({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await requestReportRetestAction({ organizationId, programId, reportId, requesterNotes: notes || undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotes("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 border-t border-border pt-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm text-ink-muted">If the fix doesn't actually hold up when you re-check it, ask the organization to confirm.</p>
      <Textarea label="What did you find when you re-tested? (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" pending={pending}>
          Request retest
        </Button>
      </div>
    </form>
  );
}

function DecideRetestForm({ organizationId, programId, reportId, retestId }: ReportRef & { retestId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Extract<ReportRetestStatus, "confirmed_fixed" | "still_vulnerable">>("confirmed_fixed");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await decideReportRetestAction({ organizationId, programId, reportId, retestId, outcome, decisionNotes: notes || undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 border-t border-border pt-4" onSubmit={handleSubmit} noValidate>
      <SectionLabel>Record retest outcome</SectionLabel>
      <Select label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
        <option value="confirmed_fixed">Confirmed fixed</option>
        <option value="still_vulnerable">Still vulnerable</option>
      </Select>
      <Textarea label="Notes" required value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save outcome
        </Button>
      </div>
    </form>
  );
}
