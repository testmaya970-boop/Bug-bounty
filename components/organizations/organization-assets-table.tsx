"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Select } from "../ui/form";
import { Button } from "../ui/button";
import { ErrorState, EmptyState, Skeleton } from "../ui/feedback";
import { ScopeStateBadge, AssetTypeBadge } from "../ui/badge";
import { assetTypeLabel } from "../../lib/scope-labels";
import { listScopeEntriesForOrganizationPageAction } from "../../actions/scope";
import { formatDate } from "../../lib/format-date";
import type { ProgramAssetType, ScopeEntry } from "../../types/scope";

const FILTERABLE_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

/**
 * Cross-program asset inventory: a flat, read-only, filterable list of every active
 * scope entry across every one of an organization's engagements -- the org-wide
 * counterpart to the per-program Scope section already embedded on the program detail
 * page (which stays the place creation/editing actually happens: scope mutation is only
 * legal while a program is in `draft` status, program-by-program, so a real "create
 * asset" control on this cross-program page would need to re-derive that per-row gate
 * for every program shown -- each row instead links to "Manage on program," where the
 * existing, already-correct AddScopeEntryDialog/ScopeEntryCard controls live). Same
 * server-side filter/cursor-pagination shape as Findings (components/organizations/
 * organization-findings-table.tsx): URL query params drive program/type filters, "Load
 * more" appends via a Server Action, never a client-side re-filter of an
 * already-fetched page.
 */
export function OrganizationAssetsTable({
  organizationId,
  initialEntries,
  initialNextCursor,
  programId,
  assetType,
  programOptions,
}: {
  organizationId: string;
  initialEntries: ScopeEntry[];
  initialNextCursor: string | null;
  programId: string | "all";
  assetType: ProgramAssetType | "all";
  programOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filterPending, startFilterTransition] = useTransition();

  const programNameById = new Map(programOptions.map((program) => [program.id, program.name]));

  function navigateWithFilters(next: { programId?: string | "all"; assetType?: ProgramAssetType | "all" }) {
    const params = new URLSearchParams();
    const nextProgramId = next.programId ?? programId;
    const nextAssetType = next.assetType ?? assetType;
    if (nextProgramId !== "all") params.set("program", nextProgramId);
    if (nextAssetType !== "all") params.set("type", nextAssetType);
    const query = params.toString();
    startFilterTransition(() => {
      router.push((`/organizations/${organizationId}/assets` + (query ? `?${query}` : "")) as Route);
    });
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listScopeEntriesForOrganizationPageAction({
        organizationId,
        cursor: nextCursor,
        programId: programId === "all" ? undefined : programId,
        assetType: assetType === "all" ? undefined : assetType,
      });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setEntries((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  const hasActiveFilter = programId !== "all" || assetType !== "all";

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
        <Select label="Engagement" className="max-w-xs" disabled={filterPending} value={programId} onChange={(event) => navigateWithFilters({ programId: event.target.value })}>
          <option value="all">All engagements</option>
          {programOptions.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </Select>
        <Select label="Filter by type" className="max-w-xs" disabled={filterPending} value={assetType} onChange={(event) => navigateWithFilters({ assetType: event.target.value as ProgramAssetType | "all" })}>
          <option value="all">All types</option>
          {FILTERABLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {assetTypeLabel(type)}
            </option>
          ))}
        </Select>
        {filterPending && <span aria-hidden="true" className="mb-2.5 size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent text-ink-muted motion-reduce:animate-none" />}
      </div>

      {entries.length === 0 ? (
        hasActiveFilter ? (
          <EmptyState title="No matching assets">No asset across this organization's engagements matches the current filters.</EmptyState>
        ) : (
          <EmptyState title="No assets yet">Assets defined in any engagement's scope will appear here.</EmptyState>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                {["Type", "Target", "Engagement", "State", "Added"].map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <AssetTypeBadge assetType={entry.assetType} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="break-all font-mono text-sm text-ink">{entry.displayTarget}</span>
                    {entry.description && <p className="mt-0.5 text-xs text-ink-muted">{entry.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Link prefetch={false}
                      href={`/organizations/${organizationId}/programs/${entry.programId}#scope` as Route}
                      className="text-sm text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {programNameById.get(entry.programId) ?? "Manage on program"} →
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <ScopeStateBadge state={entry.scopeState} />
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{formatDate(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <div className="space-y-2 border-t border-border p-4" role="status" aria-label="Loading more assets">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {loadError && (
        <div className="p-4">
          <ErrorState>{loadError}</ErrorState>
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center border-t border-border p-4">
          <Button variant="secondary" pending={pending} onClick={handleLoadMore}>
            Load more
          </Button>
        </div>
      ) : (
        entries.length > 0 && <p className="border-t border-border p-4 text-center text-sm text-ink-muted">End of results.</p>
      )}
    </div>
  );
}
