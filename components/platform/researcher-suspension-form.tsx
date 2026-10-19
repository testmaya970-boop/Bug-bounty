"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { deleteResearcherAction, reactivateAccountAction, reinstateResearcherAction, suspendResearcherAction } from "../../actions/platform-operations";
import type { AdminAccountMatch } from "../../services/platform-operations";
import { AccountSearch } from "./account-search";

/** The "suspend by username" form -- a researcher who is not yet suspended has no other
 * list this page could show them in, so this takes a username directly (same input pattern
 * as report-collaborators.tsx's AddCollaboratorForm), not a pick-from-a-list control. */
export function SuspendResearcherForm() {
  const router = useRouter();
  const [account, setAccount] = useState<AdminAccountMatch | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!account) {
      setError("Search for and select the researcher to suspend.");
      return;
    }
    startTransition(async () => {
      const result = await suspendResearcherAction({ username: account.username, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAccount(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-surface p-4" onSubmit={handleSubmit} noValidate>
      <AccountSearch label="Researcher" selected={account} onSelect={setAccount} />
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
  const [account, setAccount] = useState<AdminAccountMatch | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!account) {
      setError("Search for and select the researcher to delete.");
      return;
    }
    if (!window.confirm(`Delete ${account.displayName} (@${account.username}${account.email ? `, ${account.email}` : ""})? This permanently scrubs their profile and blocks sign-in. This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteResearcherAction({ username: account.username, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAccount(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-danger/40 bg-surface p-4" onSubmit={handleSubmit} noValidate>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-danger">Delete a researcher account</h2>
      <p className="text-xs text-ink-muted">Permanently scrubs their profile and blocks sign-in. Their reports and payout history are kept for integrity -- this cannot be undone.</p>
      <AccountSearch label="Researcher" selected={account} onSelect={setAccount} />
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
 * promises -- from that account's row in the restricted-accounts list (found with its search).
 * Accounts deleted by a platform admin never appear there; the database refuses them anyway. */
export function ReactivateAccountForm({ email }: { email: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <p className="mt-2 text-xs font-medium text-success">{email} can sign in again.</p>;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await reactivateAccountAction({ email, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <form className="mt-3 space-y-2 border-t border-border pt-3" onSubmit={handleSubmit} noValidate>
      <Textarea label="Explain why this account is being reactivated" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" pending={pending}>
          Reactivate
        </Button>
      </div>
    </form>
  );
}
