"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { approveProgramLaunchAction, rejectProgramLaunchAction } from "../../actions/platform-operations";

/** Approve is a single click (mirrors replay-button.tsx); Reject requires a reason (mirrors
 * resolve-mediation-form.tsx's Textarea pattern). Both act on the same program row, so they
 * share one `done` state -- once either succeeds, the row's own outcome is final and the
 * other action no longer applies. */
export function ProgramLaunchReviewForm({ programId }: { programId: string }) {
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [pending, startTransition] = useTransition();

  if (done === "approved") return <p className="text-xs font-medium text-success">Approved. Program is now active.</p>;
  if (done === "rejected") return <p className="text-xs font-medium text-success">Rejected. Program returned to draft.</p>;

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveProgramLaunchAction({ programId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone("approved");
    });
  }

  function handleReject(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectProgramLaunchAction({ programId, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone("rejected");
    });
  }

  if (mode === "rejecting") {
    return (
      <form className="mt-3 space-y-2 border-t border-border pt-3" onSubmit={handleReject} noValidate>
        <Textarea label="Explain the rejection" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} error={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={() => setMode("idle")}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary" pending={pending}>
            Confirm rejection
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
      {error && (
        <p role="alert" className="mr-auto text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="button" variant="quiet" onClick={() => setMode("rejecting")} className="text-danger hover:bg-danger/10">
        Reject
      </Button>
      <Button type="button" pending={pending} onClick={handleApprove}>
        Approve
      </Button>
    </div>
  );
}
