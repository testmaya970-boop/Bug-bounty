"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { beginMfaEnrollmentAction, confirmMfaEnrollmentAction, generateBackupCodesAction, unenrollMfaFactorAction } from "../../actions/mfa";
import type { MfaFactor } from "../../services/mfa";

type Step = "idle" | "confirming" | "showing_codes";

/**
 * Email-OTP enrollment: a real 6-digit code is generated server-side, hashed at rest,
 * and emailed to the account's own registered address (never one supplied here) --
 * there is no QR code or authenticator app. The 6-digit confirmation step is a real
 * server-side challenge check, never a client-side code check. Backup codes are shown
 * exactly once, right after the account reaches a genuine AAL2 session. See
 * docs/decisions/0052.
 */
export function MfaSettings({ factors }: { factors: MfaFactor[] }) {
  const router = useRouter();
  const verifiedFactor = factors.find((f) => f.status === "verified");
  const [step, setStep] = useState<Step>("idle");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleBegin() {
    setError(null);
    startTransition(async () => {
      const result = await beginMfaEnrollmentAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setFactorId(result.data.factorId);
      setStep("confirming");
    });
  }

  function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setError(null);
    startTransition(async () => {
      const confirmResult = await confirmMfaEnrollmentAction({ factorId, code });
      if (!confirmResult.ok) {
        setError(confirmResult.message);
        return;
      }
      const codesResult = await generateBackupCodesAction();
      if (!codesResult.ok) {
        setError(codesResult.message);
        return;
      }
      setBackupCodes(codesResult.data);
      setStep("showing_codes");
    });
  }

  function handleDone() {
    setStep("idle");
    setCode("");
    router.refresh();
  }

  function handleDisable() {
    if (!verifiedFactor) return;
    setError(null);
    startTransition(async () => {
      const result = await unenrollMfaFactorAction({ factorId: verifiedFactor.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div>
        <SectionLabel>Two-factor authentication</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">Require a one-time code sent to your email in addition to your password.</p>
      </div>

      {step === "idle" && verifiedFactor && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-success">Two-factor authentication is enabled.</p>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" pending={pending} onClick={handleDisable}>
              Disable
            </Button>
          </div>
        </div>
      )}

      {step === "idle" && !verifiedFactor && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-ink-muted">Not enabled.</p>
          <div className="mt-3 flex justify-end">
            <Button pending={pending} onClick={handleBegin}>
              Enable two-factor authentication
            </Button>
          </div>
        </div>
      )}

      {step === "confirming" && factorId && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-ink-muted">We emailed a 6-digit code to your registered email address. Enter it below to finish enabling two-factor authentication.</p>
          <form className="space-y-3" onSubmit={handleConfirm}>
            <Input label="6-digit code" inputMode="numeric" required maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("idle")} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" pending={pending}>
                Confirm
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === "showing_codes" && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <Alert tone="success" title="Two-factor authentication is enabled." />
          <div>
            <p className="text-sm font-medium text-ink">Save these backup codes</p>
            <p className="mt-1 text-sm text-ink-muted">Each code works once, if you lose access to your email. Shown only this one time.</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-muted p-3 font-mono text-sm">
              {backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleDone}>I've saved these codes</Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
