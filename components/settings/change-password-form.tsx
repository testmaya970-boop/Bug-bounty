"use client";

import React, { useState, useTransition } from "react";
import { PasswordInput, passwordStrengthLabel, passwordStrengthLevel } from "../auth/password-input";
import { PASSWORD_RULE_TEXT, passwordProblem } from "../../lib/auth/password-policy";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { changeMyPasswordAction } from "../../actions/account";

/** In-session password change -- a real, distinct path from the forgot-password recovery
 * flow (which requires a fresh recovery-email session instead). See
 * docs/decisions/0055. */
export function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const strength = passwordStrengthLabel(password);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (password !== confirmPassword) {
      if (!confirmPassword) setError("Confirm your new password.");
      return;
    }
    startTransition(async () => {
      const result = await changeMyPasswordAction({ currentPassword, password });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      setPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {/* Hidden username for the browser's password manager, so it saves the new password
          against this account (see reset-password-form.tsx). */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden aria-hidden="true" />
      <PasswordInput label="Current password" autoComplete="current-password" required value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setSaved(false); }} />
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
        helperText={!password ? PASSWORD_RULE_TEXT : (passwordProblem(password) ?? `Strength: ${strength}.`)}
      />
      <PasswordInput
        label="Confirm new password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setSaved(false);
        }}
        error={mismatch ? "Passwords don't match." : undefined}
      />
      {saved &&<Alert tone="success" title="Password updated." />}
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
