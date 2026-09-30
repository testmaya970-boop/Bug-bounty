import React from "react";
import { DeactivateAccountSettings } from "../../../components/settings/deactivate-account-settings";
import { getCurrentUser } from "../../../lib/auth/current-user";

export default async function DeactivateAccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects; this satisfies the type only.
  const isOrganization = user.accountType === "organization";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{isOrganization ? "Deactivate Account" : "Deactivate & Delete"}</h1>
        <p className="mt-1 text-sm text-ink-muted">Leave Unpatched.</p>
      </div>
      <DeactivateAccountSettings accountType={user.accountType} />
    </div>
  );
}
