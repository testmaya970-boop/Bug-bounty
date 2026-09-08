import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ProgramStatusBadge, ResearcherStatusBadge } from "../ui/badge";
import { formatDate } from "../../lib/format-date";
import { cn } from "../../lib/cn";
import type { ProgramParticipation } from "../../types/researcher";

/** A short, honest "what can I do here right now" line -- the directory's own answer to
 * this task's "how to start" requirement -- derived purely from the two states already
 * shown as badges, never a third invented concept. */
function accessSummary(participation: ProgramParticipation): string {
  if (participation.status === "suspended") return "Your access is currently suspended. You cannot view scope or submit reports.";
  if (participation.status === "revoked") return "Your access has been revoked. You cannot view scope or submit new reports.";
  if (participation.programStatus === "paused" || participation.programStatus === "closed") return "Active access, but this program is not currently accepting new reports.";
  return "You can view scope and submit reports.";
}

/** PROGRAM / ACCESS / STATE / ACTION as genuinely aligned registry columns at sm+ (a CSS
 * grid, not flex-wrap), collapsing to a simple stacked row below that -- an active program
 * reads as immediately actionable while a suspended/revoked one visually recedes (reduced
 * emphasis, never hidden -- historical access stays findable) without a second status
 * vocabulary beyond the badges already shown. */
export function ProgramParticipationCard({ participation }: { participation: ProgramParticipation }) {
  const isActionable = participation.status === "active";
  return (
    <li className={cn(!isActionable && "opacity-70")}>
      <Link
        href={`/organizations/${participation.organizationId}/programs/${participation.programId}` as Route}
        className="block px-4 py-3.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5"
      >
        <div className="sm:grid sm:grid-cols-[1fr_7rem_7rem_5rem] sm:items-center sm:gap-x-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{participation.programName}</h3>
            <p className="text-sm text-ink-muted">{participation.organizationName}</p>
          </div>
          {/* Two badges can otherwise both read "Active" side by side with nothing to
              distinguish them — a real ambiguity, not a decorative one (see
              docs/decisions/0043). A tiny eyebrow above each names which fact it is. */}
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted/70">Your access</p>
            <ResearcherStatusBadge status={participation.status} />
          </div>
          <div className="mt-2 sm:mt-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted/70">Program</p>
            <ProgramStatusBadge status={participation.programStatus} />
          </div>
          <p className="mt-2 text-sm font-medium text-action sm:mt-0">{isActionable ? "View" : "View history"}</p>
        </div>
        <p className="mt-2 text-sm text-ink-muted">{accessSummary(participation)}</p>
        <p className="mt-1 text-xs text-ink-muted">Joined {formatDate(participation.joinedAt)}</p>
      </Link>
    </li>
  );
}
