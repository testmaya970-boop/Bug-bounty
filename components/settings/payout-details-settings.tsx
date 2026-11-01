"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Select } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { submitMyTaxFormAction, updateMyPayoutDetailsAction } from "../../actions/researcher-profiles";
import type { PayoutDetailsSummary, PayoutMethod, PayoutSchedule, TaxFormType } from "../../types/researcher-identity";

const PAYOUT_SCHEDULE_LABEL: Record<PayoutSchedule, string> = {
  immediate: "As soon as a bounty is paid",
  weekly: "Weekly",
  monthly: "Monthly",
  on_threshold: "Only once my balance crosses a threshold",
};

const TAX_FORM_LABEL: Record<TaxFormType, string> = { w9: "W-9 (U.S. person or entity)", w8ben: "W-8BEN (non-U.S. individual)", w8ben_e: "W-8BEN-E (non-U.S. corporation)" };

/**
 * Bank/PayPal payout details -- real fields, encrypted at rest (services/payments.ts's
 * activePaymentProvider does not read this table yet; disclosed, not silently faked as an
 * active payout mechanism). Only the last 4 digits of a submitted bank account number are
 * ever shown back here -- the full number is never re-transmitted after submission. See
 * docs/decisions/0051. Threshold/schedule (docs/decisions/0075) are real, stored
 * preferences -- same disclosed limitation as the payout method itself: not yet consulted
 * by the manual payment provider, real data collection ahead of the mechanism that will
 * eventually use it.
 */
export function PayoutDetailsSettings({ initial }: { initial: PayoutDetailsSummary }) {
  const router = useRouter();
  const [method, setMethod] = useState<PayoutMethod>(initial.method ?? "bank_transfer");
  const [holderName, setHolderName] = useState(initial.bankAccountHolderName ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [routing, setRouting] = useState(initial.bankIfscOrRouting ?? "");
  const [paypalEmail, setPaypalEmail] = useState(initial.paypalEmail ?? "");
  const [threshold, setThreshold] = useState(initial.payoutThresholdMinorUnits !== null ? String(initial.payoutThresholdMinorUnits / 100) : "");
  const [schedule, setSchedule] = useState<PayoutSchedule>(initial.payoutSchedule);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const thresholdMinorUnits = threshold.trim() ? Math.round(Number.parseFloat(threshold) * 100) : undefined;
      const result = await updateMyPayoutDetailsAction({
        method,
        bankAccountHolderName: method === "bank_transfer" ? holderName : undefined,
        bankAccountNumber: method === "bank_transfer" ? accountNumber || undefined : undefined,
        bankIfscOrRouting: method === "bank_transfer" ? routing : undefined,
        paypalEmail: method === "paypal" ? paypalEmail : undefined,
        payoutThresholdMinorUnits: thresholdMinorUnits,
        payoutSchedule: schedule,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAccountNumber("");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form className="space-y-4 border-t border-border pt-6" onSubmit={handleSubmit}>
      <div>
        <SectionLabel>Payout details</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">Enter your bank or PayPal details for bounty payouts.</p>
      </div>

      <Select label="Payout method" value={method} onChange={(event) => setMethod(event.target.value as PayoutMethod)}>
        <option value="bank_transfer">Bank transfer</option>
        <option value="paypal">PayPal</option>
      </Select>

      {method === "bank_transfer" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Account holder name" value={holderName} onChange={(event) => setHolderName(event.target.value)} maxLength={160} />
          <Input
            label="Account number"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            maxLength={20}
            helperText={initial.bankAccountLast4 ? `On file: ···· ${initial.bankAccountLast4}. Enter a new number to replace it.` : undefined}
          />
          <Input label="IFSC / routing code" value={routing} onChange={(event) => setRouting(event.target.value)} maxLength={34} className="sm:col-span-2" />
        </div>
      ) : (
        <Input label="PayPal email" type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} maxLength={320} />
      )}

      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <Input
          label="Payout threshold (optional)"
          type="number"
          min="0.01"
          step="0.01"
          value={threshold}
          onChange={(event) => setThreshold(event.target.value)}
          helperText="Hold payouts until your balance crosses this amount."
        />
        <Select label="Payout schedule" value={schedule} onChange={(event) => setSchedule(event.target.value as PayoutSchedule)}>
          {(Object.keys(PAYOUT_SCHEDULE_LABEL) as PayoutSchedule[]).map((value) => (
            <option key={value} value={value}>
              {PAYOUT_SCHEDULE_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="Payout details updated." />}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** A tax identifier is its own small form, deliberately separate from the general payout
 * form above -- same "each sensitive field is its own submission" convention KYC already
 * established (components/settings/kyc-settings.tsx). Encrypted at rest; only the last 4
 * characters are ever shown back. No automated tax-form verification exists -- a platform
 * admin reviews manually, same disclosed limitation as KYC itself. */
export function TaxFormSettings({ initial }: { initial: PayoutDetailsSummary }) {
  const router = useRouter();
  const [taxFormType, setTaxFormType] = useState<TaxFormType>(initial.taxFormType ?? "w9");
  const [taxId, setTaxId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitMyTaxFormAction({ taxFormType, taxId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTaxId("");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form className="space-y-4 border-t border-border pt-6" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionLabel>Tax form</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Required before a bounty payout can be released.</p>
        </div>
        {initial.taxFormStatus !== "not_submitted" && (
          <span className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-xs font-semibold text-ink-muted">{initial.taxFormStatus}</span>
        )}
      </div>

      <Select label="Form type" value={taxFormType} onChange={(event) => setTaxFormType(event.target.value as TaxFormType)}>
        {(Object.keys(TAX_FORM_LABEL) as TaxFormType[]).map((value) => (
          <option key={value} value={value}>
            {TAX_FORM_LABEL[value]}
          </option>
        ))}
      </Select>
      <Input
        label="Tax identifier"
        value={taxId}
        onChange={(event) => setTaxId(event.target.value)}
        maxLength={40}
        helperText={initial.taxIdLast4 ? `On file: ···· ${initial.taxIdLast4}. Enter a new value to replace it.` : "e.g. SSN, EIN, or your country's equivalent."}
      />

      {initial.taxFormReviewNote && initial.taxFormStatus === "rejected" && <p className="text-xs text-danger">{initial.taxFormReviewNote}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="Tax form submitted for review." />}
      <div className="flex justify-end">
        <Button type="submit" pending={pending} disabled={!taxId}>
          Submit
        </Button>
      </div>
    </form>
  );
}
