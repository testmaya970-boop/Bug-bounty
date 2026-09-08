import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { NotApplicableSettings } from "../../../components/settings/not-applicable-settings";

export default function SubscriptionsSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-sm text-ink-muted">Mailing-list style subscriptions, separate from email notification preferences.</p>
      </div>
      <NotApplicableSettings feature="Subscriptions" />
      <p className="text-sm text-ink-muted">
        Looking for email notification toggles?{" "}
        <Link href={"/settings/notifications" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus">
          Go to Notifications →
        </Link>
      </p>
    </div>
  );
}
