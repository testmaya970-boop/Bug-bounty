"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { generateBackupCodesAction } from "../../actions/mfa";

/** Regenerating backup codes requires a real AAL2 session (the RPC itself checks this,
 * see docs/decisions/0052) -- generate_my_mfa_backup_codes' own STRONG_AUTH_REQUIRED
 * error surfaces honestly here if the caller hasn't done a fresh TOTP verify this
 * session. See docs/decisions/0055. */
export function AccountRecoverySettings({ totpEnrolled, remainingBackupCodes }: { totpEnrolled: boolean; remainingBackupCodes: number }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateBackupCodesAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCodes(result.data);
    });
  }

  if (!totpEnrolled) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-ink-muted">Backup codes exist once two-factor authentication is enabled. Enable it under Account Security first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-ink">
          <span className="font-semibold">{remainingBackupCodes}</span> unused backup code{remainingBackupCodes === 1 ? "" : "s"} remaining.
        </p>
        <p className="mt-1 text-sm text-ink-muted">Each code works once, if you lose access to your authenticator app. Regenerating replaces every existing code.</p>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" pending={pending} onClick={handleRegenerate}>
            Regenerate backup codes
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {codes && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <Alert tone="success" title="New backup codes generated">
            Every previous code is now invalid. Save these: shown only this once.
          </Alert>
          <ul className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-muted p-3 font-mono text-sm">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
