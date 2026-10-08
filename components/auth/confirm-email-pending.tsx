"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { resendConfirmationEmailAction, verifySignupCodeAction } from "../../actions/auth";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The real "confirm your email" state after signup -- see docs/decisions/0052.1, revised
 * to a typed 6-digit code rather than a clickable link (per explicit product direction).
 * Two things a bare "Check your email" alert didn't do:
 *
 * 1. Honesty about where the email actually goes. `emailIsSimulated` is passed down from
 *    a real Server Component (app/researchers/sign-up/page.tsx /
 *    app/organizations/sign-up/page.tsx), which reads lib/email-provider.ts's own
 *    `activeEmailProvider.name === "dev"` directly -- never inferred from
 *    `process.env.NODE_ENV`. That guess (this component's own earlier version) went
 *    stale the moment `gmail-smtp` became a real, genuinely-sending provider usable
 *    outside production: NODE_ENV !== "production" is true in that config too, so the old
 *    check claimed "not delivered anywhere" while a real email was actually sent. The
 *    provider's own name is the only fact that can never be wrong about what it does.
 * 2. A real code-entry step and a real resend path. `verifySignupCodeAction` wraps
 *    services/auth.ts's own native, enumeration-safe verifySignupCode (checks the emailed
 *    6-digit code against the account's live challenge, single-use/attempt-limited/
 *    time-limited server-side) and establishes a real session on success.
 *    `resendConfirmationEmailAction` wraps resendConfirmationEmail, which issues a fresh
 *    code -- never a second, custom system.
 */
export function ConfirmEmailPending({ email, emailIsSimulated }: { email: string; emailIsSimulated: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifySignupCodeAction({ email, code });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // A real hard navigation, like SignInForm: see verifySignupCodeAction's comment.
      window.location.href = result.destination;
    });
  }

  function handleResend() {
    setError(null);
    setResent(false);
    startTransition(async () => {
      const result = await resendConfirmationEmailAction({ email });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    });
  }

  return (
    <div className="space-y-4">
      <Alert tone="success" title="Confirm your email">
        We sent a 6-digit code to {email}. Enter it below to finish creating your account.
      </Alert>

      {emailIsSimulated && (
        <Alert tone="warning" title="No real email provider configured">
          Verification codes are only logged to the server console right now, not delivered anywhere. Set EMAIL_PROVIDER to a real provider (see lib/email-provider.ts) to send real email.
        </Alert>
      )}

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          helperText="Enter the 6-digit code we emailed you."
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button type="submit" pending={pending} className="w-full justify-center">
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <div className="text-center text-sm text-ink-muted">
        <p>Didn&apos;t receive it?</p>
        <Button type="button" variant="secondary" pending={pending} disabled={cooldown > 0} onClick={handleResend} className="mt-2">
          {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
        </Button>
        {resent && !error && <p className="mt-2 text-success">Sent again. Check your email.</p>}
      </div>
    </div>
  );
}
