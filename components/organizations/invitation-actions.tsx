"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { cancelOrganizationInvitation, resendOrganizationInvitation } from "../../actions/organization-members";
import type { OrganizationInvitationRecord } from "../../types/organization";

export function InvitationActions({ organizationId, invitation }: { organizationId: string; invitation: OrganizationInvitationRecord }) {
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"cancel" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    setPendingAction("cancel");
    startTransition(async () => {
      const result = await cancelOrganizationInvitation({ organizationId, invitationId: invitation.id });
      if (!result.ok) setError(result.message);
      setPendingAction(null);
    });
  }

  function handleResend() {
    setError(null);
    setPendingAction("resend");
    startTransition(async () => {
      const result = await resendOrganizationInvitation({
        organizationId,
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        message: invitation.message ?? undefined,
      });
      if (!result.ok) setError(result.message);
      setPendingAction(null);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="secondary" pending={pending && pendingAction === "resend"} onClick={handleResend}>
          Resend
        </Button>
        <Button variant="quiet" pending={pending && pendingAction === "cancel"} onClick={handleCancel}>
          Cancel invitation
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
