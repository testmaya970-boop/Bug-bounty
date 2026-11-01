import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { Card } from "../../../components/ui/feedback";
import { AcceptProgramInvitationButton } from "../../../components/programs/accept-program-invitation-button";
import { getCurrentUser } from "../../../lib/auth/current-user";

export default async function AcceptProgramInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/sign-in?redirectTo=/program-invitations/${token}` as Route);

  return (
    <AppShell title="Accept invitation" user={user}>
      <Card className="mx-auto max-w-md p-6">
        <AcceptProgramInvitationButton token={token} />
      </Card>
    </AppShell>
  );
}
