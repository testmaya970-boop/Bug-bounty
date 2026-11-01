"use client";

import React, { useState, useTransition } from "react";
import { SectionLabel } from "../ui/security-primitives";
import { setNotificationPreferenceAction } from "../../actions/notifications";
import type { NotificationCategory, NotificationPreference } from "../../types/notifications";
import type { AccountType } from "../../types/auth";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  report_activity: "Report activity",
  bounty_activity: "Bounty finalized",
  platform_activity: "Platform decisions",
  billing_activity: "Billing",
  program_activity: "Program changes",
  program_recommendations: "New programs for you",
};

// What each side actually receives (enqueue_report_notification, 202609230002): the
// organization side gets new reports and researcher messages on its programs, plus
// platform decisions about the organization; a researcher gets status changes and
// messages on their own reports, plus bounty receipts. A category that never reaches an
// account type is not shown to it at all.
const CATEGORY_DESCRIPTIONS: Record<AccountType, Partial<Record<NotificationCategory, string>>> = {
  researcher: {
    report_activity: "Status changes and new messages on reports you submitted.",
    bounty_activity: "A bounty was finalized for one of your reports. Always sent, like a payment receipt.",
    program_recommendations: "When you haven't visited for a while, an email when a new public program matches your interests in Skills. At most one a week.",
  },
  organization: {
    report_activity: "New reports and researcher messages on the programs you work on.",
    platform_activity: "The platform suspended or reinstated your organization or one of its programs. Always sent.",
  },
};

function PreferenceRow({ preference, description }: { preference: NotificationPreference; description: string }) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(preference.emailEnabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleToggle() {
    const next = !enabled;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setNotificationPreferenceAction(preference.category, next);
      // A failed save must say so -- otherwise the switch just sits there and looks broken.
      if (result.ok) {
        setEnabled(next);
        setSaved(true);
      } else setError(result.message);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-ink">{CATEGORY_LABELS[preference.category]}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-danger">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-1 text-xs font-medium text-success">
            Saved. Emails are {enabled ? "on" : "off"}.
          </p>
        )}
      </div>
      {preference.isMandatory ? (
        <span className="shrink-0 text-xs font-semibold text-ink-muted">Always on</span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Notify me about ${CATEGORY_LABELS[preference.category].toLowerCase()}`}
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

export function NotificationPreferencesSection({ preferences, accountType }: { preferences: NotificationPreference[]; accountType: AccountType }) {
  const descriptions = CATEGORY_DESCRIPTIONS[accountType];
  return (
    <div>
      <SectionLabel>Notification preferences</SectionLabel>
      <p className="mt-1 text-sm text-ink-muted">Turning a category off stops it completely: no email and no entry in your notifications.</p>
      <div className="mt-3">
        {preferences.flatMap((preference) => {
          const description = descriptions[preference.category];
          return description ? [<PreferenceRow key={preference.category} preference={preference} description={description} />] : [];
        })}
      </div>
    </div>
  );
}
