"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { reinstateOrganizationAction, suspendOrganizationAction } from "../../actions/platform-operations";
import type { AdminOrganizationMatch } from "../../services/platform-operations";
import { OrganizationSearch } from "./account-search";

/** Suspend-by-slug -- same shape as researcher-suspension-form.tsx's SuspendResearcherForm,
 * just keyed by organization slug instead of researcher username (organizations have no
 * public username-equivalent; slug is the one stable, human-typeable identifier). */
export function SuspendOrganizationForm() {
  const router = useRouter();
  const [organization, setOrganization] = useState<AdminOrganizationMatch | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!organization) {
      setError("Search for and select the organization to suspend.");
      return;
    }
    startTransition(async () => {
      const result = await suspendOrganizationAction({ slug: organization.slug, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOrganization(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3 rounded-lg border border-border bg-surface p-4" onSubmit={handleSubmit} noValidate>
      <OrganizationSearch label="Organization" selected={organization} onSelect={setOrganization} />
      <Textarea label="Explain why this organization is being suspended" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
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

/** One reinstate action per already-suspended row -- same shape as
 * researcher-suspension-form.tsx's ReinstateResearcherForm. */
export function ReinstateOrganizationForm({ organizationId }: { organizationId: string }) {
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
      const result = await reinstateOrganizationAction({ organizationId, reason });
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
