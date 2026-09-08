import React from "react";
import { FeedbackSettings } from "../../../components/settings/feedback-settings";

export default function FeedbackSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Feedback & Surveys</h1>
        <p className="mt-1 text-sm text-ink-muted">Tell us what's working and what isn't.</p>
      </div>
      <FeedbackSettings />
    </div>
  );
}
