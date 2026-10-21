import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { LocalTime } from "../../../components/ui/local-time";
import { EngagementEmailForm } from "../../../components/platform/engagement-email-form";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { getEngagementEmailSettings, getEngagementEmailStats } from "../../../services/engagement-emails";
import { getCurrentUser } from "../../../lib/auth/current-user";

/** Re-engagement emails (202610210005): when a program goes public, researchers who haven't
 * been around lately and whose hacking interests match get one email about it. */
export default async function EngagementEmailsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/engagement" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const [settings, stats] = await Promise.all([getEngagementEmailSettings(), getEngagementEmailStats()]);

  return (
    <AppShell title="Engagement emails" user={user}>
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-ink-muted">
          When a program becomes public, researchers who haven&apos;t visited for a while get one email about it, but only if its focus areas match the interests they set in Skills.
          They never get one for a program they already take part in, every email says how to turn them off, and switching them off in Settings &gt; Notifications is honoured at send time.
        </p>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {[
            ["Notified, 30 days", stats.notified30d.toLocaleString("en-US")],
            ["Emails delivered, 30 days", stats.emailed30d.toLocaleString("en-US")],
            ["Researchers opted out", stats.optedOut.toLocaleString("en-US")],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface p-4">
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
          <div className="bg-surface p-4">
            <dt className="text-xs text-ink-muted">Last sent</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{stats.lastSentAt ? <LocalTime value={stats.lastSentAt} /> : "Never"}</dd>
          </div>
        </dl>

        <EngagementEmailForm settings={settings} />
      </div>
    </AppShell>
  );
}
