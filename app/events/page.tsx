import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { SectionLabel } from "../../components/ui/security-primitives";
import { LocalTime } from "../../components/ui/local-time";
import { ActionButton } from "../../components/researcher/journey-controls";
import { JourneyStatus } from "../../components/researcher/journey-status";
import { getCurrentUser } from "../../lib/auth/current-user";
import { getSettingsAudience } from "../../lib/auth/account-type";
import { getResearcherReputationScore } from "../../services/reputation";
import { listHackingEvents, type HackingEvent } from "../../services/researcher-journey";
import { setEventRegistrationAction } from "../../actions/researcher-journey";

const FORMAT = { online: "Online", in_person: "In person", hybrid: "Hybrid" } as const;

/** Live hacking events Unpatched runs (202610280001). Registration, places and eligibility are
 * enforced by the database; joining details are shared by the organisers, not streamed here. */
export default async function EventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/events" as Route);
  const isResearcher = (await getSettingsAudience()) === "researcher";
  const [events, reputation] = await Promise.all([listHackingEvents(), getResearcherReputationScore(user.id)]);
  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.status !== "draft" && e.endsAt > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = events.filter((e) => e.status !== "draft" && e.endsAt <= now);

  return (
    <AppShell title="Events" user={user}>
      <div className="max-w-4xl space-y-8">
        <p className="text-sm text-ink-muted">
          Live hacking events run by Unpatched. Your registered events also appear in your{" "}
          <Link prefetch={false} href={"/settings/calendar" as Route} className="font-medium text-action underline underline-offset-2">
            calendar
          </Link>
          . For timed capture-the-flag competitions, see{" "}
          <Link prefetch={false} href={"/ctf" as Route} className="font-medium text-action underline underline-offset-2">
            CTF
          </Link>
          .
        </p>
        <section className="space-y-3">
          <SectionLabel>Upcoming</SectionLabel>
          {upcoming.length === 0 ? (
            <EmptyState title="No events scheduled">New events are announced here. Check back soon.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} reputation={reputation} canRegister={isResearcher} now={now} />
              ))}
            </ul>
          )}
        </section>
        {past.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>Past</SectionLabel>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {past.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                  <span className="font-medium text-ink">{e.title}</span>
                  <span className="text-xs text-ink-muted">
                    <LocalTime value={e.startsAt} dateOnly />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function EventCard({ event: e, reputation, canRegister, now }: { event: HackingEvent; reputation: number; canRegister: boolean; now: string }) {
  const full = e.capacity !== null && e.registeredCount >= e.capacity;
  const registered = e.myStatus === "registered";
  const blocker =
    e.status === "cancelled" ? "This event was cancelled." : !canRegister ? "Events are for researcher accounts." : registered ? null : now > e.registrationClosesAt ? "Registration has closed." : reputation < e.minReputation ? `Needs ${e.minReputation} reputation; you have ${reputation}.` : full ? "Every place is taken." : null;

  return (
    <li className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-ink">{e.title}</h2>
        {e.status === "cancelled" ? <JourneyStatus status="cancelled" /> : registered && <JourneyStatus status="registered" />}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        <LocalTime value={e.startsAt} /> to <LocalTime value={e.endsAt} /> · {FORMAT[e.format]}
        {e.location && ` · ${e.location}`}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{e.description}</p>
      <p className="mt-3 text-xs text-ink-muted">
        {e.capacity !== null ? `${e.registeredCount} of ${e.capacity} places taken` : `${e.registeredCount} registered`}
        {e.minReputation > 0 && ` · reputation ${e.minReputation}+`} · registration closes <LocalTime value={e.registrationClosesAt} />
      </p>
      <div className="mt-4">
        {registered && e.status !== "cancelled" ? (
          <ActionButton variant="quiet" action={setEventRegistrationAction.bind(null, e.id, false)} confirm="Your place is released for someone else." confirmLabel="Cancel registration?">
            Cancel registration
          </ActionButton>
        ) : blocker ? (
          <p className="text-sm font-medium text-ink-muted">{blocker}</p>
        ) : (
          <ActionButton variant="primary" action={setEventRegistrationAction.bind(null, e.id, true)}>
            Register
          </ActionButton>
        )}
      </div>
    </li>
  );
}
