import React from "react";
import { DeactivateAccountSettings } from "../../../components/settings/deactivate-account-settings";

export default function DeactivateAccountSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deactivate & Delete</h1>
        <p className="mt-1 text-sm text-ink-muted">Leave Unpatched.</p>
      </div>
      <DeactivateAccountSettings />
    </div>
  );
}
