"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { requestPasswordResetAction } from "../../actions/auth";

/** The one deliberately neutral response in this entire flow -- rendered identically
 * whether or not the submitted email belongs to a real account (see
 * services/auth.ts's requestPasswordReset and docs/decisions/0023). The only
 * observable failure is a real, non-enumerating one: malformed input or a rate limit. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction({ email });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <Alert tone="success" title="Check your email">
        If an account exists for {email || "that email"}, we&apos;ve sent instructions for resetting your password.
      </Alert>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending} className="w-full justify-center">
        {pending ? "Sending reset link…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        <Link href={"/sign-in" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
