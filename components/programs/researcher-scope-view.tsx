import React from "react";
import { AssetTypeBadge } from "../ui/badge";
import { EmptyState } from "../ui/feedback";
import { assetTypeLabel } from "../../lib/scope-labels";
import type { ProgramAssetType, ScopeEntry } from "../../types/scope";

const ASSET_TYPE_ORDER: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

function groupByType(entries: ScopeEntry[]): Map<ProgramAssetType, ScopeEntry[]> {
  const byType = new Map<ProgramAssetType, ScopeEntry[]>();
  for (const entry of entries) {
    const existing = byType.get(entry.assetType) ?? [];
    existing.push(entry);
    byType.set(entry.assetType, existing);
  }
  return byType;
}

/**
 * The hacker-facing scope view: in-scope assets grouped by type, each with its own
 * per-asset testing instructions (reusing ScopeEntry.description verbatim -- already a
 * real field on public.program_scope_entries, no new column needed). Deliberately
 * separate from the manager's own flat/filterable Scope section on the same page (that
 * one stays exactly as it was: a dense registry a manager scans and edits) -- a
 * researcher is reading this to answer one question, "what am I actually allowed to
 * test, and how," which a type-grouped read is better suited to than a flat table.
 *
 * Out-of-scope entries were originally never shown here at all (the absence of a target
 * was meant to already communicate "not authorized"), but that leaves a real gap for an
 * explicit CARVE-OUT -- e.g. a wildcard *.example.com marked in scope with
 * admin.example.com separately marked out of scope. A researcher reading only the
 * in-scope list has no way to tell "not listed because nobody's added it yet" apart from
 * "explicitly excluded despite matching a broader in-scope pattern." A dedicated,
 * visually distinct exclusions section below the in-scope groups closes that gap without
 * touching the in-scope section's own shape or the manager's separate registry above.
 */
export function ResearcherScopeView({ entries }: { entries: ScopeEntry[] }) {
  const inScope = entries.filter((entry) => entry.scopeState === "in_scope");
  const outOfScope = entries.filter((entry) => entry.scopeState === "out_of_scope");

  if (inScope.length === 0 && outOfScope.length === 0) {
    return <EmptyState title="No in-scope assets yet">Nothing has been marked in scope for this engagement yet.</EmptyState>;
  }

  const inScopeByType = groupByType(inScope);
  const outOfScopeByType = groupByType(outOfScope);

  return (
    <div className="space-y-6">
      {inScope.length === 0 ? (
        <EmptyState title="No in-scope assets yet">Nothing has been marked in scope for this engagement yet.</EmptyState>
      ) : (
        <div className="space-y-5">
          {ASSET_TYPE_ORDER.filter((type) => (inScopeByType.get(type)?.length ?? 0) > 0).map((type) => (
            <div key={type}>
              <div className="flex items-center gap-2">
                <AssetTypeBadge assetType={type} />
                <h3 className="text-sm font-semibold text-ink">{assetTypeLabel(type)}</h3>
                <span className="font-mono text-xs text-ink-muted">{inScopeByType.get(type)!.length}</span>
              </div>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {inScopeByType.get(type)!.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <span className="break-all font-mono text-sm font-medium text-ink">{entry.displayTarget}</span>
                    {entry.description && <p className="mt-1 text-sm text-ink-muted">{entry.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {outOfScope.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-danger">Explicitly out of scope</h3>
          <p className="mt-1 text-sm text-ink-muted">
            These targets are excluded even if they would otherwise match a broader in-scope pattern above. Never test against them.
          </p>
          <div className="mt-2 space-y-4">
            {ASSET_TYPE_ORDER.filter((type) => (outOfScopeByType.get(type)?.length ?? 0) > 0).map((type) => (
              <div key={type}>
                <div className="flex items-center gap-2">
                  <AssetTypeBadge assetType={type} />
                  <span className="text-xs font-medium text-ink-muted">{assetTypeLabel(type)}</span>
                </div>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-danger/30 bg-danger/5">
                  {outOfScopeByType.get(type)!.map((entry) => (
                    <li key={entry.id} className="px-4 py-3">
                      <span className="break-all font-mono text-sm font-medium text-ink line-through decoration-danger/60">{entry.displayTarget}</span>
                      {entry.description && <p className="mt-1 text-sm text-ink-muted">{entry.description}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
