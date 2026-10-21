"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/form";
import { liftSubmissionRestrictionAction, pauseResearcherSubmissionsAction } from "../../actions/submission-signal";
import type { AdminAccountMatch } from "../../services/platform-operations";
import { AccountSearch } from "./account-search";

/** Pause one researcher's report submissions for 1-90 days without suspending the account:
 * they keep reading programs, messaging on open reports and getting paid (202610210001). */
export function PauseSubmissionsForm() {
  const router = useRouter();
  const [account, setAccount] = useState<AdminAccountMatch | null>(null);
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!account?.email) {
      setError("Search for and select the researcher to pause.");
      return;
    }
    const email = account.email;
    startTransition(async () => {
      const result = await pauseResearcherSubmissionsAction({ email, days: Number(days), reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAccount(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-surface p-4" onSubmit={handleSubmit} noValidate aria-label="Pause report submissions">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pause report submissions</h2>
      <p className="text-xs text-ink-muted">For spam or low-quality runs that don&apos;t justify a suspension. The researcher sees your reason on every report form.</p>
      <AccountSearch label="Researcher" selected={account} onSelect={setAccount} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <Input label="Days" type="number" inputMode="numeric" min={1} max={90} required value={days} onChange={(event) => setDays(event.target.value)} />
        <Textarea label="Reason shown to the researcher" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Pause submissions
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

export function LiftRestrictionButton({ restrictionId, name }: { restrictionId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        pending={pending}
        aria-label={`Resume submissions for ${name}`}
        onClick={() =>
          startTransition(async () => {
            const result = await liftSubmissionRestrictionAction({ restrictionId });
            if (!result.ok) setError(result.message);
            else router.refresh();
          })
        }
      >
        Resume
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
