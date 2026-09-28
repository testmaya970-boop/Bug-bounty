"use client";

import React, { useState, useTransition } from "react";
import { EmptyState, Panel } from "../ui/feedback";
import { Button } from "../ui/button";
import { cancelProgramInvitationAction } from "../../actions/program-researchers";
import { LocalTime } from "../ui/local-time";
import type { ProgramInvitationRecord } from "../../types/researcher";

function CancelInvitationButton({ organizationId, programId, invitationId }: { organizationId: string; programId: string; invitationId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="quiet"
        pending={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await cancelProgramInvitationAction({ organizationId, programId, invitationId });
            if (!result.ok) setError(result.message);
          });
        }}
      >
        Cancel invitation
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// A separate panel, not merged into the researcher table: the same reasoning
// PendingInvitationsPanel already established for organization members -- "who hasn't
// accepted" is an exception-report question a manager asks on its own.
export function PendingProgramInvitationsPanel({ organizationId, programId, invitations }: { organizationId: string; programId: string; invitations: ProgramInvitationRecord[] }) {
  return (
    <Panel>
      <h2 className="text-base font-semibold">Pending invitations</h2>
      {invitations.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No pending invitations">Invitations you send will appear here until accepted or expired.</EmptyState>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {invitations.map((invitation) => {
            const expired = new Date(invitation.expiresAt).getTime() < Date.now();
            return (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-ink">{invitation.email}</p>
                  <p className="mt-1 text-xs text-ink-muted">{expired ? "Expired" : <>Expires <LocalTime value={invitation.expiresAt} /></>}</p>
                </div>
                <CancelInvitationButton organizationId={organizationId} programId={programId} invitationId={invitation.id} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
