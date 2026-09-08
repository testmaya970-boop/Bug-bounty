"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Select, Textarea } from "../ui/form";
import { resolveEscalatedMediationAction } from "../../actions/platform-operations";

export function ResolveMediationForm({ mediationId }: { mediationId: string }) {
  const [outcome, setOutcome] = useState<"resolved" | "declined">("resolved");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <p className="text-xs font-medium text-success">Recorded.</p>;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await resolveEscalatedMediationAction({ mediationId, outcome, resolutionNotes: notes });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
    });
  }

  return (
    <form className="mt-3 space-y-2 border-t border-border pt-3" onSubmit={handleSubmit} noValidate>
      <Select label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
        <option value="resolved">Resolved</option>
        <option value="declined">Declined</option>
      </Select>
      <Textarea label="Explain the resolution" required value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={3000} error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save response
        </Button>
      </div>
    </form>
  );
}
