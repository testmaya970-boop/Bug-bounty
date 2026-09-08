import React from "react";
import { NotApplicableSettings } from "../../../components/settings/not-applicable-settings";

export default function SwagSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Swag</h1>
        <p className="mt-1 text-sm text-ink-muted">Physical rewards for your research.</p>
      </div>
      <NotApplicableSettings feature="Swag" />
    </div>
  );
}
