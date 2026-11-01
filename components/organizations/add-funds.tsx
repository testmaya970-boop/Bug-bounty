"use client";

import React, { useState, useTransition } from "react";
import { CreditCard, PaypalLogo, QrCode } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { startCardDepositAction } from "../../actions/billing";
import { minorUnitsToDecimalString, parseDecimalToMinorUnits } from "../../lib/money";
import { cn } from "../../lib/cn";

export type GatewayChoice = { gateway: "stripe" | "paypal" | "razorpay"; currency: "INR" | "USD"; available: boolean; mode: "sandbox" | "live" | null; surchargeBps: number };

const GATEWAYS = {
  stripe: { label: "Stripe", hint: "Card or US bank account (ACH), in USD", icon: CreditCard },
  paypal: { label: "PayPal", hint: "PayPal balance or a linked card, in USD", icon: PaypalLogo },
  razorpay: { label: "Razorpay", hint: "UPI, card or net banking, in INR", icon: QrCode },
} as const;

/**
 * Add funds: choose how to pay, enter the amount, continue to that gateway's own secure page.
 * The gateway sends you back to Unpatched (add-funds/return), and the balance is credited only
 * when the gateway's signed confirmation arrives. Card details never reach Unpatched.
 */
export function AddFundsForm({ organizationId, options }: { organizationId: string; options: GatewayChoice[] }) {
  const first = options.find((o) => o.available);
  const [gateway, setGateway] = useState<GatewayChoice["gateway"] | null>(first?.gateway ?? null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const option = options.find((o) => o.gateway === gateway);
  const amountMinor = parseDecimalToMinorUnits(amount) ?? 0;
  const fee = option ? Math.ceil((amountMinor * option.surchargeBps) / 10000) : 0;

  if (!first) {
    return <p className="text-sm text-ink-muted">Online payments aren&apos;t set up yet. Contact Unpatched support to add funds.</p>;
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!gateway) return;
        startTransition(async () => {
          setError(null);
          const result = await startCardDepositAction({ organizationId, gateway, amount });
          if (!result.ok) return setError(result.message);
          // Off to the gateway's hosted page; it sends the payer back to add-funds/return.
          window.location.assign(result.url);
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Pay with</legend>
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {options.map((o) => {
            const g = GATEWAYS[o.gateway];
            const selected = gateway === o.gateway;
            return (
              <button
                key={o.gateway}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!o.available}
                onClick={() => setGateway(o.gateway)}
                className={cn(
                  "flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  selected ? "border-ink bg-surface-hover" : "border-border hover:border-border-strong",
                  !o.available && "cursor-not-allowed opacity-60 hover:border-border",
                )}
              >
                <g.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">
                    {g.label}
                    {o.mode === "sandbox" && <span className="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Test mode</span>}
                  </span>
                  <span className="block text-xs text-ink-muted">{o.available ? g.hint : "Not connected yet"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {option && (
        <>
          <Input label={`Amount (${option.currency})`} inputMode="decimal" placeholder={option.currency === "INR" ? "50000" : "1000"} value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus className="max-w-xs" />
          {amountMinor > 0 && (
            <dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md bg-surface-hover px-3 py-2.5 text-sm">
              <dt className="text-ink-muted">Added to your balance</dt>
              <dd className="text-right font-medium tabular-nums text-ink">
                {option.currency} {minorUnitsToDecimalString(amountMinor)}
              </dd>
              {fee > 0 && (
                <>
                  <dt className="text-ink-muted">Payment processing ({(option.surchargeBps / 100).toFixed(option.surchargeBps % 100 ? 2 : 0)}%)</dt>
                  <dd className="text-right tabular-nums text-ink">
                    {option.currency} {minorUnitsToDecimalString(fee)}
                  </dd>
                </>
              )}
              <dt className="font-semibold text-ink">You pay</dt>
              <dd className="text-right font-semibold tabular-nums text-ink">
                {option.currency} {minorUnitsToDecimalString(amountMinor + fee)}
              </dd>
            </dl>
          )}
        </>
      )}

      <p className="text-xs text-ink-muted">You will finish paying on {option ? GATEWAYS[option.gateway].label : "the provider"}&apos;s secure page, then come back here. Your balance updates as soon as {option ? GATEWAYS[option.gateway].label : "the provider"} confirms the payment.</p>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending} disabled={!option || amountMinor <= 0}>
        Continue to {option ? GATEWAYS[option.gateway].label : "payment"}
      </Button>
    </form>
  );
}
