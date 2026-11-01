import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import type { ResearcherActions } from "../../services/researcher-journey";

type Item = { count: number | null; one: string; many: string; href: string; urgent?: boolean };

/** Everything waiting on the researcher outside the report inbox, from one summary read
 * (get_my_researcher_actions). Only real, non-zero items render; nothing renders when nothing waits. */
export function ActionCenter({ actions }: { actions: ResearcherActions }) {
  const items: Item[] = [
    { count: actions.identityVerified ? 0 : null, one: "Verify your identity to submit reports", many: "", href: "/settings/identity", urgent: true },
    { count: actions.collaborationInvitations, one: "Collaboration invitation", many: "Collaboration invitations", href: "/settings/collaboration", urgent: true },
    { count: actions.acknowledgementsToAnswer, one: "Hall of Fame credit to answer", many: "Hall of Fame credits to answer", href: "/recognition" },
    { count: actions.mentorshipRequestsToAnswer, one: "Mentorship request", many: "Mentorship requests", href: "/mentorship" },
    { count: actions.cveEligibleReports, one: "Disclosed report eligible for a CVE", many: "Disclosed reports eligible for a CVE", href: "/recognition" },
    { count: actions.unacceptedAgreements, one: "Agreement to review", many: "Agreements to review", href: "/settings/digital-agreements" },
    { count: actions.upcomingEvents, one: "Upcoming event you registered for", many: "Upcoming events you registered for", href: "/settings/calendar" },
  ].filter((i) => i.count !== 0);
  if (items.length === 0) return null;

  return (
    <section aria-label="Also waiting on you" className="rounded-xl border border-border bg-surface-raised px-5 py-4 shadow-sm">
      <SectionLabel>Also waiting on you</SectionLabel>
      <ul className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.href + i.one}>
            <Link prefetch={false} href={i.href as Route} className="flex min-h-11 items-center gap-3 text-sm text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {i.count === null ? (
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
              ) : (
                <span className={`min-w-6 rounded-md px-1.5 text-center font-mono text-xs font-semibold ${i.urgent ? "bg-action text-on-action" : "bg-surface-muted text-ink"}`}>{i.count}</span>
              )}
              <span className="min-w-0">{i.count === null || i.count === 1 ? i.one : i.many}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
