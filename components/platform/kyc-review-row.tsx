"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { reviewKycFieldAction, reviewTaxFormAction } from "../../actions/researcher-profiles";
import { KYC_FIELD_LABELS } from "../../lib/researcher-identity-labels";
import type { KycField, KycStatus, TaxFormType } from "../../types/researcher-identity";

const PENDING_FIELDS: KycField[] = ["phone", "aadhaar", "pan", "passport"];

/**
 * One pending KYC field, one decision -- verify or reject, with an optional note. No
 * "Verify via DigiLocker" call: a platform admin makes this decision after their own
 * out-of-band review (see docs/decisions/0051 and the migration's own comment on why
 * Unpatched has no real government-ID-verification provider integration).
 */
export function KycReviewRow({ userId, displayName, email, statuses }: { userId: string; displayName: string; email: string | null; statuses: Record<KycField, KycStatus> }) {
  const pendingFields = PENDING_FIELDS.filter((field) => statuses[field] === "pending");
  const [resolvedFields, setResolvedFields] = useState<KycField[]>([]);

  if (pendingFields.every((field) => resolvedFields.includes(field))) return null;

  return (
    <li className="flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium text-ink">{displayName}</p>
        {email && <p className="text-xs text-ink-muted">{email}</p>}
      </div>
      <div className="space-y-2">
        {pendingFields
          .filter((field) => !resolvedFields.includes(field))
          .map((field) => (
            <DecisionControl
              key={field}
              label={KYC_FIELD_LABELS[field]}
              decide={(decision, note) => reviewKycFieldAction({ targetUserId: userId, field, decision, note })}
              onResolved={() => setResolvedFields((current) => [...current, field])}
            />
          ))}
      </div>
    </li>
  );
}

const TAX_FORM_LABELS: Record<TaxFormType, string> = { w9: "W-9", w8ben: "W-8BEN", w8ben_e: "W-8BEN-E" };

/** One pending tax form (202610060008) -- a verified form is a payout requirement. */
export function TaxFormReviewRow({ userId, displayName, email, taxFormType, taxIdLast4 }: { userId: string; displayName: string; email: string | null; taxFormType: TaxFormType; taxIdLast4: string | null }) {
  const [resolved, setResolved] = useState(false);
  if (resolved) return null;
  return (
    <li className="flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium text-ink">{displayName}</p>
        {email && <p className="text-xs text-ink-muted">{email}</p>}
      </div>
      <DecisionControl
        label={TAX_FORM_LABELS[taxFormType] + (taxIdLast4 ? " · tax ID ending " + taxIdLast4 : "")}
        decide={(decision, note) => reviewTaxFormAction({ targetUserId: userId, decision, note })}
        onResolved={() => setResolved(true)}
      />
    </li>
  );
}

function DecisionControl({
  label,
  decide: submit,
  onResolved,
}: {
  label: string;
  decide: (decision: "verified" | "rejected", note: string | undefined) => Promise<{ ok: boolean; message?: string }>;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "verified" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await submit(decision, note || undefined);
      if (!result.ok) {
        setError(result.message ?? "This decision could not be saved.");
        return;
      }
      onResolved();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted p-3">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        aria-label={`Review note for ${label} (optional)`}
        className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
      />
      <Button variant="secondary" pending={pending} onClick={() => decide("verified")}>
        Verify
      </Button>
      <Button variant="secondary" pending={pending} onClick={() => decide("rejected")}>
        Reject
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
