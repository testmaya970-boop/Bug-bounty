"use client";

import React, { useState, useTransition } from "react";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { reinstateResearcherAction, revokeResearcherAction, suspendResearcherAction } from "../../actions/program-researchers";

type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";

function ConfirmActionDialog({
  triggerLabel,
  triggerVariant = "secondary",
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.message ?? "This action could not be completed.");
        return;
      }
      close();
    });
  }

  return (
    <>
      <Button variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} title={title} onClose={close}>
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-ink-muted">{description}</div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" pending={pending} onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function SuspendResearcherDialog({ organizationId, programId, targetUserId }: { organizationId: string; programId: string; targetUserId: string }) {
  return (
    <ConfirmActionDialog
      triggerLabel="Suspend"
      title="Suspend researcher?"
      description={
        <>
          <p>The researcher will immediately lose read access to this program and its scope until reinstated.</p>
          <p>Their historical audit attribution will be preserved.</p>
        </>
      }
      confirmLabel="Suspend researcher"
      onConfirm={() => suspendResearcherAction({ organizationId, programId, targetUserId })}
    />
  );
}

export function ReinstateResearcherDialog({ organizationId, programId, targetUserId }: { organizationId: string; programId: string; targetUserId: string }) {
  return (
    <ConfirmActionDialog
      triggerLabel="Reinstate"
      title="Reinstate researcher?"
      description={<p>The researcher will regain read access to this program and its active scope.</p>}
      confirmLabel="Reinstate researcher"
      onConfirm={() => reinstateResearcherAction({ organizationId, programId, targetUserId })}
    />
  );
}

export function RevokeResearcherDialog({ organizationId, programId, targetUserId }: { organizationId: string; programId: string; targetUserId: string }) {
  return (
    <ConfirmActionDialog
      triggerLabel="Revoke"
      triggerVariant="destructive"
      title="Revoke researcher access?"
      description={
        <>
          <p>Program access ends immediately. This cannot be undone by reinstating: the researcher would need a new invitation.</p>
          <p>Historical attribution is kept: audit records are not deleted.</p>
        </>
      }
      confirmLabel="Revoke access"
      onConfirm={() => revokeResearcherAction({ organizationId, programId, targetUserId })}
    />
  );
}
