import React from "react";
import { AssetTypeBadge } from "../ui/badge";
import { EmptyState } from "../ui/feedback";
import { assetTypeLabel } from "../../lib/scope-labels";
import type { ProgramAssetType, ScopeEntry } from "../../types/scope";

const ASSET_TYPE_ORDER: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

/**
 * The hacker-facing scope view: in-scope assets grouped by type, each with its own
 * per-asset testing instructions (reusing ScopeEntry.description verbatim -- already a
 * real field on public.program_scope_entries, no new column needed). Deliberately
 * separate from the manager's own flat/filterable Scope section on the same page (that
 * one stays exactly as it was: a dense registry a manager scans and edits) -- a
 * researcher is reading this to answer one question, "what am I actually allowed to
 * test, and how," which a type-grouped read is better suited to than a flat table.
 * Out-of-scope entries are never shown here at all (a researcher does not need a list of
 * what NOT to test -- the absence of a target from this view already means "not
 * authorized," matching this program page's own existing warning copy above this
 * component).
 */
export function ResearcherScopeView({ entries }: { entries: ScopeEntry[] }) {
  const inScope = entries.filter((entry) => entry.scopeState === "in_scope");
  if (inScope.length === 0) {
    return <EmptyState title="No in-scope assets yet">Nothing has been marked in scope for this engagement yet.</EmptyState>;
  }

  const byType = new Map<ProgramAssetType, ScopeEntry[]>();
  for (const entry of inScope) {
    const existing = byType.get(entry.assetType) ?? [];
    existing.push(entry);
    byType.set(entry.assetType, existing);
  }

  return (
    <div className="space-y-5">
      {ASSET_TYPE_ORDER.filter((type) => (byType.get(type)?.length ?? 0) > 0).map((type) => (
        <div key={type}>
          <div className="flex items-center gap-2">
            <AssetTypeBadge assetType={type} />
            <h3 className="text-sm font-semibold text-ink">{assetTypeLabel(type)}</h3>
            <span className="font-mono text-xs text-ink-muted">{byType.get(type)!.length}</span>
          </div>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {byType.get(type)!.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <span className="break-all font-mono text-sm font-medium text-ink">{entry.displayTarget}</span>
                {entry.description && <p className="mt-1 text-sm text-ink-muted">{entry.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
