import React from "react";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { Card, EmptyState } from "../../../components/ui/feedback";
import { CtfEventCreateForm } from "../../../components/platform/ctf-event-create-form";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listCtfEventsForAdmin } from "../../../services/ctf-events";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { LocalTime } from "../../../components/ui/local-time";
import type { CtfEventEffectiveStatus } from "../../../types/ctf-event";

const STATUS_TONE: Record<CtfEventEffectiveStatus, string> = {
  active: "text-success",
  upcoming: "text-action",
  ended: "text-ink-muted",
  draft: "text-warning",
};

/**
 * Platform-admin CTF events: create events and manage the ones that exist. A non-admin gets
 * a real 404 (same convention as every other /platform/* page). Every RPC behind this page
 * independently re-checks is_platform_admin server-side -- this page's own gate is
 * discoverability + a fast fail, never the authorization boundary.
 */
export default async function PlatformCtfEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/ctf-events" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const events = await listCtfEventsForAdmin();

  return (
    <AppShell title="CTF events" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Create and schedule timed CTF events, and choose which challenges each one includes.</p>

        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink">New event</h2>
          <p className="mt-1 text-sm text-ink-muted">After creating an event you&apos;ll pick its challenges on the next screen.</p>
          <div className="mt-4">
            <CtfEventCreateForm />
          </div>
        </Card>

        <div>
          <SectionLabel>All events</SectionLabel>
          {events.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No events yet">Create your first event above.</EmptyState>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
              {events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/platform/ctf-events/${event.id}` as Route}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{event.name}</span>
                      <span className="block font-mono text-[11px] text-ink-muted">@{event.slug}</span>
                    </span>
                    <span className={`font-mono text-[11px] font-semibold ${STATUS_TONE[event.effectiveStatus]}`}>{event.effectiveStatus}</span>
                    <span className="font-mono text-[11px] text-ink-muted">{event.challengeCount} challenges</span>
                    <span className="font-mono text-[11px] text-ink-muted">{event.solverCount} solvers</span>
                    <span className="w-full font-mono text-[11px] text-ink-muted sm:w-auto">
                      <LocalTime value={event.startsAt} /> to <LocalTime value={event.endsAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
