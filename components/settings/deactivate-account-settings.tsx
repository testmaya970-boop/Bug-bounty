"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { Alert } from "../ui/feedback";
import { deactivateMyAccountAction } from "../../actions/account";

/** Real, immediate deactivation -- sets deactivated_at and deletes every real session row
 * (0055). Hard deletion is NOT offered: nearly every foreign key from a user's own real
 * activity is `on delete restrict`, so a genuine hard delete would fail loudly for any
 * account with real history. Disclosed here, not silently omitted. */
export function DeactivateAccountSettings() {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDeactivate() {
    setError(null);
    startTransition(async () => {
      try {
        await deactivateMyAccountAction();
      } catch {
        setError("The request could not be completed. Try again in a moment.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Alert tone="warning" title="Account deletion is not available">
        Unpatched does not offer permanent account deletion: your account is referenced by real, immutable history (submitted reports, organizations you created) that cannot be safely removed. Deactivation is the real, available option below.
      </Alert>

      <div className="rounded-lg border border-danger/40 bg-danger/5 p-4">
        <h2 className="text-sm font-semibold text-ink">Deactivate account</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Deactivating signs you out of every device immediately. There is no self-serve reactivation. Contact support if you change your mind. Type <span className="font-mono font-semibold">DEACTIVATE</span> to confirm.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Input label="Type DEACTIVATE to confirm" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="max-w-[220px]" />
          <Button variant="destructive" pending={pending} disabled={confirmText !== "DEACTIVATE"} onClick={handleDeactivate}>
            Deactivate my account
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
