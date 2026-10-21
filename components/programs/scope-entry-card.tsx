"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton } from "../ui/button";
import { Dialog } from "../ui/navigation";
import { Input, Select, Textarea } from "../ui/form";
import { AssetTypeBadge, ScopeStateBadge } from "../ui/badge";
import { removeScopeEntryAction, updateScopeEntryAction } from "../../actions/scope";
import { assetTypeLabel } from "../../lib/scope-labels";
import { cn } from "../../lib/cn";
import type { ProgramAssetType, ScopeEntry, ScopeState } from "../../types/scope";
import { LocalTime } from "../ui/local-time";
import { PencilSimple, Trash } from "@phosphor-icons/react";

const ASSET_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

const TARGET_PLACEHOLDER: Record<ProgramAssetType, string> = {
  domain: "api.example.com or *.example.com",
  url: "https://api.example.com/admin",
  ip_cidr: "203.0.113.0/24 or 203.0.113.5",
  ios_app: "https://apps.apple.com/app/id123456789 or com.example.app",
  android_app: "https://play.google.com/store/apps/details?id=com.example.app",
  source_code: "https://github.com/example/repo",
  hardware: "Model XR-200 router",
  ai_model: "gpt-example-v2 or https://api.example.com/v1/chat/completions",
};

/** Edits the entry's target, type, and description in place via update_scope_entry
 * (db/migrations/202609090009_editable_scope_target.sql), which re-canonicalizes an
 * edited target exactly like add_scope_entry does. This overrides
 * docs/decisions/0006-scope-asset-model.md's original "target is immutable, edit means
 * remove+re-add" decision -- see that migration's own header for the audit-history
 * trade-off this carries. */
function EditScopeEntryDialog({ organizationId, programId, entry }: { organizationId: string; programId: string; entry: ScopeEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assetType, setAssetType] = useState<ProgramAssetType>(entry.assetType);
  const [target, setTarget] = useState(entry.displayTarget);
  const [description, setDescription] = useState(entry.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setAssetType(entry.assetType);
    setTarget(entry.displayTarget);
    setDescription(entry.description ?? "");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await updateScopeEntryAction({
        organizationId,
        programId,
        entryId: entry.id,
        scopeState: entry.scopeState,
        description: description || undefined,
        assetType,
        targetInput: target,
      });
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
      <IconButton label="Edit" variant="secondary" onClick={() => setOpen(true)}>
        <PencilSimple aria-hidden="true" className="size-[18px]" />
      </IconButton>
      <Dialog open={open} title="Edit scope entry" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Select
            label="Target type"
            value={assetType}
            onChange={(event) => setAssetType(event.target.value as ProgramAssetType)}
          >
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {assetTypeLabel(type)}
              </option>
            ))}
          </Select>
          <Input
            label="Target"
            required
            autoFocus
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={TARGET_PLACEHOLDER[assetType]}
            className="[&_input]:font-mono"
            maxLength={2048}
            error={error ?? undefined}
          />
          <Textarea label="Description" helperText="Optional." value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Save changes
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

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
      <IconButton label="Remove" variant="quiet" className="text-danger" onClick={() => setOpen(true)}>
        <Trash aria-hidden="true" className="size-[18px]" />
      </IconButton>
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
 * columns alone, without reading a sentence.
 *
 * The 7rem status track (measured against the old, non-mono badge style) clipped once
 * the brutalist reskin made ScopeStateBadge mono/uppercase with 0.08em tracking --
 * "OUT OF SCOPE" no longer fit and its trailing letters were cut off against the next
 * column. 9rem comfortably fits that widest label at the new tracking.
 *
 * The status column is a FIXED track width (9rem) and the action column is a FIXED track
 * width (22rem) with `whitespace-nowrap` and no wrap on the button group -- each row here
 * is its own independent grid container (RegistryList is a plain <ul>, not one shared
 * grid), so a status label or an `auto`/`flex-wrap`-able action column sizes itself
 * per-row from that row's own content alone. "In scope" pairs with the longer "Mark out
 * of scope" toggle label; "Out of scope" pairs with the shorter "Mark in scope" -- so
 * without a hard-fixed, non-wrapping action column, rows alternate between the button
 * group fitting on one line and wrapping to two, changing both the row height AND the
 * Edit button's x-position depending on which status that row happens to show (confirmed
 * live: a `flex-wrap` group inside a merely-generous-but-not-quite-wide-enough 20rem
 * column still wrapped on the "In scope" rows in real font rendering). 22rem comfortably
 * exceeds the widest realistic combination (Edit + "Mark out of scope" + Remove, measured
 * live at ~19.2rem), and `whitespace-nowrap` plus no `flex-wrap` makes a wrap impossible
 * even if a future longer label is added, rather than merely unlikely. The group is
 * right-aligned inside the fixed column so Remove's right edge lines up on every row. */
export function ScopeEntryCard({ organizationId, programId, entry, canManage }: { organizationId: string; programId: string; entry: ScopeEntry; canManage: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:gap-x-4 sm:px-5",
        canManage ? "sm:grid-cols-[5.5rem_1fr_9rem_22rem]" : "sm:grid-cols-[5.5rem_1fr_9rem]",
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
        <div className="col-span-2 flex flex-nowrap justify-end gap-2 whitespace-nowrap sm:col-span-1">
          <EditScopeEntryDialog organizationId={organizationId} programId={programId} entry={entry} />
          <ToggleStateDialog organizationId={organizationId} programId={programId} entry={entry} />
          <RemoveEntryDialog organizationId={organizationId} programId={programId} entry={entry} />
        </div>
      )}
      <p className="col-span-2 text-xs text-ink-muted sm:col-span-1 sm:col-start-2">
        Added by {entry.createdByName} on <LocalTime value={entry.createdAt} dateOnly />
      </p>
    </div>
  );
}
