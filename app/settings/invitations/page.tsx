import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { EmptyState } from "../../../components/ui/feedback";
import { PendingProgramInvitationCard } from "../../../components/programs/pending-program-invitation-card";
import { listMyPendingProgramInvitations } from "../../../services/program-researchers";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

export default async function InvitationsSettingsPage() {
  await requireResearcherSettings();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/settings/invitations" as Route);

  const invitations = await listMyPendingProgramInvitations();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Invitations</h1>
        <p className="mt-1 text-sm text-ink-muted">Private programs that have invited you directly.</p>
      </div>

      {invitations.length === 0 ? (
        <EmptyState title="No pending invitations">An organization's direct program invitation will appear here.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {invitations.map((invitation) => (
            <PendingProgramInvitationCard key={invitation.id} invitation={invitation} />
          ))}
        </div>
      )}
    </div>
  );
}
