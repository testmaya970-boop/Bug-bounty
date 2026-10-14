"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import {
  cancelPaymentObligationAction,
  createPaymentObligationAction,
  initiateManualPaymentAttemptAction,
  recordManualPaymentResultAction,
} from "../../actions/payments";
import { acceptBountyAction } from "../../actions/bounty";
import { LocalTime } from "../ui/local-time";
import { minorUnitsToDecimalString } from "../../lib/money";
import type { PaymentAttempt, PaymentObligation } from "../../types/payment";
import type { PayoutReadiness } from "../../services/payments";
import { PAYOUT_BLOCKER_LABELS as BLOCKER_LABELS } from "../../lib/payout-blockers";
import type { BountyAcceptance } from "../../services/bounty";

type ReportRef = { organizationId: string; programId: string; reportId: string };

const STATUS_LABELS: Record<PaymentObligation["status"], string> = {
  pending: "Payment pending",
  processing: "Payment processing",
  succeeded: "Payment completed",
  failed: "Payment failed",
  cancelled: "Payment cancelled",
};

/** Zero-input consequential confirmation -- the same shape triage-actions.tsx's own
 * ConfirmActionDialog already uses for Accept/Reject, since there is no form input to
 * collect before a "create obligation" or "initiate payout" action, only an already-known
 * consequence to show before committing. See DESIGN.md's consequential-dialog rule. */
