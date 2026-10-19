"use client";

import React, { useState, useTransition } from "react";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { redeemBackupCodeGateAction, requestMfaVerificationCodeAction, verifyMfaGateAction } from "../../actions/mfa";

/**
 * The sign-in-time MFA gate: a real emailed 6-digit code (verified server-side, elevates
 * the session to AAL2) or a real backup code (verified against `mfa_backup_codes`,
 * tracked in `mfa_verified_sessions`) -- see docs/decisions/0052. Reached only when
 * proxy.ts's own gate has already confirmed this account has a verified email-OTP
 * factor and this session hasn't cleared it yet. middleware's redirect into this page is
 * itself the trigger to send the first code (see app/mfa/verify/page.tsx).
 */
export function MfaVerifyForm({ factorId, method, redirectTo, emailIsSimulated = false }: { factorId: string; method: "email" | "totp"; redirectTo?: string; emailIsSimulated?: boolean }) {
  const isTotp = method === "totp";
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy("verify");
    startTransition(async () => {
      const result = useBackupCode ? await redeemBackupCodeGateAction({ code, redirectTo }) : await verifyMfaGateAction({ factorId, code, redirectTo });
      if (!result.ok) setError(result.message);
    });
  }

  function handleResend() {
    setError(null);
    setResent(false);
    setBusy("resend");
    startTransition(async () => {
      const result = await requestMfaVerificationCodeAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResent(true);
    });
  }

  const verifying = pending && busy === "verify";
  const resending = pending && busy === "resend";

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {emailIsSimulated && !isTotp && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink">
          No real email provider is configured, so the code is printed in the dev server terminal, not emailed.
        </p>
      )}
      {useBackupCode ? (
        <Input label="Backup code" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} helperText="One of the 10-character codes you saved when you enabled two-factor authentication." />
      ) : (
        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          helperText={isTotp ? "Enter the 6-digit code from your authenticator app." : "Enter the 6-digit code we emailed you."}
        />
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {resent && !error && (
        <p className="text-sm font-medium text-success">A new code has been sent. Earlier codes no longer work.</p>
      )}
      <Button type="submit" pending={verifying} disabled={resending} className="w-full justify-center">
        {verifying ? "Verifying…" : "Verify"}
      </Button>
      {!useBackupCode && !isTotp && (
        <button
          type="button"
          onClick={handleResend}
          disabled={pending}
          className="w-full text-center text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-55"
        >
          {resending ? "Sending a new code…" : "Email me a new code"}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setUseBackupCode((current) => !current);
          setCode("");
          setError(null);
        }}
        className="w-full text-center text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus"
      >
        {useBackupCode ? (isTotp ? "Use your authenticator app instead" : "Use your emailed code instead") : "Use a backup code instead"}
      </button>
    </form>
  );
}
