"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import {
  requestDepositAction,
  startCardDepositAction,
} from "../../actions/billing";
import {
  minorUnitsToDecimalString,
  parseDecimalToMinorUnits,
} from "../../lib/money";
import type {
  TransferMethod as DepositMethod,
  FundingInstructions,
} from "../../services/billing";

import { DEPOSIT_METHOD_LABEL } from "../../lib/billing-labels";

/** Step 1: send money to Unpatched's account. Step 2: tell us the transfer reference so a
 * platform admin can match and confirm it. Funds become available on confirmation. */
export type CardOption = {
  currency: FundingInstructions["currency"];
  available: boolean;
  surchargeBps: number;
};

export function AddFunds({
  organizationId,
  instructions,
  reference,
  cardOptions,
}: {
  organizationId: string;
  instructions: FundingInstructions[];
  reference: string;
  cardOptions: CardOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] =
    useState<FundingInstructions["currency"]>("INR");
  const current = instructions.find((i) => i.currency === currency)!;
  const [method, setMethod] = useState<DepositMethod>(current.methods[0]);
  const [amount, setAmount] = useState("");
  const [payerReference, setPayerReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"bank" | "card">("bank");
  const card = cardOptions.find((o) => o.currency === currency);
  const anyCard = cardOptions.some((o) => o.available);
  const amountMinor = parseDecimalToMinorUnits(amount) ?? 0;
  const charged = card
    ? amountMinor + Math.ceil((amountMinor * card.surchargeBps) / 10000)
    : amountMinor;

  function close() {
    if (pending) return;
    setOpen(false);
    setAmount("");
    setPayerReference("");
    setError(null);
    setDone(false);
    setMode("bank");
  }

  function chooseCurrency(next: FundingInstructions["currency"]) {
    setCurrency(next);
    setMethod(instructions.find((i) => i.currency === next)!.methods[0]);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" weight="bold" className="size-4" />
        Add funds
      </Button>
      <Dialog open={open} title="Add funds" onClose={close}>
        {done ? (
          <div className="space-y-4 text-sm">
            <p role="status" className="text-ink">
              Thanks. We&apos;ll match your transfer and confirm it once it
              arrives. The amount shows as{" "}
              <span className="font-medium">pending</span> until then.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            <div
              role="radiogroup"
              aria-label="Currency"
              className="inline-flex rounded-md border border-border p-0.5"
            >
              {instructions.map((i) => (
                <button
                  key={i.currency}
                  type="button"
                  role="radio"
                  aria-checked={currency === i.currency}
                  onClick={() => chooseCurrency(i.currency)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold ${currency === i.currency ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"}`}
                >
                  {i.currency}
                </button>
              ))}
            </div>
            {anyCard && (
              <div
                role="radiogroup"
                aria-label="Payment method"
                className="inline-flex rounded-md border border-border p-0.5"
              >
                {(["bank", "card"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${mode === m ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"}`}
                  >
                    {m === "bank" ? "Bank transfer" : "Card"}
                  </button>
                ))}
              </div>
            )}

            {mode === "card" ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  startTransition(async () => {
                    setError(null);
                    const result = await startCardDepositAction({
                      organizationId,
                      currency,
                      amount,
                    });
                    if (!result.ok) return setError(result.message);
                    window.location.assign(result.url);
                  });
                }}
              >
                {card?.available ? (
                  <>
                    <p className="text-ink-muted">
                      Pay on the card provider&apos;s secure page; Unpatched
                      never sees your card. The amount is available to award as
                      soon as the payment goes through.
                    </p>
                    <Input
                      label={`Amount to add (${currency})`}
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      required
                    />
                    {amountMinor > 0 && (
                      <p className="text-ink-muted">
                        Your card is charged{" "}
                        <span className="font-mono font-semibold text-ink">
                          {currency} {minorUnitsToDecimalString(charged)}
                        </span>{" "}
                        (
                        {(card.surchargeBps / 100).toFixed(
                          card.surchargeBps % 100 ? 2 : 0,
                        )}
                        % card processing fee).
                      </p>
                    )}
                  </>
                ) : (
                  <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-ink">
                    Card payments in {currency} aren&apos;t available yet. Use a
                    bank transfer.
                  </p>
                )}
                {error && (
                  <p role="alert" className="font-medium text-danger">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    pending={pending}
                    disabled={!card?.available}
                  >
                    Pay by card
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <section>
                  <p className="font-semibold text-ink">
                    1. Send the money to Unpatched
                  </p>
                  <p className="mt-1 text-ink-muted">
                    By{" "}
                    {current.methods
                      .map((m) => DEPOSIT_METHOD_LABEL[m])
                      .join(", ")}
                    . Put this code in the transfer remarks so we can match it:
                  </p>
                  <p className="mt-2 inline-block rounded-md border border-border bg-surface-muted px-3 py-1.5 font-mono text-sm font-semibold tracking-wide text-ink">
                    {reference}
                  </p>
                  {current.fields.length > 0 ? (
                    <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 rounded-md border border-border p-3">
                      {current.fields.map((f) => (
                        <React.Fragment key={f.label}>
                          <dt className="text-ink-muted">{f.label}</dt>
                          <dd className="break-all font-mono text-ink">
                            {f.value}
                          </dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-ink">
                      {currency} bank details aren&apos;t set up yet. Contact
                      Unpatched support for them before sending money.
                    </p>
                  )}
                </section>

                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startTransition(async () => {
                      setError(null);
                      const result = await requestDepositAction({
                        organizationId,
                        currency,
                        amount,
                        method,
                        payerReference,
                      });
                      if (!result.ok) return setError(result.message);
                      setDone(true);
                      router.refresh();
                    });
                  }}
                >
                  <p className="font-semibold text-ink">
                    2. Tell us you sent it
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      label={`Amount (${currency})`}
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      required
                    />
                    <Select
                      label="Sent by"
                      value={method}
                      onChange={(event) =>
                        setMethod(event.target.value as DepositMethod)
                      }
                    >
                      {current.methods.map((m) => (
                        <option key={m} value={m}>
                          {DEPOSIT_METHOD_LABEL[m]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Input
                    label="Transfer reference"
                    helperText={
                      currency === "INR"
                        ? "The UTR or UPI reference number from your bank."
                        : "The wire or ACH confirmation number from your bank."
                    }
                    value={payerReference}
                    onChange={(event) => setPayerReference(event.target.value)}
                    maxLength={64}
                    required
                  />
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
                      Report transfer
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
