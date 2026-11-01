"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Select } from "../ui/form";
import { Dialog } from "../ui/navigation";
import { linkReportToScopeEntryAction } from "../../actions/scope";
import { assetTypeLabel } from "../../lib/scope-labels";
import type { ScopeEntry } from "../../types/scope";

/** The inbox's "link this report to an asset" control -- only rendered for a report with
 * no matchedScopeEntryId (see InboxSelectedReport's own comment on when that happens).
 * `candidates` is this program's own active scope entries, already fetched by the caller
 * (never fetched again here) -- the same "pass data down, don't fetch in a leaf client
 * component" convention this codebase already follows (e.g. DuplicateTargetPicker in
 * triage-actions.tsx fetches lazily on open instead, but that picker spans an unbounded
 * cross-report search; this one is scoped to one program's own scope list, already small
 * and already loaded server-side for this exact render). */
export function AssetLinkPicker({
  organizationId,
  programId,
  reportId,
  candidates,
}: {
  organizationId: string;
  programId: string;
  reportId: string;
  candidates: ScopeEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scopeEntryId, setScopeEntryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !scopeEntryId) return;
    setError(null);
    startTransition(async () => {
      const result = await linkReportToScopeEntryAction({ organizationId, programId, reportId, scopeEntryId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setScopeEntryId("");
      router.refresh();
    });
  }

  if (candidates.length === 0) {
    return <span className="text-xs text-ink-muted">No assets defined in this engagement&apos;s scope yet.</span>;
  }

  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)}>
        Link asset
      </Button>
      <Dialog open={open} title="Link this report to an asset" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">Choose the asset this report&apos;s finding actually applies to. Only assets from this same engagement can be linked.</p>
          <Select label="Asset" required autoFocus value={scopeEntryId} onChange={(event) => setScopeEntryId(event.target.value)}>
            <option value="">Select an asset…</option>
            {candidates.map((entry) => (
              <option key={entry.id} value={entry.id}>
                [{assetTypeLabel(entry.assetType)}] {entry.displayTarget}
              </option>
            ))}
          </Select>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending} disabled={!scopeEntryId}>
              Link asset
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
