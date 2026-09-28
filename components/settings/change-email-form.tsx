"use client";

import React, { useState, useTransition } from "react";
import { Input } from "../ui/form";
import { PasswordInput } from "../auth/password-input";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { changeMyEmailAction } from "../../actions/account";

/** Changes the sign-in email right away, after re-checking the current password (see
 * services/account.ts changeMyEmail for the deferred double-confirmation). */
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [changedTo, setChangedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await changeMyEmailAction({ currentPassword, email });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setChangedTo(email.trim().toLowerCase());
      setCurrentPassword("");
      setSent(true);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Input label="Current email" value={currentEmail} disabled readOnly />
      <Input label="New email" type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} />
      <PasswordInput label="Current password" autoComplete="current-password" required value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setSent(false); }} />
      {sent && <Alert tone="success" title="Email changed">You now sign in with {changedTo}.</Alert>}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Change email
        </Button>
      </div>
    </form>
  );
}
