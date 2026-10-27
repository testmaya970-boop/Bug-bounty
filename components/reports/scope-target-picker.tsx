"use client";

import React from "react";
import { Input, Select } from "../ui/form";
import { assetTypeLabel } from "../../lib/scope-labels";
import type { ProgramAssetType } from "../../types/scope";

export type PickableScopeEntry = { id: string; assetType: ProgramAssetType; target: string; displayTarget: string };

/**
 * Whether an entry covers more than one concrete target, so the researcher must say which:
 * a wildcard domain (*.example.com), an IP range, or a URL prefix (any path under it).
 * Mirrors private.match_program_scope (202609030005); the server decides either way.
 */
export function entryNeedsSpecificTarget(entry: PickableScopeEntry): boolean {
  if (entry.assetType === "domain") return entry.target.startsWith("*.");
  if (entry.assetType === "ip_cidr") return entry.target.includes("/") && !entry.target.endsWith("/32") && !entry.target.endsWith("/128");
  return entry.assetType === "url";
}

const SPECIFIC_HELP: Partial<Record<ProgramAssetType, (entry: PickableScopeEntry) => string>> = {
  domain: (e) => `The exact host you tested, inside ${e.displayTarget} (a hostname only, no path).`,
  ip_cidr: (e) => `The IP address (or smaller range) you tested, inside ${e.displayTarget}.`,
  url: (e) => `The URL you tested, at or under ${e.displayTarget}. No query string or fragment: put those in the description.`,
};

/**
 * Target selection from the program's own published in-scope assets: no free typing of an
 * asset that isn't listed. For an entry that covers many targets, a second field asks for the
 * specific one. The server re-checks everything (the chosen entry must be its own
 * most-specific match, so an out-of-scope exclusion inside a wildcard still wins).
 */
export function ScopeTargetPicker({
  entries,
  scopeEntryId,
  target,
  onChange,
  error,
}: {
  entries: PickableScopeEntry[];
  scopeEntryId: string;
  target: string;
  onChange: (next: { scopeEntryId: string; assetType: ProgramAssetType; target: string }) => void;
  error?: string;
}) {
  if (entries.length === 0) {
    return (
      <div role="status" className="rounded-md border border-dashed border-border-strong p-4 text-sm text-ink-muted">
        This program has no in-scope assets you can report against right now. Check back after the program updates its scope.
      </div>
    );
  }

  const selected = entries.find((e) => e.id === scopeEntryId) ?? null;
  const groups = [...new Set(entries.map((e) => e.assetType))];
  const needsSpecific = selected ? entryNeedsSpecificTarget(selected) : false;

  function pick(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return onChange({ scopeEntryId: "", assetType: "domain", target: "" });
    // A broad entry starts empty (a wildcard can't be submitted as-is) or, for a URL prefix,
    // prefilled with the prefix itself; an exact entry IS the target.
    const next = entryNeedsSpecificTarget(entry) ? (entry.assetType === "url" ? entry.displayTarget : "") : entry.displayTarget;
    onChange({ scopeEntryId: entry.id, assetType: entry.assetType, target: next });
  }

  return (
    <div className="space-y-4">
      <Select label="Asset" required value={scopeEntryId} onChange={(event) => pick(event.target.value)} error={!needsSpecific ? error : undefined} helperText="Only this program's in-scope assets are listed.">
        <option value="" disabled>
          Choose an in-scope asset…
        </option>
        {groups.map((type) => (
          <optgroup key={type} label={assetTypeLabel(type)}>
            {entries
              .filter((e) => e.assetType === type)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayTarget}
                </option>
              ))}
          </optgroup>
        ))}
      </Select>
      {selected && needsSpecific && (
        <Input
          label={selected.assetType === "domain" ? "Host" : selected.assetType === "ip_cidr" ? "IP address" : "URL"}
          required
          value={target}
          onChange={(event) => onChange({ scopeEntryId: selected.id, assetType: selected.assetType, target: event.target.value })}
          helperText={SPECIFIC_HELP[selected.assetType]?.(selected)}
          className="[&_input]:font-mono"
          maxLength={2048}
          spellCheck={false}
          autoComplete="off"
          error={error}
        />
      )}
    </div>
  );
}
