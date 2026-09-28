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
import { minorUnitsToDecimalString } from "../../lib/money";
import type { PaymentAttempt, PaymentObligation } from "../../types/payment";

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
          This records that <span className="font-mono font-semibold text-ink">{currency} {minorUnitsToDecimalString(amountMinorUnits)}</span> is owed to the
          researcher for this report's finalized bounty -- paid to them in full. A 20% platform fee is billed to your organization on top of it. This does not itself
          move any money; a payout must be initiated separately.
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
}: ReportRef & { obligationId: string; currency: string; amountMinorUnits: number; platformFeeMinorUnits: number; isRetry: boolean }) {
  return (
    <ConfirmDialog
      triggerLabel={isRetry ? "Retry payout" : "Initiate manual payout"}
      title={isRetry ? "Retry this payout?" : "Initiate a manual payout?"}
      description={
        <p>
          This starts a manual payout attempt. Transfer the full <span className="font-mono font-semibold text-ink">{currency} {minorUnitsToDecimalString(amountMinorUnits)}</span>{" "}
          bounty to the researcher.
          {platformFeeMinorUnits > 0 && (
            <> The {currency} {minorUnitsToDecimalString(platformFeeMinorUnits)} platform fee is billed to your organization separately and is not deducted from it.</>
          )}
          Unpatched does not transfer funds itself. An authorized operator must complete the transfer outside Unpatched (e.g. a wire transfer), then record the result here.
        </p>
      }
      confirmLabel={isRetry ? "Retry payout" : "Initiate payout"}
      onConfirm={() => initiateManualPaymentAttemptAction({ organizationId, programId, reportId, obligationId })}
    />
  );
}

/** Two-step: collect the outcome (and, if failed, a required failure code) before showing
 * a plain-language confirmation -- the same DESIGN.md pattern every consequential action
 * in this codebase already follows. This is the ONLY path to succeeded/failed; it is never
 * a side effect of initiating a payout. */
export function RecordPaymentResultDialog({ organizationId, programId, reportId, attempt }: ReportRef & { attempt: PaymentAttempt }) {
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
        attemptId: attempt.id,
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
              <Input label="Reference (optional)" helperText="e.g. a wire confirmation number." value={providerReferenceId} onChange={(event) => setProviderReferenceId(event.target.value)} />
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
        Cancel payment obligation
      </Button>
      <Dialog open={open} title="Cancel this payment obligation" onClose={close}>
        {step === "edit" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">This is a terminal state. Once cancelled, this obligation cannot be reactivated.</p>
            <Textarea label="Reason" required autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
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

/** Report detail's Payment section. Renders only once a bounty decision is finalized --
 * before that, there is nothing to say about payment. Separates "no obligation yet" from
 * every real PaymentObligationStatus, and never shows attempt-level detail (failure code/
 * message, provider reference) to anyone -- that stays in the manager-only audit trail,
 * consistent with 0013's finalizedBy precedent. See
 * docs/decisions/0014-payment-ledger-and-payout-orchestration.md. */
export function PaymentStatusSection({
  obligation,
  latestAttempt,
  canManage,
  bountyCurrency,
  bountyAmountMinorUnits,
  organizationId,
  programId,
  reportId,
}: {
  obligation: PaymentObligation | null;
  latestAttempt: PaymentAttempt | null;
  canManage: boolean;
  bountyCurrency: string;
  bountyAmountMinorUnits: number;
} & ReportRef) {
  if (!obligation) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">No payment obligation has been created yet.</p>
        {canManage && <CreatePaymentObligationButton organizationId={organizationId} programId={programId} reportId={reportId} currency={bountyCurrency} amountMinorUnits={bountyAmountMinorUnits} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        {STATUS_LABELS[obligation.status]}: <span className="font-mono font-semibold">{obligation.currency} {minorUnitsToDecimalString(obligation.amountMinorUnits)}</span>
      </p>
      {/* The fee is the organization's charge (202609250010): shown to managers only, never
          to the researcher, who is paid the full amount above. */}
      {canManage && obligation.platformFeeMinorUnits > 0 && (
        <p className="text-xs text-ink-muted">
          Paid to the researcher in full. Platform fee billed to your organization: {obligation.currency} {minorUnitsToDecimalString(obligation.platformFeeMinorUnits)} --
          total due {obligation.currency} {minorUnitsToDecimalString(obligation.amountMinorUnits + obligation.platformFeeMinorUnits)}.
        </p>
      )}
      {canManage && (obligation.status === "pending" || obligation.status === "failed") && (
        <div className="flex flex-wrap gap-2">
          <InitiateManualPayoutButton
            organizationId={organizationId}
            programId={programId}
            reportId={reportId}
            obligationId={obligation.id}
            currency={obligation.currency}
            amountMinorUnits={obligation.amountMinorUnits}
            platformFeeMinorUnits={obligation.platformFeeMinorUnits}
            isRetry={obligation.status === "failed"}
          />
          <CancelPaymentObligationDialog organizationId={organizationId} programId={programId} reportId={reportId} obligationId={obligation.id} />
        </div>
      )}
      {canManage && obligation.status === "processing" && latestAttempt && (
        <RecordPaymentResultDialog organizationId={organizationId} programId={programId} reportId={reportId} attempt={latestAttempt} />
      )}
    </div>
  );
}
