"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Input } from "../ui/form";
import { PasswordInput, passwordStrengthLabel, passwordStrengthLevel } from "./password-input";
import { Button } from "../ui/button";
import { ConfirmEmailPending } from "./confirm-email-pending";
import { signUpAction } from "../../actions/auth";
import { isBusinessEmail } from "../../lib/auth/business-email";

/** `intent` decides only which real, existing page a freshly-created account lands on --
 * see signUpAction's own comment. It never creates a role or an organization. For
 * "organization" it also collects a company name (auto-created once the emailed 6-digit
 * code is confirmed, see verifySignupCodeAction) and requires a work email; for
 * "researcher" it collects a name and username, carried through as the verification
 * challenge's metadata (see services/auth.ts's signUpWithPassword) -- docs/decisions/0050. */
export function SignUpForm({ intent, emailIsSimulated }: { intent?: "researcher" | "organization"; emailIsSimulated: boolean }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailTouchedAndPersonal = intent === "organization" && email.length > 0 && !isBusinessEmail(email);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (emailTouchedAndPersonal) {
      setError("Use your work email address to create an organization account.");
      return;
    }
    startTransition(async () => {
      const result = await signUpAction({
        email,
        password,
        intent,
        displayName: intent === "researcher" ? displayName || undefined : undefined,
        username: intent === "researcher" ? username || undefined : undefined,
        companyName: intent === "organization" ? companyName || undefined : undefined,
      });
      // A returned "confirm_email" result means a real 6-digit code was emailed and we
      // show the code-entry step below; any other returned result is an error.
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.status === "confirm_email") setConfirmEmail(result.email ?? email);
    });
  }

  if (confirmEmail) {
    return <ConfirmEmailPending email={confirmEmail} emailIsSimulated={emailIsSimulated} />;
  }

  const strength = passwordStrengthLabel(password);

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-7">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {intent === "researcher" && (
          <>
            <Input label="Your name" autoComplete="name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} />
            <Input
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              maxLength={32}
              helperText="Letters, numbers, and underscores. We'll pick one for you if you leave this blank or it's taken."
            />
          </>
        )}
        {intent === "organization" && <Input label="Organization name" autoComplete="organization" required value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={160} />}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailTouchedAndPersonal ? "Use your work email address." : undefined}
          helperText={intent === "organization" && !emailTouchedAndPersonal ? "Use your work email, not a personal gmail/yahoo/outlook address." : undefined}
        />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          strengthLevel={passwordStrengthLevel(password)}
          helperText={strength ? `At least 12 characters. Strength: ${strength}.` : "At least 12 characters. Length matters more than symbols."}
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button type="submit" pending={pending} className="w-full justify-center">
          {pending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link prefetch={false} href={"/sign-in" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
