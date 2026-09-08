"use client";

import React, { useState, useTransition } from "react";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { reactivateOrganizationMember, removeOrganizationMember, suspendOrganizationMember } from "../../actions/organization-members";

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

export function SuspendMemberDialog({ organizationId, targetUserId }: { organizationId: string; targetUserId: string }) {
  return (
    <ConfirmActionDialog
      triggerLabel="Suspend"
      title="Suspend member?"
      description={
        <>
          <p>The member will lose access to the organization and its authorized programs until reactivated.</p>
          <p>Their historical audit and report attribution will be preserved.</p>
        </>
      }
      confirmLabel="Suspend member"
      onConfirm={() => suspendOrganizationMember({ organizationId, targetUserId })}
    />
  );
}

export function ReactivateMemberDialog({ organizationId, targetUserId }: { organizationId: string; targetUserId: string }) {
  return (
    <ConfirmActionDialog
      triggerLabel="Reactivate"
      title="Reactivate member?"
      description={<p>The member will regain the access their current role grants.</p>}
      confirmLabel="Reactivate member"
      onConfirm={() => reactivateOrganizationMember({ organizationId, targetUserId })}
    />
  );
}

export function RemoveMemberDialog({ organizationId, targetUserId }: { organizationId: string; targetUserId: string }) {
  return (
    <ConfirmActionDialog
      triggerLabel="Remove"
      triggerVariant="destructive"
      title="Remove member?"
      description={
        <>
          <p>Organization access ends immediately, and program access ends with it.</p>
          <p>Historical attribution is kept: their reports, comments, and audit records are not deleted.</p>
          <p>This person can be invited again later if policy permits.</p>
        </>
      }
      confirmLabel="Remove member"
      onConfirm={() => removeOrganizationMember({ organizationId, targetUserId })}
    />
  );
}