function ConfirmDialog({
  triggerLabel,
  triggerVariant = "primary",
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "quiet" | "destructive";
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.message ?? "This action could not be completed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} title={title} onClose={close}>
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-ink-muted">{description}</div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant={triggerVariant === "destructive" ? "destructive" : "primary"} pending={pending} onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function CreatePaymentObligationButton({ organizationId, programId, reportId, currency, amountMinorUnits }: ReportRef & { currency: string; amountMinorUnits: number }) {
  return (
    <ConfirmDialog
      triggerLabel="Create payment obligation"
      title="Create a payment obligation?"
      description={
        <p>
          This records that <span className="font-mono font-semibold text-ink">{currency} {minorUnitsToDecimalString(amountMinorUnits)}</span> is owed for this
          report's finalized bounty -- split between the researcher and any collaborators by their agreed shares, each paid in full. A 20% platform fee is billed to
          your organization on top. This does not itself move any money; each payout is initiated separately.
        </p>
      }
      confirmLabel="Create obligation"
      onConfirm={() => createPaymentObligationAction({ organizationId, programId, reportId })}
    />
  );
}

export function InitiateManualPayoutButton({
  organizationId,
  programId,
  reportId,
  obligationId,
  currency,
  amountMinorUnits,
  platformFeeMinorUnits,
  isRetry,
  blocked,
}: ReportRef & { obligationId: string; currency: string; amountMinorUnits: number; platformFeeMinorUnits: number; isRetry: boolean; blocked?: boolean }) {
  if (blocked) {
    return (
      <Button variant="primary" disabled title="This researcher cannot be paid until the requirements above are met.">
        {isRetry ? "Retry payout" : "Pay researcher"}
      </Button>
    );
  }
  return (
    <ConfirmDialog
      triggerLabel={isRetry ? "Retry payout" : "Pay researcher"}
      title={isRetry ? "Retry this payout?" : "Pay this researcher?"}
      description={
        <p>
          Unpatched sends the full <span className="font-mono font-semibold text-ink">{currency} {minorUnitsToDecimalString(amountMinorUnits)}</span> bounty to the researcher
          from your balance, where it is already set aside.
          {platformFeeMinorUnits > 0 && <> The {currency} {minorUnitsToDecimalString(platformFeeMinorUnits)} platform fee is not deducted from it.</>} You never need the
          researcher&apos;s bank details.
        </p>
      }
      confirmLabel={isRetry ? "Retry payout" : "Pay researcher"}
      onConfirm={() => initiateManualPaymentAttemptAction({ organizationId, programId, reportId, obligationId })}
    />
  );
}

/** Two-step: collect the outcome (and, if failed, a required failure code) before showing
 * a plain-language confirmation -- the same DESIGN.md pattern every consequential action
 * in this codebase already follows. This is the ONLY path to succeeded/failed; it is never
 * a side effect of initiating a payout. */
export function RecordPaymentResultDialog({ organizationId, programId, reportId, attemptId }: ReportRef & { attemptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [outcome, setOutcome] = useState<"succeeded" | "failed">("succeeded");
  const [providerReferenceId, setProviderReferenceId] = useState("");
  const [failureCode, setFailureCode] = useState("");
  const [failureMessage, setFailureMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setStep("edit");
    setOutcome("succeeded");
    setProviderReferenceId("");
    setFailureCode("");
    setFailureMessage("");
    setError(null);
  }

  function handleContinue() {
    if (outcome === "succeeded" && providerReferenceId.trim().length === 0) {
      setError("Enter the transfer reference (e.g. a wire confirmation number).");
      return;
    }
    if (outcome === "failed" && failureCode.trim().length === 0) {
      setError("Enter a failure code (e.g. the reason the transfer could not be completed).");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await recordManualPaymentResultAction({
        organizationId,
        programId,
        reportId,
        attemptId,
        outcome,
        providerReferenceId: providerReferenceId.trim() || undefined,
        failureCode: outcome === "failed" ? failureCode.trim() : undefined,
        failureMessage: outcome === "failed" ? failureMessage.trim() || undefined : undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Record payout result</Button>
      <Dialog open={open} title="Record the outcome of this payout attempt" onClose={close}>
        {step === "edit" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Only record this after you have actually completed (or definitively failed to complete) the transfer outside Unpatched.
            </p>
            <Select label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as "succeeded" | "failed")}>
              <option value="succeeded">Succeeded: the transfer was completed</option>
              <option value="failed">Failed: the transfer could not be completed</option>
            </Select>
            {outcome === "succeeded" && (
              <Input label="Transfer reference" required helperText="e.g. a wire confirmation number -- proof the payment was actually made." value={providerReferenceId} onChange={(event) => setProviderReferenceId(event.target.value)} maxLength={200} />
            )}
            {outcome === "failed" && (
              <>
                <Input label="Failure code" required value={failureCode} onChange={(event) => setFailureCode(event.target.value)} maxLength={100} />
                <Textarea label="Failure message (optional)" value={failureMessage} onChange={(event) => setFailureMessage(event.target.value)} maxLength={500} />
              </>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="button" onClick={handleContinue}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              This records the payout attempt as{" "}
              <span className="font-semibold text-ink">{outcome === "succeeded" ? "succeeded" : "failed"}</span>
              {outcome === "failed" && <> ({failureCode})</>}. {outcome === "failed" && "The obligation can be retried or cancelled afterward."}
            </p>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("edit")} disabled={pending}>
                Back
              </Button>
              <Button type="button" variant={outcome === "failed" ? "destructive" : "primary"} pending={pending} onClick={handleConfirm}>
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Two-step, mirroring AdjustBountyDialog exactly: a cancellation always requires a
 * recorded reason. */
export function CancelPaymentObligationDialog({ organizationId, programId, reportId, obligationId }: ReportRef & { obligationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setStep("edit");
    setReason("");
    setError(null);
  }

  function handleContinue() {
    if (reason.trim().length === 0) {
      setError("Explain why this payment obligation is being cancelled.");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelPaymentObligationAction({ organizationId, programId, reportId, obligationId, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Cancel award
      </Button>
      <Dialog open={open} title="Cancel this award?" onClose={close}>
        {step === "edit" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">This obligation is closed for good. Once every obligation on this bounty is cancelled, the bounty can be adjusted and re-issued.</p>
            <Textarea label="Reason" required autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Keep award
              </Button>
              <Button type="button" onClick={handleContinue}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">This permanently cancels the payment obligation, recorded with the reason you gave.</p>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("edit")} disabled={pending}>
                Back
              </Button>
              <Button type="button" variant="destructive" pending={pending} onClick={handleConfirm}>
                Confirm cancellation
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** The submitter confirms the current award. Disputing goes through mediation below
 * (reason: bounty amount), which also pauses payment until it is settled. */
function ConfirmAwardButton({ organizationId, programId, reportId }: ReportRef) {
  return (
    <ConfirmDialog
      triggerLabel="Confirm award"
      triggerVariant="secondary"
      title="Confirm this bounty award?"
      description={<p>This tells the organization you accept the awarded amount. If you disagree with it, open a mediation request instead.</p>}
      confirmLabel="Confirm award"
      onConfirm={async () => {
        const result = await acceptBountyAction({ organizationId, programId, reportId });
        return result.ok ? { ok: true } : { ok: false, message: result.message };
      }}
    />
  );
}

/** Report detail's Payment section. Renders only once a bounty decision is finalized.
 * One row per recipient (submitter and split collaborators, 202610060008); a researcher sees
 * only their own (RLS). Attempt-level detail stays manager-only. Payout blockers name the
 * missing requirement, never the payout destination. See
 * docs/decisions/0014-payment-ledger-and-payout-orchestration.md. */
export function PaymentStatusSection({
  obligations,
  latestAttempts,
  readiness,
  acceptance,
  canManage,
  isOwnReport,
  bountyCurrency,
  bountyAmountMinorUnits,
  organizationId,
  programId,
  reportId,
}: {
  obligations: PaymentObligation[];
  latestAttempts: Record<string, PaymentAttempt>;
  readiness: PayoutReadiness[];
  acceptance: BountyAcceptance | null;
  canManage: boolean;
  isOwnReport: boolean;
  bountyCurrency: string;
  bountyAmountMinorUnits: number;
} & ReportRef) {
  const ref = { organizationId, programId, reportId };
  const live = obligations.filter((o) => o.status !== "cancelled");
  const cancelled = obligations.filter((o) => o.status === "cancelled");
  const names = new Map(readiness.map((r) => [r.researcherId, r.displayName]));
  const blockersOf = (researcherId: string) => readiness.find((r) => r.researcherId === researcherId)?.blockers ?? [];
  const ownBlockers = isOwnReport ? readiness.flatMap((r) => r.blockers) : [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {acceptance ? (
          <>
            {isOwnReport ? "You" : "The researcher"} confirmed this award on <LocalTime value={acceptance.acceptedAt} dateOnly />.
          </>
        ) : isOwnReport ? (
          "You haven't confirmed this award yet."
        ) : (
          "The researcher hasn't confirmed this award yet."
        )}
      </p>
      {isOwnReport && !acceptance && <ConfirmAwardButton {...ref} />}

      {!canManage && ownBlockers.length > 0 && (
        <div className="rounded-md border border-warning bg-surface-muted p-3 text-sm">
          <p className="font-medium text-ink">Before you can be paid:</p>
          <ul className="mt-1 list-disc pl-5 text-ink-muted">
            {ownBlockers.map((b) => (
              <li key={b}>{BLOCKER_LABELS[b]}</li>
            ))}
          </ul>
          <a href="/settings/payments" className="mt-2 inline-block font-semibold text-action hover:text-action-hover">
            Update payout settings →
          </a>
        </div>
      )}

      {live.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">{cancelled.length > 0 ? "Every payment obligation for this bounty was cancelled." : "No payment obligation has been created yet."}</p>
          {canManage && <CreatePaymentObligationButton {...ref} currency={bountyCurrency} amountMinorUnits={bountyAmountMinorUnits} />}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {live.map((obligation) => {
            const blockers = blockersOf(obligation.researcherId);
            const attempt = latestAttempts[obligation.id];
            return (
              <li key={obligation.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{names.get(obligation.researcherId) ?? "Researcher"}</p>
                  <p className="text-sm text-ink">
                    {STATUS_LABELS[obligation.status]}: <span className="font-mono font-semibold">{obligation.currency} {minorUnitsToDecimalString(obligation.amountMinorUnits)}</span>
                  </p>
                </div>
                {/* The fee is the organization's charge (202609250010): managers only. */}
                {canManage && obligation.platformFeeMinorUnits > 0 && (
                  <p className="text-xs text-ink-muted">
                    Paid to the researcher in full. Platform fee from your balance: {obligation.currency} {minorUnitsToDecimalString(obligation.platformFeeMinorUnits)} -- total{" "}
                    {obligation.currency} {minorUnitsToDecimalString(obligation.amountMinorUnits + obligation.platformFeeMinorUnits)}.
                  </p>
                )}
                {canManage && blockers.length > 0 && obligation.status !== "succeeded" && (
                  <p className="text-xs font-medium text-warning">Can&apos;t be paid yet: {blockers.map((b) => BLOCKER_LABELS[b]).join("; ")}.</p>
                )}
                {canManage && (obligation.status === "pending" || obligation.status === "failed") && (
                  <div className="flex flex-wrap gap-2">
                    <InitiateManualPayoutButton
                      {...ref}
                      obligationId={obligation.id}
                      currency={obligation.currency}
                      amountMinorUnits={obligation.amountMinorUnits}
                      platformFeeMinorUnits={obligation.platformFeeMinorUnits}
                      isRetry={obligation.status === "failed"}
                      blocked={blockers.length > 0}
                    />
                    {/* An accepted award changes only through mediation (202610140006). */}
                    {!acceptance && <CancelPaymentObligationDialog {...ref} obligationId={obligation.id} />}
                  </div>
                )}
                {canManage && obligation.status === "processing" && attempt && <p className="text-xs text-ink-muted">Unpatched is sending this payout.</p>}
              </li>
            );
          })}
        </ul>
      )}
      {cancelled.length > 0 && live.length > 0 && (
        <p className="text-xs text-ink-muted">
          {cancelled.length} earlier obligation{cancelled.length === 1 ? " was" : "s were"} cancelled.
        </p>
      )}
    </div>
  );
}
