"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { beginMfaEnrollmentAction, beginTotpEnrollmentAction, confirmMfaEnrollmentAction, generateBackupCodesAction, unenrollMfaFactorAction } from "../../actions/mfa";
import type { MfaFactor, MfaMethod } from "../../services/mfa";

type Step = "idle" | "confirming" | "showing_codes";

const METHOD_LABEL: Record<MfaMethod, string> = {
  totp: "Authenticator app",
  email: "Email code",
};

/**
 * Two methods, one enabled at a time (docs/decisions/0052; authenticator added in
 * db/migrations/202610080003_totp_mfa.sql):
 * - Authenticator app (TOTP): the secret is shown once as a QR code and setup key; the
 *   first real code from the app confirms it. Works offline, so it's the stronger option.
 * - Email code: a 6-digit code emailed to the account's own registered address.
 * Either way the confirmation is a server-side check, and backup codes are shown exactly
 * once, right after the session reaches a genuine AAL2. Switching = disable, then enable.
 */
export function MfaSettings({ factors }: { factors: MfaFactor[] }) {
  const router = useRouter();
  const verifiedFactor = factors.find((f) => f.status === "verified");
  const [step, setStep] = useState<Step>("idle");
  const [method, setMethod] = useState<MfaMethod>("totp");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleBegin(chosen: MfaMethod) {
    setError(null);
    setCode("");
    startTransition(async () => {
      if (chosen === "totp") {
        const result = await beginTotpEnrollmentAction();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setFactorId(result.data.factorId);
        setTotpSetup({ secret: result.data.secret, qrSvg: result.data.qrSvg });
      } else {
        const result = await beginMfaEnrollmentAction();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setFactorId(result.data.factorId);
        setTotpSetup(null);
      }
      setMethod(chosen);
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
      setTotpSetup(null);
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
        <p className="mt-1 text-sm text-ink-muted">Ask for a one-time code in addition to your password when you sign in.</p>
      </div>

      {step === "idle" && verifiedFactor && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-success">Two-factor authentication is enabled.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Method: <span className="font-medium text-ink">{METHOD_LABEL[verifiedFactor.method]}</span>. To switch methods, disable it and enable the other one.
          </p>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" pending={pending} onClick={handleDisable}>
              Disable
            </Button>
          </div>
        </div>
      )}

      {step === "idle" && !verifiedFactor && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">Authenticator app</p>
            <p className="mt-1 flex-1 text-sm text-ink-muted">Google Authenticator, Microsoft Authenticator, 1Password or similar. Works without signal or email. Recommended.</p>
            <div className="mt-3">
              <Button pending={pending} onClick={() => handleBegin("totp")}>
                Set up authenticator app
              </Button>
            </div>
          </div>
          <div className="flex flex-col rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">Email code</p>
            <p className="mt-1 flex-1 text-sm text-ink-muted">We email a 6-digit code to your registered address each time you sign in.</p>
            <div className="mt-3">
              <Button variant="secondary" pending={pending} onClick={() => handleBegin("email")}>
                Use email codes
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "confirming" && factorId && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          {method === "totp" && totpSetup ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                1. Open your authenticator app and scan this QR code. 2. Enter the 6-digit code it shows.
              </p>
              <div className="flex flex-col items-start gap-4 sm:flex-row">
                {/* Server-generated by the qrcode library from our own otpauth:// URI -- no user input. */}
                <div aria-label="QR code for your authenticator app" role="img" className="size-44 shrink-0 rounded-md border border-border bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: totpSetup.qrSvg }} />
                <div className="min-w-0 text-sm">
                  <p className="text-ink-muted">Can't scan it? Enter this setup key in the app instead:</p>
                  <p data-testid="totp-secret" className="mt-2 break-all rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-sm tracking-wider text-ink">
                    {totpSetup.secret.replace(/(.{4})/g, "$1 ").trim()}
                  </p>
                  <p className="mt-2 text-xs text-ink-muted">Type: time-based. Account: your Unpatched email.</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">We emailed a 6-digit code to your registered email address. Enter it below to finish enabling two-factor authentication.</p>
          )}
          <form className="space-y-3" onSubmit={handleConfirm}>
            <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
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
            <p className="mt-1 text-sm text-ink-muted">
              Each code works once, if you lose access to your {method === "totp" ? "authenticator app" : "email"}. Shown only this one time.
            </p>
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
