import React from "react";
import { NotificationPreferencesSection } from "../../../components/notifications/notification-preferences";
import { getMyNotificationPreferences } from "../../../services/notifications";

export default async function NotificationsSettingsPage() {
  const preferences = await getMyNotificationPreferences();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">Choose which email notifications you receive. Your real notification feed always shows everything, regardless of these settings. See the Notifications page.</p>
      </div>
      <NotificationPreferencesSection preferences={preferences} />
    </div>
  );
}
