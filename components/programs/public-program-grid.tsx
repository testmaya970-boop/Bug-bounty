import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { OrgLogo } from "../ui/org-logo";
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
export function PublicProgramGrid({
  programs,
}: {
  programs: PublicProgramSummary[];
}) {
  // Cards stretch to their row's height (no items-start) and the footer is pinned with
  // mt-auto, so every row reads as one aligned band whatever each card holds.
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {programs.map((program) => (
        <li
          key={program.id}
          className="flex min-w-0 motion-safe:animate-enter-rise"
        >
          <Link
            prefetch={false}
            href={
              `/organizations/${program.organizationId}/programs/${program.id}` as Route
            }
            className="group flex w-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {/* Name gets the full width: only the status sits beside it; every other badge
                moves to its own row instead of squeezing the name to "QA...". */}
            <div className="flex items-start gap-2.5">
              <OrgLogo organizationId={program.organizationId} name={program.organizationName} version={program.logoVersion} />
              <div className="min-w-0 flex-1">
                <p
                  className="line-clamp-2 break-words text-sm font-semibold leading-snug text-ink"
                  title={program.name}
                >
                  {program.name}
                </p>
                <p
                  className="truncate text-xs text-ink-muted"
                  title={program.organizationName}
                >
                  {program.organizationName}
                </p>
              </div>
              <span className="shrink-0">
                <ProgramStatusBadge status={program.status} />
              </span>
            </div>

            {(program.programType === "vdp" ||
              program.joined ||
              program.requiresKyc) && (
              <div className="flex flex-wrap gap-1">
                <ProgramTypeBadge programType={program.programType} />
                {program.joined && (
                  <span className="rounded-full border border-success/40 px-2 py-0.5 text-[11px] font-semibold text-success">
                    Joined
                  </span>
                )}
                {program.requiresKyc && (
                  <span className="rounded-full border border-warning/40 px-2 py-0.5 text-[11px] font-semibold text-warning">
                    ID verification required
                  </span>
                )}
              </div>
            )}

            {program.description && (
              <p className="line-clamp-2 break-words text-xs text-ink-muted">
                {program.description}
              </p>
            )}

            {(program.assetTypes.length > 0 ||
              program.focusAreas.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {program.assetTypes.slice(0, 2).map((type) => (
                  <span
                    key={type}
                    className="rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info"
                  >
                    {assetTypeLabel(type)}
                  </span>
                ))}
                {program.focusAreas.slice(0, 1).map((area) => (
                  <span
                    key={area}
                    className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted"
                  >
                    {focusAreaLabel(area)}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-2.5">
              <p
                className={
                  "whitespace-nowrap " +
                  (program.bountyMinMinorUnits !== null &&
                  program.bountyMaxMinorUnits !== null &&
                  program.bountyCurrency
                    ? "text-base font-bold text-ink"
                    : "text-xs font-medium text-ink-muted")
                }
              >
                {program.bountyMinMinorUnits !== null &&
                program.bountyMaxMinorUnits !== null &&
                program.bountyCurrency
                  ? formatBountyRange(
                      program.bountyMinMinorUnits,
                      program.bountyMaxMinorUnits,
                      program.bountyCurrency,
                    )
                  : program.programType === "vdp"
                    ? "Disclosure only"
                    : "No bounty set yet"}
              </p>
              <p className="whitespace-nowrap text-[11px] text-ink-muted">
                {program.activeResearcherCount}{" "}
                {program.activeResearcherCount === 1
                  ? "researcher"
                  : "researchers"}{" "}
                · {program.resolvedReportCount} resolved
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
