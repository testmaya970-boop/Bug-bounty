"use client";

import React, { useState, useTransition } from "react";
import { Plus } from "@phosphor-icons/react";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { startCardDepositAction } from "../../actions/billing";
import { minorUnitsToDecimalString, parseDecimalToMinorUnits } from "../../lib/money";

export type CardOption = { currency: "INR" | "USD"; available: boolean; surchargeBps: number };

/**
 * Add funds (Oct 23): choose the amount, press Add funds, pay on the payment provider's secure
 * page (Razorpay for rupees: UPI, cards, net banking; Stripe for dollars: cards, ACH). The
 * method is picked there, and the balance is credited only when the provider confirms the
 * payment, with the provider's own payment reference. Nothing to type about bank transfers.
 */
export function AddFunds({ organizationId, cardOptions }: { organizationId: string; cardOptions: CardOption[] }) {
  const options = cardOptions.filter((o) => o.available);
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<CardOption["currency"]>(options[0]?.currency ?? "INR");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const option = options.find((o) => o.currency === currency);
  const amountMinor = parseDecimalToMinorUnits(amount) ?? 0;
  const fee = option ? Math.ceil((amountMinor * option.surchargeBps) / 10000) : 0;

  function close() {
    if (pending) return;
    setOpen(false);
    setAmount("");
    setError(null);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" weight="bold" className="size-4" />
        Add funds
      </Button>
      <Dialog open={open} title="Add funds" onClose={close}>
        {options.length === 0 ? (
          <p className="text-sm text-ink-muted">Online payments aren&apos;t set up yet. Contact Unpatched support to add funds.</p>
        ) : (
          <form
            className="space-y-4 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                setError(null);
                const result = await startCardDepositAction({ organizationId, currency, amount });
                if (!result.ok) return setError(result.message);
                window.location.assign(result.url);
              });
            }}
          >
            {options.length > 1 && (
              <div role="radiogroup" aria-label="Currency" className="inline-flex rounded-md border border-border p-0.5">
                {options.map((o) => (
                  <button
                    key={o.currency}
                    type="button"
                    role="radio"
                    aria-checked={currency === o.currency}
                    onClick={() => setCurrency(o.currency)}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${currency === o.currency ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"}`}
                  >
                    {o.currency}
                  </button>
                ))}
              </div>
            )}
            <Input label={`Amount (${currency})`} inputMode="decimal" placeholder="50000" value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus />
            {amountMinor > 0 && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md bg-surface-hover px-3 py-2.5">
                <dt className="text-ink-muted">Added to your balance</dt>
                <dd className="text-right font-medium tabular-nums text-ink">
                  {currency} {minorUnitsToDecimalString(amountMinor)}
                </dd>
                {fee > 0 && (
                  <>
                    <dt className="text-ink-muted">Payment processing ({(option!.surchargeBps / 100).toFixed(option!.surchargeBps % 100 ? 2 : 0)}%)</dt>
                    <dd className="text-right tabular-nums text-ink">
                      {currency} {minorUnitsToDecimalString(fee)}
                    </dd>
                  </>
                )}
                <dt className="font-semibold text-ink">You pay</dt>
                <dd className="text-right font-semibold tabular-nums text-ink">
                  {currency} {minorUnitsToDecimalString(amountMinor + fee)}
                </dd>
              </dl>
            )}
            <p className="text-xs text-ink-muted">{currency === "INR" ? "Pay by UPI, card or net banking" : "Pay by card or ACH"} on the next page. Your balance updates as soon as the payment goes through.</p>
            {error && (
              <p role="alert" className="font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" pending={pending}>
                Add funds
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
