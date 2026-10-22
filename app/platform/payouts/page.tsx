import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { LocalTime } from "../../../components/ui/local-time";
import { DepositReview } from "../../../components/platform/deposit-review";
import {
  CancelPaymentObligationDialog,
  RecordPaymentResultDialog,
} from "../../../components/reports/payment-status";
import { isPlatformAdmin } from "../../../services/platform-operations";
import {
  invoiceSeller,
  listDisputedObligationsForAdmin,
  listInvoices,
  listManualPayoutsForAdmin,
  listPendingDepositsForAdmin,
} from "../../../services/billing";
import { IssueInvoices } from "../../../components/platform/issue-invoices";
import Link from "next/link";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { listCollusionSignalsForAdmin } from "../../../services/trust-signals";
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

  const [deposits, payouts, disputed, invoices, collusion] = await Promise.all([
    listPendingDepositsForAdmin(),
    listManualPayoutsForAdmin(),
    listDisputedObligationsForAdmin(),
    listInvoices(null, 20),
    listCollusionSignalsForAdmin(),
  ]);
  const now = new Date();
  const lastMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  )
    .toISOString()
    .slice(0, 7);
  const seller = invoiceSeller();

  return (
    <AppShell title="Payouts" user={user}>
      <div className="max-w-5xl space-y-8">
        <section className="space-y-3">
          <SectionLabel>Deposits to confirm</SectionLabel>
          <p className="text-sm text-ink-muted">
            Confirm only once the money shows in Unpatched&apos;s account with
            this reference. Confirming makes it available to award.
          </p>
          {deposits.length === 0 ? (
            <EmptyState title="No deposits waiting">
              Deposits organizations report appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {deposits.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <p>
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {d.currency}{" "}
                        {minorUnitsToDecimalString(d.amountMinorUnits)}
                      </span>
                      <span className="ml-2 font-medium text-ink">
                        {d.organizationName}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {DEPOSIT_METHOD_LABEL[d.method]} ·{" "}
                      <span className="font-mono">{d.payerReference}</span> ·{" "}
                      <LocalTime value={d.createdAt} />
                    </p>
                  </div>
                  <DepositReview depositId={d.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {collusion.length > 0 && (
          <section className="space-y-3" aria-labelledby="collusion-heading">
            <h2 id="collusion-heading" className="text-xs font-semibold uppercase tracking-wide text-warning">Possible collusion</h2>
            <p className="text-sm text-ink-muted">
              These researchers signed in from the same network as a member of an organization that awarded them. Shared offices, VPNs and universities are common innocent causes. Check before you send their payouts.
            </p>
            <ul className="divide-y divide-border rounded-lg border border-warning/40 bg-surface">
              {collusion.map((c) => (
                <li key={`${c.researcherId}-${c.organizationId}`} className="px-4 py-3 text-sm">
                  <p className="break-words font-medium text-ink">
                    {c.researcherName} <span className="font-normal text-ink-muted">and</span> {c.organizationName}
                  </p>
                  <p className="mt-0.5 break-all text-xs text-ink-muted">
                    {c.researcherEmail ?? "no email"} · {c.sharedNetworks} shared network{c.sharedNetworks === 1 ? "" : "s"}, last <LocalTime value={c.lastShared} /> · {c.awards} award{c.awards === 1 ? "" : "s"} totalling{" "}
                    <span className="font-mono tabular-nums">{c.currency} {minorUnitsToDecimalString(c.awardedMinorUnits)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <SectionLabel>Payouts to send</SectionLabel>
          <p className="text-sm text-ink-muted">
            These need a person: no payout provider handled them. Send the
            transfer, then record its reference.
          </p>
          {payouts.length === 0 ? (
            <EmptyState title="Nothing to send">
              Payouts waiting for a manual transfer appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {payouts.map((p) => (
                <li
                  key={p.attemptId}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="space-y-1">
                    <p>
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {p.currency}{" "}
                        {minorUnitsToDecimalString(p.amountMinorUnits)}
                      </span>
                      <span className="ml-2 font-medium text-ink">
                        to {p.researcherName}
                      </span>
                      <span className="ml-2 text-xs text-ink-muted">
                        from {p.organizationName} ·{" "}
                        <LocalTime value={p.startedAt} />
                      </span>
                    </p>
                    {p.method === "bank_transfer" ? (
                      <p className="font-mono text-xs text-ink">
                        {p.bankHolder} · {p.bankAccountNumber} · {p.bankIfsc}
                      </p>
                    ) : p.method === "paypal" ? (
                      <p className="font-mono text-xs text-ink">
                        PayPal · {p.paypalEmail}
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-danger">
                        No payout method on file
                      </p>
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

        <section className="space-y-3">
          <SectionLabel>Awards in dispute</SectionLabel>
          <p className="text-sm text-ink-muted">
            Unpaid awards on reports with an open or escalated dispute. Once a
            researcher accepts an award only Unpatched can cancel it; cancelling
            returns the money to the organization&apos;s balance.
          </p>
          {disputed.length === 0 ? (
            <EmptyState title="No disputed awards">
              Awards on reports under dispute appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {disputed.map((d) => (
                <li
                  key={d.obligationId}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="space-y-1">
                    <p>
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {d.currency}{" "}
                        {minorUnitsToDecimalString(d.amountMinorUnits)}
                      </span>
                      <span className="ml-2 font-medium text-ink">
                        to {d.researcherName}
                      </span>
                      <span className="ml-2 text-xs text-ink-muted">
                        from {d.organizationName}
                      </span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {d.reportTitle} · dispute {d.mediationStatus}
                    </p>
                  </div>
                  <CancelPaymentObligationDialog
                    organizationId={d.organizationId}
                    programId={d.programId}
                    reportId={d.reportId}
                    obligationId={d.obligationId}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionLabel>Fee invoices</SectionLabel>
          <p className="text-sm text-ink-muted">
            One GST invoice per organization and currency for the platform fee
            on bounties paid in a month.
            {seller ? (
              <>
                {" "}
                Issued as{" "}
                <span className="font-medium text-ink">{seller.name}</span>.
              </>
            ) : (
              " Set the INVOICE_SELLER_* settings before issuing."
            )}
          </p>
          <IssueInvoices defaultMonth={lastMonth} />
          {invoices.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <Link
                    href={
                      `/organizations/${inv.organizationId}/payments/invoices/${inv.id}` as Route
                    }
                    prefetch={false}
                    className="font-mono font-semibold text-action hover:underline"
                  >
                    {inv.number}
                  </Link>
                  <span className="text-ink">{inv.organizationName}</span>
                  <span className="text-xs text-ink-muted">
                    {inv.periodStart} to {inv.periodEnd}
                  </span>
                  <span className="ml-auto font-mono font-semibold tabular-nums text-ink">
                    {inv.currency}{" "}
                    {minorUnitsToDecimalString(inv.totalMinorUnits)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
