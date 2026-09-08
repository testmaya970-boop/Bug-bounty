"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput, passwordStrengthLabel, passwordStrengthLevel } from "./password-input";
import { Button } from "../ui/button";
import { resetPasswordAction } from "../../actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
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

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <PasswordInput
        label="New password"
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
        {pending ? "Updating password…" : "Update password"}
      </Button>
    </form>
  );
}
