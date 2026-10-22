"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/form";
import { adjustBountyAction, calculateBountyRecommendationAction, checkAwardFundingAction, finalizeBountyAction } from "../../actions/bounty";
import type { AwardFunding } from "../../services/bounty";
import { minorUnitsToDecimalString, parseDecimalToMinorUnits } from "../../lib/money";
import type { ReportBountyDecision } from "../../types/bounty";
import { LocalTime } from "../ui/local-time";

type ReportRef = { organizationId: string; programId: string; reportId: string };

export function CalculateBountyButton({ organizationId, programId, reportId, relabelAsRecalculate }: ReportRef & { relabelAsRecalculate: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await calculateBountyRecommendationAction({ organizationId, programId, reportId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant={relabelAsRecalculate ? "secondary" : "primary"} pending={pending} onClick={handleClick}>
        {relabelAsRecalculate ? "Recalculate bounty" : "Calculate bounty"}
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Two-step: enter an amount and an optional note, then confirm the exact amount before
 * committing -- the same DESIGN.md pattern every consequential action in this codebase
 * already follows. Finalizing is a real financial commitment; the amount need not fall
 * inside the calculated range (an exceptional reward is a legitimate outcome). */
export function FinalizeBountyDialog({ organizationId, programId, reportId, currency }: ReportRef & { currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [funding, setFunding] = useState<AwardFunding | null>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    setStep("edit");
    setFunding(null);
    setAmountInput("");
    setNote("");
    setError(null);
  }

  function handleContinue() {
    const amount = parseDecimalToMinorUnits(amountInput);
    if (amount === null) {
      setError("Enter a valid, non-negative amount.");
      return;
    }
    setError(null);
    // Show what finalizing will check (budget left, balance covers) before the commit step.
    startTransition(async () => {
      const result = await checkAwardFundingAction({ organizationId, programId, reportId, amountMinorUnits: amount });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setFunding(result.data);
      setStep("confirm");
    });
  }

  function handleConfirm() {
    const amount = parseDecimalToMinorUnits(amountInput);
    if (amount === null) return;
    setError(null);
    startTransition(async () => {
      const result = await finalizeBountyAction({ organizationId, programId, reportId, amountMinorUnits: amount, note });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  const amount = parseDecimalToMinorUnits(amountInput);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Finalize bounty</Button>
      <Dialog open={open} title="Finalize this bounty" onClose={close}>
        {step === "edit" ? (
          <div className="space-y-4">
            <Input label={`Amount (${currency})`} required autoFocus value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder="0.00" className="max-w-40" />
            <Textarea label="Note" helperText="Required if the amount is outside the policy range." value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="button" pending={pending} onClick={handleContinue}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              This finalizes the bounty at <span className="font-mono font-semibold text-ink">{currency} {amount !== null ? minorUnitsToDecimalString(amount) : amountInput}</span>. Once finalized, only an explicit adjustment (with a recorded reason) can change it.
            </p>
            {/* Finalizing records the decision; paying it draws on the prepaid balance
                (202610140004). Said here, at the moment an org admin commits to a number. */}
            <p className="text-sm text-ink-muted">Paying it takes the bounty plus the platform fee from your organization&apos;s balance. Unpatched sends it to the researcher.</p>
            {funding && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border p-3 text-sm">
                <dt className="text-ink-muted">With the platform fee</dt>
                <dd className="text-right font-mono tabular-nums text-ink">
                  {funding.currency} {minorUnitsToDecimalString(funding.neededMinorUnits)}
                </dd>
                <dt className="text-ink-muted">Organization balance</dt>
                <dd className={`text-right font-medium ${funding.balanceCovers ? "text-success" : "text-danger"}`}>{funding.balanceCovers ? "Covers it" : "Doesn't cover it"}</dd>
                <dt className="text-ink-muted">Program budget</dt>
                <dd className={`text-right ${funding.budget && !funding.budget.covers ? "font-medium text-danger" : "text-ink"}`}>
                  {funding.budget ? `${funding.budget.currency} ${minorUnitsToDecimalString(Math.max(funding.budget.leftMinorUnits, 0))} left of ${minorUnitsToDecimalString(funding.budget.capMinorUnits)}` : "No limit set"}
                </dd>
              </dl>
            )}
            {funding && (!funding.balanceCovers || (funding.budget && !funding.budget.covers)) && (
              <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink">
                {!funding.balanceCovers ? "Ask an owner or billing admin to add funds in Payments first." : "This would go over the program's budget. An owner or billing admin can raise it in Payments."}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("edit")} disabled={pending}>
                Back
              </Button>
              <Button type="button" pending={pending} disabled={Boolean(funding && (!funding.balanceCovers || (funding.budget && !funding.budget.covers)))} onClick={handleConfirm}>
                Confirm finalization
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

export function AdjustBountyDialog({ organizationId, programId, reportId, currency, currentAmountMinorUnits }: ReportRef & { currency: string; currentAmountMinorUnits: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [amountInput, setAmountInput] = useState(() => minorUnitsToDecimalString(currentAmountMinorUnits));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setStep("edit");
    setAmountInput(minorUnitsToDecimalString(currentAmountMinorUnits));
    setReason("");
    setError(null);
  }

  function handleContinue() {
    const amount = parseDecimalToMinorUnits(amountInput);
    if (amount === null) {
      setError("Enter a valid, non-negative amount.");
      return;
    }
    if (reason.trim().length === 0) {
      setError("Explain why this bounty is being adjusted.");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleConfirm() {
    const amount = parseDecimalToMinorUnits(amountInput);
    if (amount === null) return;
    setError(null);
    startTransition(async () => {
      const result = await adjustBountyAction({ organizationId, programId, reportId, newAmountMinorUnits: amount, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  const amount = parseDecimalToMinorUnits(amountInput);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Adjust bounty
      </Button>
      <Dialog open={open} title="Adjust this bounty" onClose={close}>
        {step === "edit" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Current amount: {currency} {minorUnitsToDecimalString(currentAmountMinorUnits)}.</p>
            <Input label={`New amount (${currency})`} required autoFocus value={amountInput} onChange={(event) => setAmountInput(event.target.value)} className="max-w-40" />
            <Textarea label="Reason" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
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
              This changes the finalized bounty from <span className="font-mono">{currency} {minorUnitsToDecimalString(currentAmountMinorUnits)}</span> to{" "}
              <span className="font-mono font-semibold text-ink">{currency} {amount !== null ? minorUnitsToDecimalString(amount) : amountInput}</span>, recorded with the reason you gave.
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
              <Button type="button" variant="destructive" pending={pending} onClick={handleConfirm}>
                Confirm adjustment
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Separates eligibility, the calculated recommendation, and the final decision --
 * DESIGN.md/the task both require this to never read as one theatrical financial
 * dashboard. `canFinalize` is the narrow org owner/security_admin authorization;
 * `canCalculate` is the broader triage authorization -- the same distinction the
 * database itself enforces. See docs/decisions/0013-bounty-decision-engine.md. */
export function BountyDecisionSection({
  decision,
  canCalculate,
  reportIsFinal,
  canFinalize,
  organizationId,
  programId,
  reportId,
}: { decision: ReportBountyDecision | null; canCalculate: boolean; reportIsFinal: boolean; canFinalize: boolean } & ReportRef) {
  if (!decision) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">Bounty eligibility has not been evaluated yet.</p>
        {/* calculate_bounty_recommendation rejects any report that can still change status
            (REPORT_NOT_FINALIZED) -- say so up front instead of offering a button that can only fail. */}
        {canCalculate && reportIsFinal && <CalculateBountyButton organizationId={organizationId} programId={programId} reportId={reportId} relabelAsRecalculate={false} />}
        {canCalculate && !reportIsFinal && <p className="text-sm text-ink-muted">The bounty can be calculated once this report reaches a final decision, such as Resolved.</p>}
      </div>
    );
  }

  if (decision.state === "ineligible") {
    return <p className="text-sm text-ink-muted">Not bounty-eligible. {decision.ineligibleReason}</p>;
  }

  if (decision.state === "calculated") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Calculated range: <span className="font-mono font-semibold text-ink">
            {decision.currency} {decision.calculatedMinAmountMinorUnits !== null ? minorUnitsToDecimalString(decision.calculatedMinAmountMinorUnits) : ""}
            {" - "}
            {decision.calculatedMaxAmountMinorUnits !== null ? minorUnitsToDecimalString(decision.calculatedMaxAmountMinorUnits) : ""}
          </span>{" "}
          for {decision.severityAtCalculation} severity. This is a recommendation, not a final decision.
        </p>
        {decision.assetTier && decision.assetTier > 1 && decision.tierPercent && decision.tierPercent < 100 && (
          <p className="text-sm text-ink-muted">The report's asset is tier {decision.assetTier}, so the range is {decision.tierPercent}% of the program's bounty table.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canCalculate && <CalculateBountyButton organizationId={organizationId} programId={programId} reportId={reportId} relabelAsRecalculate={true} />}
          {canFinalize && decision.currency && <FinalizeBountyDialog organizationId={organizationId} programId={programId} reportId={reportId} currency={decision.currency} />}
        </div>
      </div>
    );
  }

  // finalized
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        Final bounty: <span className="font-mono font-semibold">
          {decision.currency} {decision.finalAmountMinorUnits !== null ? minorUnitsToDecimalString(decision.finalAmountMinorUnits) : ""}
        </span>
      </p>
      {decision.finalizedAt && <p className="text-xs text-ink-muted">Finalized <LocalTime value={decision.finalizedAt} />.</p>}
      {decision.finalizationNote && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-muted">{decision.finalizationNote}</p>}
      {/* v0.1.0: this block renders for the researcher too (canFinalize only gates the
          Adjust dialog below, not this whole section) -- the researcher is the one most
          likely to read "Final bounty: $X" and wonder when it arrives. See
          docs/decisions/0063-real-payment-processing-scope.md. */}
      <p className="text-xs text-ink-muted">Unpatched sends the payout to the researcher.</p>
      {canFinalize && decision.currency && decision.finalAmountMinorUnits !== null && (
        <AdjustBountyDialog organizationId={organizationId} programId={programId} reportId={reportId} currency={decision.currency} currentAmountMinorUnits={decision.finalAmountMinorUnits} />
      )}
    </div>
  );
}
