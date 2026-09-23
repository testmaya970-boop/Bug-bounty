"use client";

import React, { useState, useTransition } from "react";
import { LayoutGrid, List } from "lucide-react";
import { ErrorState, Skeleton } from "../ui/feedback";
import { Button, IconButton } from "../ui/button";
import { listPublicProgramsPageAction } from "../../actions/programs";
import { PublicProgramGrid } from "./public-program-grid";
import { PublicProgramTable } from "./public-program-table";
import type { PublicProgramSummary } from "../../types/program";
import type { ResearcherFocusArea } from "../../types/researcher-identity";

type ViewMode = "grid" | "table";

/**
 * The browsing surface for the public program registry (see docs/decisions/0041/0042/
 * 0054) -- a real Grid/Table toggle over the same fetched page, matching the browsing
 * pattern established security-research marketplaces (Bugcrowd, Immunefi) use: a
 * scannable card grid for browsing, a sortable table for comparing many programs at
 * once. Every field either view shows is a real, live-computed fact already on
 * PublicProgramSummary (bounty range, asset types, focus areas, researcher/report
 * counts) -- never a fabricated metric like a resolution-time estimate this schema
 * doesn't track.
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
  const [view, setView] = useState<ViewMode>("grid");

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
      <div className="mb-3 flex justify-end">
        <div role="group" aria-label="Switch view" className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-muted p-0.5">
          <IconButton
            label="Grid view"
            variant={view === "grid" ? "secondary" : "quiet"}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            className="min-h-9 min-w-9"
          >
            <LayoutGrid aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton
            label="Table view"
            variant={view === "table" ? "secondary" : "quiet"}
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
            className="min-h-9 min-w-9"
          >
            <List aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>

      {view === "grid" ? <PublicProgramGrid programs={programs} /> : <PublicProgramTable programs={programs} />}

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
