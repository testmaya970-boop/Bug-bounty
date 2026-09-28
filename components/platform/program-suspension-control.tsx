"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { Dialog } from "../ui/navigation";
import { reinstateProgramAction, suspendProgramAction } from "../../actions/platform-operations";
import type { ProgramStatus } from "../../types/program";

/** One row action on the platform program directory. Suspend is only offered for a live
 * program (active/paused -- suspend_program rejects anything else); Reinstate only for a
 * suspended one. Both confirm in a dialog and require a reason, which lands in audit_logs. */
export function ProgramSuspensionControl({ programId, programName, status }: { programId: string; programName: string; status: ProgramStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mode = status === "suspended" ? "reinstate" : status === "active" || status === "paused" ? "suspend" : null;
  if (!mode) return null;

  const label = mode === "suspend" ? "Suspend" : "Reinstate";

  function close() {
    if (pending) return;
    setOpen(false);
    setReason("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const action = mode === "suspend" ? suspendProgramAction : reinstateProgramAction;
      const result = await action({ programId, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant={mode === "suspend" ? "quiet" : "secondary"} className={mode === "suspend" ? "text-danger hover:bg-danger/10" : undefined} onClick={() => setOpen(true)}>
        {label}
        <span className="sr-only"> {programName}</span>
      </Button>
      <Dialog open={open} title={`${label} ${programName}?`} onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">
            {mode === "suspend"
              ? "The program disappears from researcher discovery and stops accepting new reports. The organization cannot resume it. Existing reports can still be triaged."
              : "The program returns to the status it had before suspension and becomes visible to researchers again if it was public."}
          </p>
          <Textarea
            label={mode === "suspend" ? "Reason for suspension" : "Reason for reinstatement"}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            error={error ?? undefined}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={mode === "suspend" ? "destructive" : "primary"} pending={pending}>
              {mode === "suspend" ? "Suspend program" : "Reinstate program"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
