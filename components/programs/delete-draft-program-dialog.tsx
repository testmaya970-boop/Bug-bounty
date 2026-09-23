"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, IconButton } from "../ui/button";
import { Dialog } from "../ui/navigation";
import { deleteDraftProgramAction } from "../../actions/programs";

/** Draft-only -- the Engagements list only ever renders this for a program whose status
 * is "draft" (see app/organizations/[organizationId]/programs/page.tsx). Anything past
 * draft uses ProgramLifecycleControls' own Close action instead; delete_draft_program
 * itself re-checks the status server-side regardless of what this component assumes. A
 * real hard delete (see db/migrations/202609090008_delete_draft_program.sql for why that's
 * safe here), so this confirms once, same weight as RemoveEntryDialog's own confirm step. */
export function DeleteDraftProgramDialog({ organizationId, programId, programName }: { organizationId: string; programId: string; programName: string }) {
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
      const result = await deleteDraftProgramAction({ organizationId, programId });
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
      <IconButton
        label={`Delete ${programName}`}
        variant="destructive"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </IconButton>
      <Dialog open={open} title="Delete draft engagement?" onClose={close}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">{programName}</span> and its scope will be permanently deleted. This cannot be undone. Only a draft engagement can be deleted -- once it&apos;s submitted for review, use Close
            program instead.
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
              Delete engagement
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
