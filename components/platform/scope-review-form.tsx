"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { reviewScopeEntryAction } from "../../actions/scope";

export function ScopeReviewForm({ entryId }: { entryId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) return <p className="mt-3 text-xs font-medium text-success">{done === "approved" ? "Approved. Researchers can now test it." : "Rejected. The organization sees your note."}</p>;

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await reviewScopeEntryAction({ entryId, decision, note });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(decision);
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <Textarea label="Note to the organization" helperText="Required when rejecting." value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} error={error ?? undefined} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => decide("rejected")}>
          Reject
        </Button>
        <Button pending={pending} onClick={() => decide("approved")}>
          Approve ownership
        </Button>
      </div>
    </div>
  );
}
