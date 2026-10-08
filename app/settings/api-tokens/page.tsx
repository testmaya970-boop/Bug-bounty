import React from "react";
import { EmptyState } from "../../../components/ui/feedback";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

/** API access is coming soon. The token tables and RPCs stay (services/api-tokens.ts);
 * the page offers nothing and lib/api-auth.ts accepts no bearer token until launch. */
export default async function ApiTokensSettingsPage() {
  await requireResearcherSettings();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">API Token</h1>
        <p className="mt-1 text-sm text-ink-muted">Personal access tokens for the Unpatched API.</p>
      </div>
      <EmptyState title="Coming soon">API access is on the way. You&apos;ll be able to generate personal access tokens here to pull your reports and activity into your own tools.</EmptyState>
    </div>
  );
}
