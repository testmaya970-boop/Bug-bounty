import React from "react";
import { RegistryList, SectionLabel } from "../ui/security-primitives";
import { EmptyState } from "../ui/feedback";
import { PaymentObligationStatusBadge } from "../ui/badge";
import { minorUnitsToDecimalString } from "../../lib/money";
import { formatDateTime } from "../../lib/format-date";
import type { MyPaymentObligation } from "../../services/payments";
import type { PaymentObligationStatus } from "../../types/payment";

/** Every real payment_obligations amount, grouped by currency -- summed as integers
 * (minor units), never floating point, and never blended across currencies into one
 * fabricated "total" a mixed-currency researcher would find misleading. */
function sumByCurrency(obligations: MyPaymentObligation[], statuses: PaymentObligationStatus[]): { currency: string; amountMinorUnits: number }[] {
  const totals = new Map<string, number>();
  for (const o of obligations) {
    if (!statuses.includes(o.status)) continue;
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + o.amountMinorUnits);
  }
  return [...totals.entries()].map(([currency, amountMinorUnits]) => ({ currency, amountMinorUnits }));
}

/** The researcher's bounty track record -- summary stats derived from the exact same rows
 * the list below renders (one dataset, two readings, never a separately computed/
 * driftable total), then the full ledger itself. `obligations` may be real
 * payment_obligations rows or lib/mock/bounty-track-record.ts's fixtures (see
 * app/bounties/page.tsx) -- this component renders either identically. */
export function BountyTrackRecord({ obligations }: { obligations: MyPaymentObligation[] }) {
  if (obligations.length === 0) {
    return <EmptyState title="No bounties yet">A finalized bounty on one of your accepted reports will appear here, with its full payout history.</EmptyState>;
  }

  const paidByCurrency = sumByCurrency(obligations, ["succeeded"]);
  const pendingByCurrency = sumByCurrency(obligations, ["pending", "processing"]);
  const paidCount = obligations.filter((o) => o.status === "succeeded").length;

  return (
    <div className="space-y-8">
      <div>
        <SectionLabel>Verified earnings</SectionLabel>
        <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Bounties paid</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{paidCount}</dd>
          </div>
          {paidByCurrency.map(({ currency, amountMinorUnits }) => (
            <div key={`paid-${currency}`}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Total paid ({currency})</dt>
              <dd className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-success">
                {currency} {minorUnitsToDecimalString(amountMinorUnits)}
              </dd>
            </div>
          ))}
          {pendingByCurrency.map(({ currency, amountMinorUnits }) => (
            <div key={`pending-${currency}`}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pending ({currency})</dt>
              <dd className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-ink">
                {currency} {minorUnitsToDecimalString(amountMinorUnits)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <SectionLabel>Every bounty, in order</SectionLabel>
        <RegistryList className="mt-3">
          {obligations.map((o) => (
            <li key={o.id} className="flex flex-col gap-1 p-4 transition-colors duration-150 hover:bg-surface-muted motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{o.reportTitle}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {o.organizationName} · {o.programName} · {formatDateTime(o.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-semibold text-ink">
                  {o.currency} {minorUnitsToDecimalString(o.amountMinorUnits)}
                </span>
                <PaymentObligationStatusBadge status={o.status} pulse={o.status === "processing"} />
              </div>
            </li>
          ))}
        </RegistryList>
      </div>
    </div>
  );
}
