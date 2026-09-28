import React from "react";
import { EmptyState, Panel } from "../ui/feedback";
import { RoleBadge } from "../ui/badge";
import { InvitationActions } from "./invitation-actions";
import { LocalTime } from "../ui/local-time";
import type { OrganizationInvitationRecord } from "../../types/organization";

// A separate panel, not merged into the member table: "who hasn't accepted" is an
// exception-report question an admin asks on its own, and folding it into the roster
// both buries it and would skew any organization-wide access audit of active members.
export function PendingInvitationsPanel({ organizationId, invitations, canManage }: { organizationId: string; invitations: OrganizationInvitationRecord[]; canManage: boolean }) {
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
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <RoleBadge role={invitation.role} />
                    <span>{expired ? "Expired" : <>Expires <LocalTime value={invitation.expiresAt} /></>}</span>
                  </p>
                </div>
                {canManage && <InvitationActions organizationId={organizationId} invitation={invitation} />}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
