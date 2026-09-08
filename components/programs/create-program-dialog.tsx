"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { createProgramAction } from "../../actions/programs";
import { ENGAGEMENT_TYPE_ORDER, engagementTypeLabel } from "../../lib/program-status";
import type { EngagementType, ProgramType } from "../../types/program";

// Generated once per dialog session (not per submit), so a double-click or a
// network-retry-after-timeout replays the same key -- the database returns the
// already-created program instead of creating a second one (202608260004).
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function CreateProgramDialog({ organizationId, triggerLabel = "Create engagement" }: { organizationId: string; triggerLabel?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [programType, setProgramType] = useState<ProgramType>("bounty");
  const [engagementType, setEngagementType] = useState<EngagementType>("bug_bounty");
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
    setProgramType("bounty");
    setEngagementType("bug_bounty");
    setError(null);
    setIdempotencyKey(newIdempotencyKey());
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return; // belt-and-suspenders alongside the disabled submit button
    setError(null);
    startTransition(async () => {
      const result = await createProgramAction({ organizationId, name, idempotencyKey, programType, engagementType });
      if (!result.ok) {
        setError(result.code === "AUTH_REQUIRED" ? "Your session has expired. Sign in again to continue." : result.message);
        return;
      }
      // Only navigate once the database has actually committed -- result.ok means the
      // RPC returned successfully, not merely that the request was sent.
      setOpen(false);
      router.push(`/organizations/${organizationId}/programs/${result.data.id}` as Route);
    });
  }

  return (
    <>
      <Button onClick={openDialog}>{triggerLabel}</Button>
      <Dialog open={open} title="Create engagement" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">You&apos;ll be its manager. It starts as a draft, visible only inside this organization.</p>
          <Input label="Engagement name" required autoFocus value={name} onChange={(event) => setName(event.target.value)} error={error ?? undefined} maxLength={160} />
          <Select
            label="Engagement type"
            helperText="The kind of security engagement this is. Cannot be changed after creation."
            value={engagementType}
            onChange={(event) => setEngagementType(event.target.value as EngagementType)}
          >
            {ENGAGEMENT_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {engagementTypeLabel(type)}
              </option>
            ))}
          </Select>
          <Select
            label="Program type"
            helperText={programType === "vdp" ? "Vulnerability-disclosure-only: no bounty payment can ever be configured. Cannot be changed after creation." : "Paid bounty: a bounty policy can be configured once this program is set up. Cannot be changed after creation."}
            value={programType}
            onChange={(event) => setProgramType(event.target.value as ProgramType)}
          >
            <option value="bounty">Paid bounty</option>
            <option value="vdp">Vulnerability disclosure only (no payment)</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Create engagement
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
