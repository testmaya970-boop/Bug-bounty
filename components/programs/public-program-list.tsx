"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { RegistryList } from "../ui/security-primitives";
import { ProgramStatusBadge } from "../ui/badge";
import { ErrorState, Skeleton } from "../ui/feedback";
import { Button } from "../ui/button";
import { listPublicProgramsPageAction } from "../../actions/programs";
import { assetTypeLabel } from "../../lib/scope-labels";
import { focusAreaLabel } from "../../lib/researcher-identity-labels";
import { formatBountyRange } from "../../lib/money";
import type { PublicProgramSummary } from "../../types/program";
import type { ResearcherFocusArea } from "../../types/researcher-identity";

/**
 * An editorial registry, not a card wall (see docs/decisions/0041/0042) -- one bordered
 * list, divided rows, real status indicators, the same visual grammar every other list of
 * security records in this product already uses. What changed in 0054: every signal on a
 * row is now a real, live-computed fact (bounty range, in-scope asset types, focus areas,
 * active-researcher count, resolved-report count) -- never a fabricated metric. A program
 * with no bounty policy configured simply shows no bounty range, never a placeholder
 * range; a brand-new program's real "0 resolved reports" is shown as-is, not hidden --
 * that is itself honest, useful information about how established a program is.
 */
export function PublicProgramList({
  initialPrograms,
  initialNextCursor,
  search,
  status,
  focusArea,
}: {
  initialPrograms: PublicProgramSummary[];
  initialNextCursor: string | null;
  search?: string;
  status?: "active" | "paused";
  focusArea?: ResearcherFocusArea;
}) {
  const [programs, setPrograms] = useState(initialPrograms);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listPublicProgramsPageAction({ search, status, focusArea, cursor: nextCursor });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setPrograms((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  return (
    <div>
      <RegistryList>
        {programs.map((program) => (
          <li key={program.id} className="motion-safe:animate-enter-rise">
            <Link
              href={`/organizations/${program.organizationId}/programs/${program.id}` as Route}
              className="group relative flex flex-col gap-3 p-4 transition duration-150 hover:z-10 hover:bg-surface-muted hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{program.organizationName}</p>
                  <p className="mt-0.5 truncate text-base font-semibold text-ink">{program.name}</p>
                  {program.description && <p className="mt-1.5 line-clamp-2 max-w-xl text-sm text-ink-muted">{program.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ProgramStatusBadge status={program.status} />
                  <span aria-hidden="true" className="text-ink-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
                    →
                  </span>
                </div>
              </div>

              {(program.assetTypes.length > 0 || program.focusAreas.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {program.assetTypes.map((type) => (
                    <span key={type} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted">
                      {assetTypeLabel(type)}
                    </span>
                  ))}
                  {program.focusAreas.map((area) => (
                    <span key={area} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted">
                      {focusAreaLabel(area)}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                {program.bountyMinMinorUnits !== null && program.bountyMaxMinorUnits !== null && program.bountyCurrency && (
                  <span className="font-semibold text-success">{formatBountyRange(program.bountyMinMinorUnits, program.bountyMaxMinorUnits, program.bountyCurrency)}</span>
                )}
                <span>
                  {program.activeResearcherCount} {program.activeResearcherCount === 1 ? "researcher" : "researchers"}
                </span>
                <span>
                  {program.resolvedReportCount} resolved {program.resolvedReportCount === 1 ? "report" : "reports"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </RegistryList>

      {pending && (
        <div className="mt-3 space-y-2" role="status" aria-label="Loading more programs">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {loadError && (
        <div className="mt-3">
          <ErrorState>{loadError}</ErrorState>
        </div>
      )}

      {nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" pending={pending} onClick={handleLoadMore}>
            Load more
          </Button>
        </div>
      ) : (
        programs.length > 0 && <p className="mt-4 text-center text-sm text-ink-muted">End of results.</p>
      )}
    </div>
  );
}
