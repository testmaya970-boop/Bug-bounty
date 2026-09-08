"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Panel } from "../ui/feedback";
import { closeProgramAction, pauseProgramAction, resumeProgramAction, submitProgramForReviewAction } from "../../actions/programs";
import type { ProgramStatus } from "../../types/program";

type LifecycleAction = { label: string; description: string; variant: "primary" | "secondary" | "destructive"; run: () => Promise<{ ok: boolean; message?: string }> };

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
        description: "Temporarily stop accepting new reports. Existing reports are unaffected.",
        variant: "secondary",
        run: () => pauseProgramAction({ organizationId, programId }),
      },
      {
        label: "Close program",
        description: "Permanently stop accepting new reports. This cannot be undone.",
        variant: "destructive",
        run: () => closeProgramAction({ organizationId, programId }),
      },
    ],
    paused: [
      {
        label: "Resume program",
        description: "Start accepting new reports again.",
        variant: "primary",
        run: () => resumeProgramAction({ organizationId, programId }),
      },
      {
        label: "Close program",
        description: "Permanently stop accepting new reports. This cannot be undone.",
        variant: "destructive",
        run: () => closeProgramAction({ organizationId, programId }),
      },
    ],
    closed: [],
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
      router.refresh();
    });
  }

  return (
    <Panel className="space-y-3 p-5">
      {actions.map((action) => (
        <div key={action.label} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">{action.description}</p>
          <Button variant={action.variant} pending={pending} onClick={() => handleRun(action)}>
            {action.label}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}
