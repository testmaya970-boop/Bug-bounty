import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { EmptyState, PermissionDenied } from "../../../../components/ui/feedback";
import { SectionLabel } from "../../../../components/ui/security-primitives";
import { PaymentObligationStatusBadge } from "../../../../components/ui/badge";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { CancelPaymentObligationDialog, InitiateManualPayoutButton } from "../../../../components/reports/payment-status";
import { HowPayingWorks } from "../../../../components/organizations/how-paying-works";
import { AddFunds } from "../../../../components/organizations/add-funds";
import { DEPOSIT_METHOD_LABEL } from "../../../../lib/billing-labels";
import { canManagePayments } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listPaymentLedgerForBilling } from "../../../../services/payments";
import { fundingReference, getFundingInstructions, getOrganizationBalances, listOrganizationDeposits, type OrganizationBalance } from "../../../../services/billing";
import { getIntegrationStatuses } from "../../../../services/integrations";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { minorUnitsToDecimalString } from "../../../../lib/money";
import { LocalTime } from "../../../../components/ui/local-time";

const DEPOSIT_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-warning/15 text-warning" },
  confirmed: { label: "Confirmed", tone: "bg-success/10 text-success" },
  rejected: { label: "Rejected", tone: "bg-danger/10 text-danger" },
};

/** One line per currency -- never blended across currencies. */
function Figure({ balances, pick, empty = "--" }: { balances: OrganizationBalance[]; pick: (b: OrganizationBalance) => number; empty?: string }) {
  if (balances.length === 0) return <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-ink">{empty}</p>;
  return (
    <div className="mt-1.5 space-y-0.5">
      {balances.map((b) => (
        <p key={b.currency} className={`font-mono text-lg font-semibold tabular-nums ${pick(b) < 0 ? "text-danger" : "text-ink"}`}>
          {b.currency} {minorUnitsToDecimalString(pick(b))}
        </p>
      ))}
    </div>
  );
}

/**
 * The organization's prepaid balance and payment ledger (202610140004) -- the Billing Admin's
 * page, also open to owners and security admins. The organization adds funds; each award
 * commits bounty + fee against them; Unpatched pays the researcher. Shows each report's TITLE
 * only: billing admins never read report contents (the database enforces that too).
 */
export default async function OrganizationPaymentsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/payments` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManagePayments(actor.role)) {
    return (
      <AppShell title="Payments" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner, security admin, or billing admin can view this organization&apos;s payments.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, ledger, balances, deposits] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listPaymentLedgerForBilling(organizationId),
    getOrganizationBalances(organizationId),
    listOrganizationDeposits(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);

  // Live and sandbox providers send the money themselves; manual (or not yet set up) needs a person.
  const payoutRoutes = getIntegrationStatuses()
    .filter((s) => s.module === "payments")
    .map((s) => ({ label: s.route, automated: s.mode === "live" || s.mode === "sandbox" }));
  const pendingDeposits = balances.filter((b) => b.pendingDeposits > 0);

  return (
    <AppShell title="Payments" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />
        <OrganizationHeader organizationName={organization?.name ?? "Organization"} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-ink-muted">
            Add funds to your balance; each bounty you award is taken from it and Unpatched pays the researcher in full. The platform fee is charged on top.
          </p>
          <div className="flex flex-wrap gap-2">
            <HowPayingWorks routes={payoutRoutes} />
            <AddFunds organizationId={organizationId} instructions={getFundingInstructions()} reference={fundingReference(organizationId)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Available to award</SectionLabel>
            <Figure balances={balances} pick={(b) => b.available} empty="0.00" />
            {pendingDeposits.length > 0 && (
              <p className="mt-1 text-xs text-ink-muted">+ {pendingDeposits.map((b) => `${b.currency} ${minorUnitsToDecimalString(b.pendingDeposits)}`).join(" · ")} waiting for confirmation</p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Awarded, not yet paid</SectionLabel>
            <Figure balances={balances} pick={(b) => b.committed} />
            <p className="mt-1 text-xs text-ink-muted">Bounty + fee, already taken from your balance.</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Paid out</SectionLabel>
            <Figure balances={balances} pick={(b) => b.paid} />
            <p className="mt-1 text-xs text-ink-muted">Bounty + fee on completed payouts.</p>
          </div>
        </div>

        <section className="space-y-3">
          <SectionLabel>Awards</SectionLabel>
          {ledger.length === 0 ? (
            <EmptyState title="No payments yet">A payment appears here once a finalized bounty is awarded.</EmptyState>
          ) : (
            <div className="relative overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <caption className="sr-only">Payment ledger</caption>
                <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">Report</th>
                    <th scope="col" className="px-4 py-3">Researcher</th>
                    <th scope="col" className="px-4 py-3 text-right">Bounty</th>
                    <th scope="col" className="px-4 py-3 text-right">Fee</th>
                    <th scope="col" className="px-4 py-3 text-right">Total</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.map((row) => {
                    const ref = { organizationId, programId: row.programId, reportId: row.reportId };
                    return (
                      <tr key={row.obligationId}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{row.reportTitle}</p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {row.programName} · <LocalTime value={row.createdAt} />
                          </p>
                        </td>
                        <td className="px-4 py-3 text-ink">{row.researcherName ?? "--"}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{minorUnitsToDecimalString(row.amountMinorUnits)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">{minorUnitsToDecimalString(row.platformFeeMinorUnits)}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          {row.currency} {minorUnitsToDecimalString(row.amountMinorUnits + row.platformFeeMinorUnits)}
                        </td>
                        <td className="px-4 py-3">
                          <PaymentObligationStatusBadge status={row.status} pulse={row.status === "processing"} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {(row.status === "pending" || row.status === "failed") && (
                              <InitiateManualPayoutButton
                                {...ref}
                                obligationId={row.obligationId}
                                currency={row.currency}
                                amountMinorUnits={row.amountMinorUnits}
                                platformFeeMinorUnits={row.platformFeeMinorUnits}
                                isRetry={row.status === "failed"}
                              />
                            )}
                            {row.status === "pending" && <CancelPaymentObligationDialog {...ref} obligationId={row.obligationId} />}
                            {row.status === "processing" && <span className="text-xs text-ink-muted">Unpatched is sending this</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionLabel>Deposits</SectionLabel>
          {deposits.length === 0 ? (
            <p className="text-sm text-ink-muted">No deposits yet. Use Add funds to send money to your balance.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {deposits.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-mono font-semibold tabular-nums text-ink">
                    {d.currency} {minorUnitsToDecimalString(d.amountMinorUnits)}
                  </span>
                  <span className="text-ink-muted">
                    {DEPOSIT_METHOD_LABEL[d.method]} · <span className="font-mono text-xs">{d.payerReference}</span>
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${DEPOSIT_STATUS[d.status].tone}`}>{DEPOSIT_STATUS[d.status].label}</span>
                  {d.reviewNote && <span className="text-xs text-ink-muted">{d.reviewNote}</span>}
                  <span className="ml-auto text-xs text-ink-muted">
                    <LocalTime value={d.createdAt} />
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
