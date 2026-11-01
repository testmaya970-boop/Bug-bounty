import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { LocalTime } from "../../../components/ui/local-time";
import { ActionButton } from "../../../components/researcher/journey-controls";
import { HackingEventForm } from "../../../components/researcher/journey-forms";
import { JourneyStatus } from "../../../components/researcher/journey-status";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listHackingEvents } from "../../../services/researcher-journey";
import { setHackingEventStatusAction } from "../../../actions/researcher-journey";
import { getCurrentUser } from "../../../lib/auth/current-user";

/** Create, publish and cancel live hacking events (202610280001). Researchers see published ones at /events. */
export default async function PlatformEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/events" as Route);
  if (!(await isPlatformAdmin())) notFound();
  const events = await listHackingEvents();

  return (
    <AppShell title="Events" user={user}>
      <div className="max-w-5xl space-y-8">
        <SectionLabel>Platform operations</SectionLabel>
        {events.length === 0 ? (
          <EmptyState title="No events yet">Create one below. It stays a draft until you publish it.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {events.map((e) => (
              <li key={e.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{e.title}</span>
                    <JourneyStatus status={e.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    <LocalTime value={e.startsAt} /> · {e.registeredCount}
                    {e.capacity !== null && ` / ${e.capacity}`} registered
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.status === "draft" && (
                    <ActionButton variant="primary" action={setHackingEventStatusAction.bind(null, e.id, "published")}>
                      Publish
                    </ActionButton>
                  )}
                  {e.status !== "cancelled" && (
                    <ActionButton variant="destructive" action={setHackingEventStatusAction.bind(null, e.id, "cancelled")} confirm="Registered researchers will see it as cancelled. This cannot be undone." confirmLabel="Cancel event?">
                      Cancel event
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <section className="space-y-3 border-t border-border pt-6">
          <SectionLabel>New event</SectionLabel>
          <HackingEventForm />
        </section>
      </div>
    </AppShell>
  );
}
