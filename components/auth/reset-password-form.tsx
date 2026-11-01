"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput, passwordStrengthLabel, passwordStrengthLevel } from "./password-input";
import { PASSWORD_RULE_TEXT, passwordProblem } from "../../lib/auth/password-policy";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { resetPasswordAction } from "../../actions/auth";

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      if (!confirmPassword) setError("Confirm your new password.");
      return;
    }
    startTransition(async () => {
      const result = await resetPasswordAction({ token, password });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/sign-in?reset=success");
      router.refresh();
    });
  }

  const strength = passwordStrengthLabel(password);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {/* Names the account being reset -- and gives the browser's password manager the
          username, so it updates THIS account's saved password. Without it, Chrome kept
          autofilling the old password on sign-in ("Incorrect email or password"). */}
      <Input label="Account" type="email" name="username" autoComplete="username" value={email} readOnly />
      <PasswordInput
        label="New password"
        autoComplete="new-password"
        required
        minLength={12}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
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
        }}
        error={mismatch ? "Passwords don't match." : undefined}
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending} className="w-full justify-center">
        {pending ? "Updating password…" : "Update password"}
      </Button>
    </form>
  );
}
