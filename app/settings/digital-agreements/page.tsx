import React from "react";
import { NotApplicableSettings } from "../../../components/settings/not-applicable-settings";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

export default async function DigitalAgreementsSettingsPage() {
  await requireResearcherSettings();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Digital Agreements</h1>
        <p className="mt-1 text-sm text-ink-muted">Program-specific agreements you've signed.</p>
      </div>
      <NotApplicableSettings feature="Digital Agreements" />
    </div>
  );
}
