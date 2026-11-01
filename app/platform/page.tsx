import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { PlatformDashboard } from "../../components/dashboards/platform-dashboard";
import { isPlatformAdmin } from "../../services/platform-operations";
import { getPlatformDashboard } from "../../services/dashboards";
import { getCurrentUser } from "../../lib/auth/current-user";
import { rangeDays } from "../../lib/viz";

/** Platform-admin overview: work queues first, then platform health over the chosen window.
 * A non-admin gets a 404, like every other /platform page. */
export default async function PlatformOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const days = rangeDays((await searchParams).range);
  const data = await getPlatformDashboard(days);

  return (
    <AppShell title="Platform overview" user={user}>
      <div className="max-w-6xl">
        <PlatformDashboard data={data} days={days} />
      </div>
    </AppShell>
  );
}
