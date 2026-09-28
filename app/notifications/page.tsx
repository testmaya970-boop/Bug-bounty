import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { NotificationListSection } from "../../components/notifications/notification-list";
import { NotificationPreferencesSection } from "../../components/notifications/notification-preferences";
import { getMyNotifications, getMyNotificationPreferences } from "../../services/notifications";
import { getCurrentUser } from "../../lib/auth/current-user";

/**
 * The one notifications surface this slice ships: a signed-in user's own notifications
 * (self-only, via RLS -- recipient_id = auth.uid()) plus their own email preferences. No
 * leaderboard-adjacent dashboard, no analytics, no digest -- see
 * docs/decisions/0017-notification-routing-and-delivery-foundation.md for the full "do
 * not build" list this route deliberately stays inside of. No "mark all as read" exists:
 * no such backend operation exists, and this task deliberately does not invent one.
 */
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/notifications" as Route);

  const [notificationsPage, preferences] = await Promise.all([getMyNotifications(), getMyNotificationPreferences()]);

  return (
    <AppShell title="Notifications" user={user}>
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="border-b-2 border-border pb-5">
          <SectionLabel>Event stream</SectionLabel>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">What changed that needs your attention?</h2>
        </div>

        <NotificationListSection initialNotifications={notificationsPage.items} initialNextCursor={notificationsPage.nextCursor} />

        <div className="border-t border-border pt-6">
          <NotificationPreferencesSection preferences={preferences} accountType={user.accountType} />
        </div>
      </div>
    </AppShell>
  );
}
