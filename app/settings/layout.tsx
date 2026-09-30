import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { SettingsNav } from "../../components/settings/settings-nav";
import { getCurrentUser } from "../../lib/auth/current-user";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/settings" as Route);

  return (
    <AppShell title="Settings" user={user}>
      <div className="flex flex-col gap-8 sm:flex-row sm:gap-10">
        <SettingsNav accountType={user.accountType} />
        <div className="min-w-0 flex-1 max-w-2xl">{children}</div>
      </div>
    </AppShell>
  );
}
