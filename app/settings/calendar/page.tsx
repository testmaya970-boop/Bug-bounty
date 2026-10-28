import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "../../../components/ui/feedback";
import { LocalTime } from "../../../components/ui/local-time";
import { ToneBadge, TONE } from "../../../components/ui/badge";
import { requireResearcherSettings } from "../../../lib/auth/account-type";
import { listMyCalendar } from "../../../services/researcher-journey";

/** Upcoming dates from Unpatched itself: events you registered for and CTF events. Download as an
 * .ics file to add them to any calendar app; nothing syncs automatically. */
export default async function CalendarSettingsPage() {
  await requireResearcherSettings();
  const entries = await listMyCalendar();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-ink-muted">Events you registered for and CTF events, in your local time.</p>
        </div>
        {entries.length > 0 && (
          <a href="/api/calendar" className="text-sm font-medium text-action underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus">
            Download .ics
          </a>
        )}
      </div>
      {entries.length === 0 ? (
        <EmptyState title="Nothing coming up">
          Register for an{" "}
          <Link prefetch={false} href={"/events" as Route} className="font-medium text-action underline underline-offset-2">
            event
          </Link>{" "}
          or join a CTF event and its dates appear here.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {entries.map((e) => (
            <li key={e.uid} className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
              <p className="font-mono text-xs text-ink-muted">
                <LocalTime value={e.startsAt} />
              </p>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link prefetch={false} href={e.href as Route} className="font-medium text-ink hover:text-action">
                    {e.title}
                  </Link>
                  <ToneBadge tone={e.kind === "event" ? TONE.success : TONE.info}>{e.kind === "event" ? "Registered" : "CTF"}</ToneBadge>
                </div>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Until <LocalTime value={e.endsAt} /> · {e.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
