"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/form";
import { deleteResearcherAction, reactivateAccountAction, reinstateResearcherAction, suspendResearcherAction } from "../../actions/platform-operations";

/** The "suspend by username" form -- a researcher who is not yet suspended has no other
 * list this page could show them in, so this takes a username directly (same input pattern
 * as report-collaborators.tsx's AddCollaboratorForm), not a pick-from-a-list control. */
export function SuspendResearcherForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await suspendResearcherAction({ username, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUsername("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-surface p-4" onSubmit={handleSubmit} noValidate>
      <Input label="Researcher's username" placeholder="jane_researcher" required value={username} onChange={(event) => setUsername(event.target.value)} />
      <Textarea label="Explain why this account is being suspended" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
      <div className="flex justify-end">
        <Button type="submit" variant="destructive" pending={pending}>
          Suspend
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** The "delete by username" form -- same shape as SuspendResearcherForm above (no list to
 * pick from, so username in). Irreversible: scrubs PII and blocks sign-in for good, see
 * deleteResearcherAction's own comment for why this can't be a real row delete. */
export function DeleteResearcherForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!window.confirm(`Delete @${username}? This permanently scrubs their profile and blocks sign-in. This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteResearcherAction({ username, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUsername("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-danger/40 bg-surface p-4" onSubmit={handleSubmit} noValidate>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-danger">Delete a researcher account</h2>
      <p className="text-xs text-ink-muted">Permanently scrubs their profile and blocks sign-in. Their reports and payout history are kept for integrity -- this cannot be undone.</p>
      <Input label="Researcher's username" placeholder="jane_researcher" required value={username} onChange={(event) => setUsername(event.target.value)} />
      <Textarea label="Explain why this account is being deleted" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
      <div className="flex justify-end">
        <Button type="submit" variant="destructive" pending={pending}>
          Delete account
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** One reinstate action per already-suspended row -- mirrors replay-button.tsx's
 * single-click shape, plus a required reason (mirrors resolve-mediation-form.tsx). */
export function ReinstateResearcherForm({ userId }: { userId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <p className="text-xs font-medium text-success">Reinstated.</p>;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await reinstateResearcherAction({ userId, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
    });
  }

  return (
    <form className="mt-3 space-y-2 border-t border-border pt-3" onSubmit={handleSubmit} noValidate>
      <Textarea label="Explain the reinstatement" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" pending={pending}>
          Reinstate
        </Button>
      </div>
    </form>
  );
}

/** Undoes a user's own deactivation -- the "contact support" path the deactivation page
 * promises. Keyed by email (what a person writing to support gives), any account type.
 * Accounts deleted by a platform admin are refused by the database. */
export function ReactivateAccountForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await reactivateAccountAction({ email, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(`${email.trim()} can sign in again.`);
      setEmail("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-surface p-4" onSubmit={handleSubmit} noValidate>
      <div>
        <p className="text-sm font-semibold text-ink">Reactivate a deactivated account</p>
        <p className="mt-1 text-sm text-ink-muted">For someone who deactivated their own account and asked to come back. Accounts deleted by a platform admin can't be reactivated.</p>
      </div>
      <Input label="Account email" type="email" placeholder="name@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <Textarea label="Explain why this account is being reactivated" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Reactivate
        </Button>
      </div>
      {done && <p className="text-xs font-medium text-success">{done}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
