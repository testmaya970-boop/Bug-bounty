"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Dialog } from "../ui/navigation";
import { AssetTypeBadge, ScopeStateBadge } from "../ui/badge";
import { removeScopeEntryAction, updateScopeEntryAction } from "../../actions/scope";
import { formatDate } from "../../lib/format-date";
import { cn } from "../../lib/cn";
import type { ScopeEntry, ScopeState } from "../../types/scope";

function ToggleStateDialog({ organizationId, programId, entry }: { organizationId: string; programId: string; entry: ScopeEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nextState: ScopeState = entry.scopeState === "in_scope" ? "out_of_scope" : "in_scope";

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await updateScopeEntryAction({ organizationId, programId, entryId: entry.id, scopeState: nextState, description: entry.description ?? undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Mark {nextState === "in_scope" ? "in scope" : "out of scope"}
      </Button>
      <Dialog open={open} title="Change scope decision?" onClose={close}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            <span className="font-mono">{entry.displayTarget}</span> will change from <ScopeStateBadge state={entry.scopeState} /> to <ScopeStateBadge state={nextState} />. This is the authorization decision itself. It will
            change what this target counts as once researcher access exists.
          </p>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" pending={pending} onClick={handleConfirm}>
              Confirm change
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function RemoveEntryDialog({ organizationId, programId, entry }: { organizationId: string; programId: string; entry: ScopeEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await removeScopeEntryAction({ organizationId, programId, entryId: entry.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <Dialog open={open} title="Remove scope entry?" onClose={close}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            <span className="font-mono">{entry.displayTarget}</span> will no longer count as covered by this program&apos;s scope. Its history is preserved for audit purposes: it is not deleted from the database.
          </p>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" pending={pending} onClick={handleConfirm}>
              Remove scope entry
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** A single scope registry row -- TYPE / TARGET / STATE as three genuinely aligned
 * columns (a CSS grid with fixed track widths, not flex-wrap), the shape a real
 * authorization registry uses. Attribution is a quiet second line under the target
 * column; management controls sit in their own trailing column, present only for a
 * manager who can currently act. "Can I test this?" should resolve from the first two
 * columns alone, without reading a sentence. */
export function ScopeEntryCard({ organizationId, programId, entry, canManage }: { organizationId: string; programId: string; entry: ScopeEntry; canManage: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:gap-x-4 sm:px-5",
        canManage ? "sm:grid-cols-[5.5rem_1fr_7rem_auto]" : "sm:grid-cols-[5.5rem_1fr_7rem]",
      )}
    >
      <AssetTypeBadge assetType={entry.assetType} />
      <div className="min-w-0">
        <span className="break-all font-mono text-sm font-medium text-ink">{entry.displayTarget}</span>
        {entry.description && <p className="mt-0.5 text-sm text-ink-muted">{entry.description}</p>}
      </div>
      <div className="col-span-2 sm:col-span-1">
        <ScopeStateBadge state={entry.scopeState} />
      </div>
      {canManage && (
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:justify-end">
          <ToggleStateDialog organizationId={organizationId} programId={programId} entry={entry} />
          <RemoveEntryDialog organizationId={organizationId} programId={programId} entry={entry} />
        </div>
      )}
      <p className="col-span-2 text-xs text-ink-muted sm:col-span-1 sm:col-start-2">
        Added by {entry.createdByName} on {formatDate(entry.createdAt)}
      </p>
    </div>
  );
}
