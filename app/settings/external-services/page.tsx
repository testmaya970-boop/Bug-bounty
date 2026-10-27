import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { ExternalServicesSettings } from "../../../components/settings/external-services-settings";
import { getMyExternalHandles } from "../../../services/researcher-profiles";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

export default async function ExternalServicesSettingsPage() {
  await requireResearcherSettings();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/settings/external-services" as Route);

  const handles = await getMyExternalHandles(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">External Services</h1>
        <p className="mt-1 text-sm text-ink-muted">Your profiles on other security platforms, including HackerOne.</p>
      </div>
      <ExternalServicesSettings initial={handles} />
    </div>
  );
}
