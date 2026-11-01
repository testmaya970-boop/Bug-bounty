"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconButton } from "../ui/button";
import { EmptyState } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { removeReportCollaboratorAction } from "../../actions/reports";
import { InviteCollaboratorForm } from "../researcher/journey-forms";
import Link from "next/link";
import type { Route } from "next";
import type { ReportCollaborator } from "../../types/report";
import { LocalTime } from "../ui/local-time";
import { Trash } from "@phosphor-icons/react";

type ReportRef = { organizationId: string; programId: string; reportId: string };

/** Every collaborator's own bounty_split_percent is real, stored data -- the submitter's
 * share is deliberately never a row in report_collaborators (see
 * docs/decisions/0064-report-collaboration-scope.md), so it is computed here as the
 * remainder, the same way the database computes it at payout time. This can never drift
 * out of sync with the collaborator rows because it isn't stored anywhere to drift from. */
function submitterSharePercent(collaborators: ReportCollaborator[]): number {
  const collaboratorTotal = collaborators.reduce((sum, c) => sum + c.bountySplitPercent, 0);
  return Math.round((100 - collaboratorTotal) * 100) / 100;
}

function RemoveCollaboratorButton({ organizationId, programId, reportId, collaboratorId }: ReportRef & { collaboratorId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeReportCollaboratorAction({ organizationId, programId, reportId, collaboratorId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <IconButton label="Remove" variant="quiet" pending={pending} onClick={handleRemove} className="text-danger [@media(hover:hover)_and_(pointer:fine)]:hover:bg-danger/10">
        {!pending && <Trash aria-hidden="true" className="size-[18px]" />}
      </IconButton>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Read-only for a collaborator or program staff; the submitter additionally gets a
 * "Remove" action per row (server-enforced -- see remove_report_collaborator) and the
 * invitation form below (the invitee must accept, 202610280001). `canManage` is exactly "is the submitter," not "is
 * signed in" -- a collaborator can read this list but never edit it. `locked` mirrors
 * invite_report_collaborator/remove_report_collaborator's own status gate (only 'new' or
 * 'triaging' accept changes) -- hidden here too so the submitter is never shown a form
 * that would just fail server-side once triage has moved past that point. */
export function ReportCollaboratorsPanel({
  organizationId,
  programId,
  reportId,
  collaborators,
  submitterName,
  canManage,
  locked,
}: ReportRef & { collaborators: ReportCollaborator[]; submitterName: string; canManage: boolean; locked: boolean }) {
  const submitterShare = submitterSharePercent(collaborators);

  return (
    <div className="space-y-4">
      <SectionLabel>Collaborators</SectionLabel>
      <ul className="divide-y divide-border">
        <li className="flex items-center justify-between py-2.5 text-sm">
          <span className="font-medium text-ink">{submitterName} · Submitter</span>
          <span className="font-mono text-ink-muted">{submitterShare}%</span>
        </li>
        {collaborators.map((collaborator) => (
          <li key={collaborator.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div>
              <p className="font-medium text-ink">{collaborator.displayName}</p>
              <p className="text-xs text-ink-muted">
                Added <LocalTime value={collaborator.addedAt} dateOnly />
                {collaborator.publicUsername && ` · @${collaborator.publicUsername}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-ink-muted">{collaborator.bountySplitPercent}%</span>
              {canManage && !locked && <RemoveCollaboratorButton organizationId={organizationId} programId={programId} reportId={reportId} collaboratorId={collaborator.id} />}
            </div>
          </li>
        ))}
      </ul>
      {canManage && (locked ? (
        <p className="border-t border-border pt-4 text-xs text-ink-muted">Collaborators are locked once triage has moved past the initial review.</p>
      ) : (
        <div className="space-y-2 border-t border-border pt-4">
          <InviteCollaboratorForm reportId={reportId} />
          <p className="text-xs text-ink-muted">
            They join once they accept. Track invitations in{" "}
            <Link prefetch={false} href={"/settings/collaboration" as Route} className="font-medium text-action underline underline-offset-2">
              Settings, Collaboration
            </Link>
            .
          </p>
        </div>
      ))}
    </div>
  );
}

/** Shown only once the schema genuinely has no collaboration model for a given context --
 * see docs/decisions/0064's own comment for why this stayed honest rather than fabricated
 * before this feature existed. Kept as a small, separate fallback for any future context
 * where collaboration truly isn't applicable, distinct from "this report has none yet." */
export function NoCollaboratorsYet() {
  return <EmptyState title="No collaborators">This report has no collaborators. Every report starts with one submitter.</EmptyState>;
}
