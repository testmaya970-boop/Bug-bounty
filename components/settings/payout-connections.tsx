"use client";

import React, { useState, useTransition } from "react";
import { PaypalLogo, CreditCard } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { ActionButton } from "../researcher/journey-controls";
import { startPayoutConnectionAction, disconnectPayoutConnectionAction } from "../../actions/payout-connections";
import type { PayoutConnectOption } from "../../services/payout-connections";

const LABEL = { paypal: { name: "PayPal", icon: PaypalLogo }, stripe: { name: "Stripe", icon: CreditCard } } as const;

function ConnectButton({ provider }: { provider: "paypal" | "stripe" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await startPayoutConnectionAction(provider);
            if (!result.ok) return setError(result.message);
            // Off to the provider's consent page; it returns to /api/payout-connect/<provider>/callback.
            if (result.url) window.location.assign(result.url);
          })
        }
      >
        Connect {LABEL[provider].name}
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

/** Connect a PayPal or Stripe account through the provider's own page. The account is recorded
 * only after the provider sends the researcher back with the matching one-time state. */
export function PayoutConnections({ options }: { options: PayoutConnectOption[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const { name, icon: Icon } = LABEL[o.provider];
        const connected = o.connection?.status === "connected";
        return (
          <li key={o.provider} className="min-w-0 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <Icon aria-hidden="true" className="size-5 text-ink" />
              <span className="font-medium text-ink">{name}</span>
              {o.mode === "sandbox" && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Test mode</span>}
            </div>
            <p className="mt-1 break-all text-sm text-ink-muted">
              {connected ? `Connected: ${o.connection!.accountLabel}` : o.connection?.status === "failed" ? `Last attempt failed: ${o.connection.failureReason}` : o.available ? "Not connected." : "Not available yet."}
            </p>
            <div className="mt-3">
              {connected ? (
                <ActionButton variant="quiet" action={disconnectPayoutConnectionAction.bind(null, o.provider)} confirm={`Unpatched will stop using this ${name} account for payouts.`} confirmLabel={`Disconnect ${name}?`}>
                  Disconnect
                </ActionButton>
              ) : o.available ? (
                <ConnectButton provider={o.provider} />
              ) : (
                <p className="text-xs text-ink-muted">Use the manual details below for now.</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
