import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { EmptyState } from "../ui/feedback";
import { formatDateTime } from "../../lib/format-date";
import type { CtfEventSummary, CtfEventEffectiveStatus } from "../../types/ctf-event";

/** The three real event states the list groups by. Active first (what you can play now),
 * then upcoming (what to prepare for), then ended (the archive with final leaderboards). */
const STATUS_LABEL: Record<CtfEventEffectiveStatus, string> = { active: "Live now", upcoming: "Upcoming", ended: "Ended", draft: "Draft" };

function EventStatusBadge({ status }: { status: CtfEventEffectiveStatus }) {
  const tone =
    status === "active"
      ? "border-success/40 bg-success/10 text-success"
      : status === "upcoming"
        ? "border-action/40 bg-action/10 text-action"
        : "border-border-strong text-ink-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {status === "active" && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-success" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function EventCard({ event }: { event: CtfEventSummary }) {
  const window = event.effectiveStatus === "upcoming" ? `Opens ${formatDateTime(event.startsAt)}` : event.effectiveStatus === "active" ? `Closes ${formatDateTime(event.endsAt)}` : `Ran ${formatDateTime(event.startsAt)} to ${formatDateTime(event.endsAt)}`;
  return (
    <Link
      href={`/ctf/events/${event.slug}` as Route}
      prefetch={false}
      className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition duration-150 hover:border-action hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <div className="flex items-start justify-between gap-2">
        <EventStatusBadge status={event.effectiveStatus} />
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ink-muted">
          {event.challengeCount} {event.challengeCount === 1 ? "challenge" : "challenges"}
        </span>
      </div>
      <p className="text-base font-semibold text-ink group-hover:text-action">{event.name}</p>
      {event.description && <p className="line-clamp-2 text-sm text-ink-muted">{event.description}</p>}
      <p className="mt-auto font-mono text-[11px] text-ink-muted">{window}</p>
    </Link>
  );
}

/**
 * Real, timed CTF events (docs/decisions/0081) -- distinct from the always-open practice
 * library on the Challenges tab. Each event has its own challenge subset, window, and real
 * per-event leaderboard. Grouped by live/upcoming/ended so the one thing you can act on now
 * (a live event) is first.
 */
export function CtfEventsList({ events }: { events: CtfEventSummary[] }) {
  const live = events.filter((e) => e.effectiveStatus === "active");
  const upcoming = events.filter((e) => e.effectiveStatus === "upcoming");
  const ended = events.filter((e) => e.effectiveStatus === "ended");

  if (events.length === 0) {
    return <EmptyState title="No events scheduled">There are no CTF events right now. Practice challenges are always open on the Challenges tab.</EmptyState>;
  }

  return (
    <div className="space-y-8">
      {live.length > 0 && (
        <section>
          <SectionLabel>Live now</SectionLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <SectionLabel>Upcoming</SectionLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
      {ended.length > 0 && (
        <section>
          <SectionLabel>Ended</SectionLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ended.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
