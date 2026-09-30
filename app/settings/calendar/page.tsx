import React from "react";
import { NotApplicableSettings } from "../../../components/settings/not-applicable-settings";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

export default async function CalendarSettingsPage() {
  await requireResearcherSettings();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-ink-muted">Scheduling and upcoming dates.</p>
      </div>
      <NotApplicableSettings feature="Calendar" />
    </div>
  );
}
