"use client";

import React, { useState, useTransition } from "react";
import { Button, IconButton } from "../ui/button";
import { cancelOrganizationInvitation, resendOrganizationInvitation } from "../../actions/organization-members";
import type { OrganizationInvitationRecord } from "../../types/organization";
import { ArrowClockwise, X } from "@phosphor-icons/react";

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
        <IconButton label="Resend" variant="secondary" pending={pending && pendingAction === "resend"} onClick={handleResend}>
          {!(pending && pendingAction === "resend") && <ArrowClockwise aria-hidden="true" className="size-[18px]" />}
        </IconButton>
        <IconButton label="Cancel invitation" variant="quiet" className="text-danger" pending={pending && pendingAction === "cancel"} onClick={handleCancel}>
          {!(pending && pendingAction === "cancel") && <X aria-hidden="true" className="size-[18px]" />}
        </IconButton>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
