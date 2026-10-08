"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Input } from "../ui/form";
import { PasswordInput } from "./password-input";
import { Button } from "../ui/button";
import { signInAction, resendConfirmationEmailAction } from "../../actions/auth";
import { ConfirmEmailPending } from "./confirm-email-pending";

/** Passkeys were evaluated for this slice and deliberately deferred -- Supabase's own
 * client SDK marks passkey methods "experimental," and this project's
 * supabase/config.toml has `[auth.passkey]` commented out (never enabled) -- see
 * docs/decisions/0023-authentication-experience-2026.md. No fabricated "Continue with
 * passkey" button exists above the email/password form for that reason. If passkeys are
 * enabled later, a primary-method block belongs directly above the divider comment below,
 * without restructuring anything else on this page. */
export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resendPending, startResendTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setShowResend(false);
    setResendSent(false);
    startTransition(async () => {
      const result = await signInAction({ email, password, redirectTo });
      if (!result.ok) {
        setError(result.message);
        // A real, known-unconfirmed account -- offer the same real resend path
        // ConfirmEmailPending uses right after signup, since we already have the exact
        // email they just typed. See docs/decisions/0052.1.
        if (result.code === "EMAIL_NOT_CONFIRMED") setShowResend(true);
        return;
      }
      // A real, hard top-level navigation -- not router.push/next/navigation's redirect().
      // signInAction deliberately returns the destination instead of redirecting
      // server-side: see SignInResult's own comment in actions/auth.ts for why a
      // client-side RSC-navigation-follow was confirmed live to not reliably carry the
      // session cookie this same response just set (a real, reproducible bug, not
      // theoretical). A genuine browser navigation always includes it.
      window.location.href = result.destination;
    });
  }

  function handleResend() {
    setResendSent(false);
    startResendTransition(async () => {
      const result = await resendConfirmationEmailAction({ email });
      if (result.ok) setResendSent(true);
      else setError(result.message);
    });
  }

  // The resend emails a 6-digit code -- show the same code-entry step signup uses, or the
  // code has nowhere to go.
  if (resendSent) return <ConfirmEmailPending email={email} emailIsSimulated={false} />;

  return (
    <>
      {/* Extension point for a future primary auth method (passkey) — intentionally empty. */}
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          labelExtra={
            <Link prefetch={false} href={"/forgot-password" as Route} className="text-xs font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus">
              Forgot password?
            </Link>
          }
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {showResend && (
          <div className="text-sm">
            <Button type="button" variant="secondary" pending={resendPending} onClick={handleResend}>
              Resend confirmation email
            </Button>
          </div>
        )}
        <Button type="submit" pending={pending} className="w-full justify-center">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 border-t border-border pt-6 text-center text-sm text-ink-muted">
        New to Unpatched?{" "}
        <Link prefetch={false} href={"/sign-up" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus">
          Create an account →
        </Link>
      </p>
    </>
  );
}
