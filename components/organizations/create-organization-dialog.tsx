"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { createOrganizationAction } from "../../actions/organizations";

// Generated once per dialog session (not per submit), so a double-click or a
// network-retry-after-timeout replays the same key -- the database returns the
// already-created organization instead of creating a second one (202608260003).
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function CreateOrganizationDialog({ triggerLabel = "Create organization" }: { triggerLabel?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setOpen(true);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setName("");
    setError(null);
    setIdempotencyKey(newIdempotencyKey());
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return; // belt-and-suspenders alongside the disabled submit button
    setError(null);
    startTransition(async () => {
      const result = await createOrganizationAction({ name, idempotencyKey });
      if (!result.ok) {
        setError(result.code === "AUTH_REQUIRED" ? "Your session has expired. Sign in again to continue." : result.message);
        return;
      }
      // Only navigate once the database has actually committed -- result.ok means the
      // RPC returned successfully, not merely that the request was sent.
      setOpen(false);
      router.push(`/organizations/${result.data.id}/members` as Route);
    });
  }

  return (
    <>
      <Button onClick={openDialog}>{triggerLabel}</Button>
      <Dialog open={open} title="Create organization" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">You&apos;ll be the owner. You can invite your team once it&apos;s created.</p>
          <Input label="Organization name" required autoFocus value={name} onChange={(event) => setName(event.target.value)} error={error ?? undefined} maxLength={160} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Create organization
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
