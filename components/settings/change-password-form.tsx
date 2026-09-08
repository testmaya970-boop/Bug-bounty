"use client";

import React, { useState, useTransition } from "react";
import { PasswordInput, passwordStrengthLabel, passwordStrengthLevel } from "../auth/password-input";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { changeMyPasswordAction } from "../../actions/account";

/** In-session password change -- a real, distinct path from the forgot-password recovery
 * flow (which requires a fresh recovery-email session instead). See
 * docs/decisions/0055. */
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const strength = passwordStrengthLabel(password);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await changeMyPasswordAction({ password });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      setPassword("");
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <PasswordInput
        label="New password"
        autoComplete="new-password"
        required
        minLength={12}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setSaved(false);
        }}
        strengthLevel={passwordStrengthLevel(password)}
        helperText={strength ? `At least 12 characters. Strength: ${strength}.` : "At least 12 characters. Length matters more than symbols."}
      />
      {saved && <Alert tone="success" title="Password updated." />}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Update password
        </Button>
      </div>
    </form>
  );
}
