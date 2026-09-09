import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { getCurrentUser } from "../../lib/auth/current-user";

/**
 * A real, honest static stub -- not a dead link and not a fabricated feature preview.
 * This app's own established convention (see components/app-shell-client.tsx's
 * HelpLink comment, docs/decisions/0044) is that a nav destination either goes
 * somewhere real or doesn't exist at all; "Coming Soon" is the one deliberate
 * exception HackerOne's own reference nav documents as its own destination, so this
 * page exists specifically to be that destination -- named plainly, promising nothing
 * concrete, never claiming a feature is further along than "not built yet."
 */
export default async function ComingSoonPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/coming-soon" as Route);

  return (
    <AppShell title="Coming Soon" user={user}>
      <div className="mx-auto max-w-xl">
        <EmptyState title="More is on the way">
          This is where upcoming features will show up as they ship. Nothing to see here yet.
        </EmptyState>
      </div>
    </AppShell>
  );
}
