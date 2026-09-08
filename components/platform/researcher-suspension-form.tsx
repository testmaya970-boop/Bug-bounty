"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/form";
import { reinstateResearcherAction, suspendResearcherAction } from "../../actions/platform-operations";

/** The "suspend by username" form -- a researcher who is not yet suspended has no other
 * list this page could show them in, so this takes a username directly (same input pattern
 * as report-collaborators.tsx's AddCollaboratorForm), not a pick-from-a-list control. */
export function SuspendResearcherForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await suspendResearcherAction({ username, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUsername("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-surface p-4" onSubmit={handleSubmit} noValidate>
      <Input label="Researcher's username" placeholder="jane-researcher" required value={username} onChange={(event) => setUsername(event.target.value)} />
      <Textarea label="Explain why this account is being suspended" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
      <div className="flex justify-end">
        <Button type="submit" variant="destructive" pending={pending}>
          Suspend
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** One reinstate action per already-suspended row -- mirrors replay-button.tsx's
 * single-click shape, plus a required reason (mirrors resolve-mediation-form.tsx). */
export function ReinstateResearcherForm({ userId }: { userId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <p className="text-xs font-medium text-success">Reinstated.</p>;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await reinstateResearcherAction({ userId, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
    });
  }

  return (
    <form className="mt-3 space-y-2 border-t border-border pt-3" onSubmit={handleSubmit} noValidate>
      <Textarea label="Explain the reinstatement" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" pending={pending}>
          Reinstate
        </Button>
      </div>
    </form>
  );
}
