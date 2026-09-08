"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../ui/feedback";
import { Button } from "../ui/button";
import { acceptProgramInvitationByIdAction, cancelProgramInvitationAction } from "../../actions/program-researchers";
import { formatDate as formatDateTime } from "../../lib/format-date";
import type { PendingProgramInvitationForResearcher } from "../../types/researcher";

export function PendingProgramInvitationCard({ invitation }: { invitation: PendingProgramInvitationForResearcher }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    setError(null);
    setPendingAction("accept");
    startTransition(async () => {
      const result = await acceptProgramInvitationByIdAction(invitation.id);
      if (!result.ok) {
        setError(result.message);
        setPendingAction(null);
        return;
      }
      router.refresh();
    });
  }

  function handleDecline() {
    setError(null);
    setPendingAction("decline");
    startTransition(async () => {
      const result = await cancelProgramInvitationAction({ invitationId: invitation.id });
      if (!result.ok) {
        setError(result.message);
        setPendingAction(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <p className="text-sm text-ink-muted">You&apos;ve been invited to participate in</p>
      <h3 className="mt-1 text-lg font-semibold text-ink">{invitation.programName}</h3>
      <p className="mt-1 text-sm text-ink-muted">{invitation.organizationName}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        {invitation.invitedByName && <span>Invited by {invitation.invitedByName}</span>}
        <span>Expires {formatDateTime(invitation.expiresAt)}</span>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button pending={pending && pendingAction === "accept"} disabled={pending && pendingAction === "decline"} onClick={handleAccept}>
          Accept
        </Button>
        <Button variant="quiet" pending={pending && pendingAction === "decline"} disabled={pending && pendingAction === "accept"} onClick={handleDecline}>
          Decline
        </Button>
      </div>
    </Card>
  );
}
