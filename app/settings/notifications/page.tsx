import React from "react";
import { NotificationPreferencesSection } from "../../../components/notifications/notification-preferences";
import { getMyNotificationPreferences } from "../../../services/notifications";
import { getCurrentUser } from "../../../lib/auth/current-user";

export default async function NotificationsSettingsPage() {
  const [user, preferences] = await Promise.all([getCurrentUser(), getMyNotificationPreferences()]);
  if (!user) return null; // layout already redirects; this satisfies the type only.

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">Choose what you are notified about, in the app and by email. Categories marked Always on cannot be turned off.</p>
      </div>
      <NotificationPreferencesSection preferences={preferences} accountType={user.accountType} />
    </div>
  );
}
