import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Avatar } from "../ui/navigation";
import { ProgramStatusBadge, ProgramTypeBadge } from "../ui/badge";
import { assetTypeLabel } from "../../lib/scope-labels";
import { focusAreaLabel } from "../../lib/researcher-identity-labels";
import { formatBountyRange } from "../../lib/money";
import type { PublicProgramSummary } from "../../types/program";

/** The card-grid browsing view (see docs/decisions/0054 for the underlying data, all real
 * -- bounty range, asset types, focus areas, researcher/report counts). Every field a
 * scannable-grid pattern like this needs already exists on PublicProgramSummary; no field
 * here is invented to fill space. Avatar's own initial-letter monogram stands in for an
 * organization logo -- this schema has no logo/branding upload anywhere, so a fabricated
 * image would be the actual dishonest choice, not the monogram. */
export function PublicProgramGrid({ programs }: { programs: PublicProgramSummary[] }) {
  return (
    <ul className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {programs.map((program) => (
        <li key={program.id} className="motion-safe:animate-enter-rise">
          <Link
            prefetch={false}
            href={`/organizations/${program.organizationId}/programs/${program.id}` as Route}
            className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={program.organizationName} tinted />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{program.name}</p>
                  <p className="truncate text-xs text-ink-muted">{program.organizationName}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <ProgramStatusBadge status={program.status} />
                <ProgramTypeBadge programType={program.programType} />
              </div>
            </div>

            {program.description && <p className="line-clamp-1 text-xs text-ink-muted">{program.description}</p>}

            {(program.assetTypes.length > 0 || program.focusAreas.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {program.assetTypes.slice(0, 2).map((type) => (
                  <span key={type} className="rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info">
                    {assetTypeLabel(type)}
                  </span>
                ))}
                {program.focusAreas.slice(0, 1).map((area) => (
                  <span key={area} className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                    {focusAreaLabel(area)}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
              <p className={program.bountyMinMinorUnits !== null && program.bountyMaxMinorUnits !== null && program.bountyCurrency ? "text-base font-bold text-ink" : "text-xs font-medium text-ink-muted"}>
                {program.bountyMinMinorUnits !== null && program.bountyMaxMinorUnits !== null && program.bountyCurrency
                  ? formatBountyRange(program.bountyMinMinorUnits, program.bountyMaxMinorUnits, program.bountyCurrency)
                  : program.programType === "vdp"
                    ? "Disclosure only"
                    : "No bounty set yet"}
              </p>
              <p className="shrink-0 text-[11px] text-ink-muted">
                {program.activeResearcherCount} {program.activeResearcherCount === 1 ? "researcher" : "researchers"} · {program.resolvedReportCount} resolved
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
