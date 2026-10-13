import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { LocalTime } from "../../../components/ui/local-time";
import { DepositReview } from "../../../components/platform/deposit-review";
import { RecordPaymentResultDialog } from "../../../components/reports/payment-status";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listManualPayoutsForAdmin, listPendingDepositsForAdmin } from "../../../services/billing";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { DEPOSIT_METHOD_LABEL } from "../../../lib/billing-labels";
import { minorUnitsToDecimalString } from "../../../lib/money";

/**
 * Unpatched's side of the money (202610140004): organizations' deposits to match against the
 * bank statement, and manual payouts to send. The recipients' payout details appear here and
 * nowhere else outside the researcher's own settings -- MFA'd platform admins only.
 */
export default async function PlatformPayoutsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/payouts" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const [deposits, payouts] = await Promise.all([listPendingDepositsForAdmin(), listManualPayoutsForAdmin()]);

  return (
    <AppShell title="Payouts" user={user}>
      <div className="max-w-5xl space-y-8">
        <section className="space-y-3">
          <SectionLabel>Deposits to confirm</SectionLabel>
          <p className="text-sm text-ink-muted">Confirm only once the money shows in Unpatched&apos;s account with this reference. Confirming makes it available to award.</p>
          {deposits.length === 0 ? (
            <EmptyState title="No deposits waiting">Deposits organizations report appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {deposits.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p>
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {d.currency} {minorUnitsToDecimalString(d.amountMinorUnits)}
                      </span>
                      <span className="ml-2 font-medium text-ink">{d.organizationName}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {DEPOSIT_METHOD_LABEL[d.method]} · <span className="font-mono">{d.payerReference}</span> · <LocalTime value={d.createdAt} />
                    </p>
                  </div>
                  <DepositReview depositId={d.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionLabel>Payouts to send</SectionLabel>
          <p className="text-sm text-ink-muted">These need a person: no payout provider handled them. Send the transfer, then record its reference.</p>
          {payouts.length === 0 ? (
            <EmptyState title="Nothing to send">Payouts waiting for a manual transfer appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {payouts.map((p) => (
                <li key={p.attemptId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="space-y-1">
                    <p>
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {p.currency} {minorUnitsToDecimalString(p.amountMinorUnits)}
                      </span>
                      <span className="ml-2 font-medium text-ink">to {p.researcherName}</span>
                      <span className="ml-2 text-xs text-ink-muted">
                        from {p.organizationName} · <LocalTime value={p.startedAt} />
                      </span>
                    </p>
                    {p.method === "bank_transfer" ? (
                      <p className="font-mono text-xs text-ink">
                        {p.bankHolder} · {p.bankAccountNumber} · {p.bankIfsc}
                      </p>
                    ) : p.method === "paypal" ? (
                      <p className="font-mono text-xs text-ink">PayPal · {p.paypalEmail}</p>
                    ) : (
                      <p className="text-xs font-medium text-danger">No payout method on file</p>
                    )}
                  </div>
                  <RecordPaymentResultDialog
                    organizationId={p.organizationId}
                    programId={p.programId}
                    reportId={p.reportId}
                    attemptId={p.attemptId}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
