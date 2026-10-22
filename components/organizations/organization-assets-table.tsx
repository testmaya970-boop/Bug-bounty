"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Checkbox, Select } from "../ui/form";
import { Button } from "../ui/button";
import { ErrorState, EmptyState, Skeleton } from "../ui/feedback";
import { AssetTypeBadge } from "../ui/badge";
import { assetTypeLabel } from "../../lib/scope-labels";
import { listOrganizationAssetsPageAction } from "../../actions/scope";
import type { AssetInventoryItem, ProgramAssetType } from "../../types/scope";
import { LocalTime } from "../ui/local-time";
import { AssetTierControl } from "./asset-tier-control";

const FILTERABLE_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

/**
 * The organization's asset inventory (public.assets, 202610160009): one row per asset, the
 * programs it is assigned to (in or out of scope), and the findings filed against it. Scope is
 * still edited on each program's Scope section; adding a target there adds or reuses the asset
 * here. URL query params drive the program/type filters; "Load more" appends the next page.
 */
export function OrganizationAssetsTable({
  organizationId,
  initialAssets,
  tiers = {},
  canEditTier = false,
  initialNextCursor,
  programId,
  assetType,
  includeRetired,
  programOptions,
}: {
  organizationId: string;
  initialAssets: AssetInventoryItem[];
  /** Asset tiers (202610220006) and whether this viewer may change them. */
  tiers?: Record<string, 1 | 2 | 3>;
  canEditTier?: boolean;
  initialNextCursor: string | null;
  programId: string | "all";
  assetType: ProgramAssetType | "all";
  includeRetired: boolean;
  programOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filterPending, startFilterTransition] = useTransition();

  function navigateWithFilters(next: { programId?: string | "all"; assetType?: ProgramAssetType | "all"; includeRetired?: boolean }) {
    const params = new URLSearchParams();
    const nextProgramId = next.programId ?? programId;
    const nextAssetType = next.assetType ?? assetType;
    if (nextProgramId !== "all") params.set("program", nextProgramId);
    if (nextAssetType !== "all") params.set("type", nextAssetType);
    if (next.includeRetired ?? includeRetired) params.set("retired", "1");
    const query = params.toString();
    startFilterTransition(() => {
      router.push((`/organizations/${organizationId}/assets` + (query ? `?${query}` : "")) as Route);
    });
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listOrganizationAssetsPageAction({
        organizationId,
        cursor: nextCursor,
        programId: programId === "all" ? undefined : programId,
        assetType: assetType === "all" ? undefined : assetType,
        includeRetired,
      });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setAssets((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  const hasActiveFilter = programId !== "all" || assetType !== "all" || includeRetired;

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
        <Checkbox label="Show retired assets" checked={includeRetired} disabled={filterPending} onChange={(event) => navigateWithFilters({ includeRetired: event.target.checked })} />
        {filterPending && <span aria-hidden="true" className="mb-2.5 size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent text-ink-muted motion-reduce:animate-none" />}
      </div>

      {assets.length === 0 ? (
        hasActiveFilter ? (
          <EmptyState title="No matching assets">No asset matches the current filters.</EmptyState>
        ) : (
          <EmptyState title="No assets in scope">Add a target to any engagement&apos;s scope and it appears here. Assets that left scope with no findings are under Show retired assets.</EmptyState>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <caption className="sr-only">Asset inventory</caption>
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="min-w-[18rem] px-4 py-3 font-semibold">Asset</th>
                <th scope="col" className="px-4 py-3 font-semibold">Tier</th>
                <th scope="col" className="px-4 py-3 font-semibold">Engagements</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Open findings</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">All findings</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last report</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <AssetTypeBadge assetType={asset.assetType} />
                      <span className="font-mono text-sm text-ink [overflow-wrap:anywhere]">{asset.displayIdentifier}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <AssetTierControl organizationId={organizationId} assetId={asset.id} tier={tiers[asset.id] ?? 1} canEdit={canEditTier} assetName={asset.displayIdentifier} />
                  </td>
                  <td className="px-4 py-3">
                    {asset.programs.length === 0 ? (
                      <span className="text-xs text-ink-muted">Retired: not in any engagement&apos;s scope</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {asset.programs.map((program) => (
                          <li key={program.program_id}>
                            <Link
                              prefetch={false}
                              href={`/organizations/${organizationId}/programs/${program.program_id}#scope` as Route}
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:border-border-strong ${program.scope_state === "in_scope" ? "border-border text-ink" : "border-dashed border-border text-ink-muted"}`}
                            >
                              {program.program_name}
                              <span className="text-ink-muted">· {program.scope_state === "in_scope" ? "in scope" : "out of scope"}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono tabular-nums ${asset.openReports > 0 ? "font-semibold text-danger" : "text-ink-muted"}`}>{asset.openReports}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">{asset.totalReports}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{asset.lastReportAt ? <LocalTime value={asset.lastReportAt} dateOnly /> : "None"}</td>
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
        assets.length > 0 && <p className="border-t border-border p-4 text-center text-sm text-ink-muted">End of results.</p>
      )}
    </div>
  );
}
