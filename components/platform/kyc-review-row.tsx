"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { reviewKycFieldAction } from "../../actions/researcher-profiles";
import { KYC_FIELD_LABELS } from "../../lib/researcher-identity-labels";
import type { KycField, KycStatus } from "../../types/researcher-identity";

const PENDING_FIELDS: KycField[] = ["phone", "aadhaar", "pan", "passport"];

/**
 * One pending KYC field, one decision -- verify or reject, with an optional note. No
 * "Verify via DigiLocker" call: a platform admin makes this decision after their own
 * out-of-band review (see docs/decisions/0051 and the migration's own comment on why
 * Sentinel has no real government-ID-verification provider integration).
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
            <KycFieldReview key={field} userId={userId} field={field} onResolved={() => setResolvedFields((current) => [...current, field])} />
          ))}
      </div>
    </li>
  );
}

function KycFieldReview({ userId, field, onResolved }: { userId: string; field: KycField; onResolved: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "verified" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await reviewKycFieldAction({ targetUserId: userId, field, decision, note: note || undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onResolved();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted p-3">
      <span className="text-sm font-medium text-ink">{KYC_FIELD_LABELS[field]}</span>
      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        aria-label={`Review note for ${KYC_FIELD_LABELS[field]} (optional)`}
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
