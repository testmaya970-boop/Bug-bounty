"use client";

import React, { useState, useTransition } from "react";
import { SectionLabel } from "../ui/security-primitives";
import { setNotificationPreferenceAction } from "../../actions/notifications";
import type { NotificationCategory, NotificationPreference } from "../../types/notifications";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  report_activity: "Report activity",
  bounty_activity: "Bounty finalized",
};

const CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  report_activity: "New reports on programs you manage, and status updates on your own reports.",
  bounty_activity: "A bounty was finalized for one of your reports. Always sent, like a payment receipt.",
};

function PreferenceRow({ preference }: { preference: NotificationPreference }) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(preference.emailEnabled);

  function handleToggle() {
    const next = !enabled;
    startTransition(async () => {
      const result = await setNotificationPreferenceAction(preference.category, next);
      if (result.ok) setEnabled(next);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-ink">{CATEGORY_LABELS[preference.category]}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{CATEGORY_DESCRIPTIONS[preference.category]}</p>
      </div>
      {preference.isMandatory ? (
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">Always on</span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Email me about ${CATEGORY_LABELS[preference.category].toLowerCase()}`}
          disabled={pending}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-55 ${enabled ? "bg-action" : "bg-surface-muted border border-border-strong"}`}
        >
          <span className={`inline-block size-4 transform rounded-full bg-white shadow transition ${enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      )}
    </div>
  );
}

export function NotificationPreferencesSection({ preferences }: { preferences: NotificationPreference[] }) {
  return (
    <div>
      <SectionLabel>Notification preferences</SectionLabel>
      <p className="mt-1 text-sm text-ink-muted">Turning off an optional category means you won&apos;t be notified about it at all, including in your list above.</p>
      <div className="mt-3">
        {preferences.map((preference) => (
          <PreferenceRow key={preference.category} preference={preference} />
        ))}
      </div>
    </div>
  );
}
