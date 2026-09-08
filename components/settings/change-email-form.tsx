"use client";

import React, { useState, useTransition } from "react";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { changeMyEmailAction } from "../../actions/account";

/** Starts Supabase's own real double-confirmation flow (supabase/config.toml's
 * `double_confirm_changes = true`) -- both the old and new address must click a real
 * confirmation link before the address actually changes. See docs/decisions/0055. */
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await changeMyEmailAction({ email });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent(true);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Input label="Current email" value={currentEmail} disabled readOnly />
      <Input label="New email" type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} />
      {sent && <Alert tone="success" title="Check both inboxes">We sent a confirmation link to {currentEmail} and to {email}. Your email only changes once both links are followed.</Alert>}
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
