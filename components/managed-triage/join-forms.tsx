"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { PASSWORD_RULE_TEXT } from "../../lib/auth/password-policy";
import { acceptAnalystInvitationAction, joinAsAnalystAction } from "../../actions/managed-triage";

// After joining, two-factor comes next: the triage queue only opens on a verified session.
const NEXT = "/settings/security" as Route;

/** No account yet: name + password, created from the invitation. */
export function JoinAsAnalystForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const r = await joinAsAnalystAction({ token, name, password, confirm });
          if (!r.ok) return setError(r.message);
          router.push(NEXT);
        });
      }}
    >
      <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} />
      <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required helperText={PASSWORD_RULE_TEXT} />
      <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending} className="w-full">
        Create account and join
      </Button>
    </form>
  );
}

/** Signed in already (with the invited email): one click. */
export function AcceptAnalystInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        className="w-full"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await acceptAnalystInvitationAction(token);
            if (!r.ok) return setError(r.message);
            router.push(NEXT);
          })
        }
      >
        Join as a triage analyst
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
