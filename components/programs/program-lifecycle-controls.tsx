"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Panel } from "../ui/feedback";
import { Dialog } from "../ui/navigation";
import { closeProgramAction, pauseProgramAction, resumeProgramAction, submitProgramForReviewAction } from "../../actions/programs";
import type { ProgramStatus } from "../../types/program";

// requiresConfirmation gates the two actions this panel itself describes as high-consequence
// ("This cannot be undone" for Close; Pause stops new report intake for a live program) --
// every other destructive control in this codebase (DeleteDraftProgramDialog, suspend/
// reject flows) confirms once before firing, but this panel fired action.run() straight
// from the click handler with no confirmation step at all -- a single misclick paused or
// permanently closed a real, active program. Submit/Resume stay single-click: both are
// low-consequence (submitting for review or resuming intake is easily reversed or was
// already the intended next step), matching this codebase's existing convention of
// reserving confirmation dialogs for the genuinely hard-to-reverse actions, not every click.
type LifecycleAction = { label: string; description: string; variant: "primary" | "secondary" | "destructive"; requiresConfirmation?: boolean; run: () => Promise<{ ok: boolean; message?: string }> };

/**
 * The missing half of docs/decisions/0021 -- every lifecycle transition RPC/action
 * (submitProgramForReviewAction, activateProgramAction, pauseProgramAction,
 * resumeProgramAction, closeProgramAction) has existed since that slice, but none were
 * ever wired to a real control on this page; a program created at 'draft' had no way to
 * ever leave it except by calling a Server Action directly. One action per status,
 * matching DOMAIN.md's own lifecycle (draft->review->active<->paused->closed) exactly --
 * never a generic "change status" dropdown that could attempt an invalid transition the
 * database would just reject.
 *
 * 'review' has NO org-side action anymore (see supabase/migrations/
 * 202609050013_program_launch_review_gate.sql): activate_program now requires real
 * platform-admin authority, not the organization's own owner/security_admin -- an org
 * that submits for review is waiting on a platform admin's decision at /platform/programs,
 * not clicking a button of its own. Showing an "Activate program" button here that the
 * database would just reject with FORBIDDEN would be a real control that doesn't work,
 * not a legitimate lifecycle action -- worse than no control at all.
 */
export function ProgramLifecycleControls({ organizationId, programId, status }: { organizationId: string; programId: string; status: ProgramStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<LifecycleAction | null>(null);

  const actionsByStatus: Record<ProgramStatus, LifecycleAction[]> = {
    draft: [
      {
        label: "Submit for review",
        description: "Move this program to review before it can go active.",
        variant: "primary",
        run: () => submitProgramForReviewAction({ organizationId, programId }),
      },
    ],
    review: [],
    active: [
      {
        label: "Pause program",
        description: "Stop new reports for now.",
        variant: "secondary",
        requiresConfirmation: true,
        run: () => pauseProgramAction({ organizationId, programId }),
      },
      {
        label: "Close program",
        description: "Stop new reports for good.",
        variant: "destructive",
        requiresConfirmation: true,
        run: () => closeProgramAction({ organizationId, programId }),
      },
    ],
    paused: [
      {
        label: "Resume program",
        description: "Accept new reports again.",
        variant: "primary",
        run: () => resumeProgramAction({ organizationId, programId }),
      },
      {
        label: "Close program",
        description: "Stop new reports for good.",
        variant: "destructive",
        requiresConfirmation: true,
        run: () => closeProgramAction({ organizationId, programId }),
      },
    ],
    closed: [],
    // Platform-imposed (suspend_program) -- only a platform admin can lift it.
    suspended: [],
  };

  const actions = actionsByStatus[status];
  if (actions.length === 0) return null;

  function handleRun(action: LifecycleAction) {
    setError(null);
    startTransition(async () => {
      const result = await action.run();
      if (!result.ok) {
        setError(result.message ?? "Check the form and try again.");
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  function handleClick(action: LifecycleAction) {
    if (action.requiresConfirmation) {
      setConfirming(action);
      return;
    }
    handleRun(action);
  }

  return (
    <Panel className="space-y-3 p-5">
      {actions.map((action) => (
        <div key={action.label} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">{action.description}</p>
          <Button variant={action.variant} pending={pending} onClick={() => handleClick(action)}>
            {action.label}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Dialog open={confirming !== null} title={confirming ? `${confirming.label}?` : ""} onClose={() => (pending ? undefined : setConfirming(null))}>
        {confirming && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">{confirming.description}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" variant={confirming.variant} pending={pending} onClick={() => handleRun(confirming)}>
                {confirming.label}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Panel>
  );
}
