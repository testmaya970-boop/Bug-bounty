"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Bank, CreditCard, QrCode } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { completeSandboxCardAction } from "../../actions/billing";
import { cn } from "../../lib/cn";

type Method = "UPI" | "Card" | "Net banking" | "ACH";
const METHODS: Record<"INR" | "USD", { key: Method; icon: React.ElementType; hint: string }[]> = {
  INR: [
    { key: "UPI", icon: QrCode, hint: "Any UPI app" },
    { key: "Card", icon: CreditCard, hint: "Visa, Mastercard, RuPay" },
    { key: "Net banking", icon: Bank, hint: "All major banks" },
  ],
  USD: [
    { key: "Card", icon: CreditCard, hint: "Visa, Mastercard, Amex" },
    { key: "ACH", icon: Bank, hint: "US bank account" },
  ],
};

/** The test-mode checkout: pick a method and pay, or cancel -- what the provider's own page does. */
export function CardSandboxActions({ organizationId, reference, currency }: { organizationId: string; reference: string; currency: "INR" | "USD" }) {
  const router = useRouter();
  const methods = METHODS[currency];
  const [method, setMethod] = useState<Method>(methods[0].key);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function finish(outcome: "confirmed" | "failed") {
    startTransition(async () => {
      setError(null);
      const result = await completeSandboxCardAction({ organizationId, reference, outcome, method });
      if (!result.ok) return setError(result.message);
      router.push(`/organizations/${organizationId}/payments?card=${outcome === "confirmed" ? "done" : "cancelled"}` as Route);
    });
  }
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Payment method" className="grid gap-2">
        {methods.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={method === m.key}
            onClick={() => setMethod(m.key)}
            className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left", method === m.key ? "border-ink bg-surface-hover" : "border-border hover:border-border-strong")}
          >
            <m.icon aria-hidden="true" className="size-5 text-ink" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-ink">{m.key}</span>
              <span className="block text-xs text-ink-muted">{m.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <Button type="button" pending={pending} onClick={() => finish("confirmed")} className="w-full">
        Pay
      </Button>
      <button type="button" disabled={pending} onClick={() => finish("failed")} className="w-full text-center text-sm text-ink-muted hover:text-ink">
        Cancel payment
      </button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
