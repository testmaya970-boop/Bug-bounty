import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { EmptyState, PermissionDenied } from "../../../../components/ui/feedback";
import { SectionLabel } from "../../../../components/ui/security-primitives";
import { PaymentObligationStatusBadge } from "../../../../components/ui/badge";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { CancelPaymentObligationDialog, InitiateManualPayoutButton, RecordPaymentResultDialog } from "../../../../components/reports/payment-status";
import { canManagePayments } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listPaymentAttempts, listPaymentLedgerForBilling, type BillingLedgerRow } from "../../../../services/payments";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { minorUnitsToDecimalString } from "../../../../lib/money";
import { LocalTime } from "../../../../components/ui/local-time";
import { HowPayingWorks } from "../../../../components/organizations/how-paying-works";
import { getIntegrationStatuses } from "../../../../services/integrations";

/** One figure per currency, summed as integers -- never blended across currencies. */
function totalsByCurrency(rows: BillingLedgerRow[], pick: (row: BillingLedgerRow) => number): string {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + pick(row));
  return totals.size === 0 ? "--" : [...totals].map(([currency, n]) => `${currency} ${minorUnitsToDecimalString(n)}`).join(" · ");
}

/**
 * The organization's payment ledger (202609250012) -- the Billing Admin's page, also open
 * to owners and security admins. Each bounty is paid to the researcher in full; the
 * platform fee is billed to the organization on top (202609250010). Shows each report's
 * TITLE only: billing admins never read report contents (the database enforces that too).
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

  const [organizations, ledger] = await Promise.all([listCurrentUserOrganizations(user.id), listPaymentLedgerForBilling(organizationId)]);
  const organization = organizations.find((org) => org.id === organizationId);
  // The latest attempt is only needed where a payout is mid-flight (to record its result).
  const inFlight = await Promise.all(ledger.filter((row) => row.status === "processing").map(async (row) => [row.obligationId, (await listPaymentAttempts(row.obligationId))[0] ?? null] as const));
  const latestAttempt = new Map(inFlight);

  // Live and sandbox providers send the money themselves; manual (or not yet set up) needs a person.
  const payoutRoutes = getIntegrationStatuses()
    .filter((s) => s.module === "payments")
    .map((s) => ({ label: s.route, automated: s.mode === "live" || s.mode === "sandbox" }));

  const outstanding =ledger.filter((row) => row.status === "pending" || row.status === "processing" || row.status === "failed");
  const paid = ledger.filter((row) => row.status === "succeeded");

  return (
    <AppShell title="Payments" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />
        <OrganizationHeader organizationName={organization?.name ?? "Organization"} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-ink-muted">Every bounty is paid to the researcher in full. The platform fee is billed to your organization on top of it.</p>
          <HowPayingWorks routes={payoutRoutes} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Outstanding (bounty + fee)</SectionLabel>
            <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-ink">{totalsByCurrency(outstanding, (r) => r.amountMinorUnits + r.platformFeeMinorUnits)}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Paid to researchers</SectionLabel>
            <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-ink">{totalsByCurrency(paid, (r) => r.amountMinorUnits)}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Platform fees on paid bounties</SectionLabel>
            <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-ink">{totalsByCurrency(paid, (r) => r.platformFeeMinorUnits)}</p>
          </div>
        </div>

        {ledger.length === 0 ? (
          <EmptyState title="No payments yet">A payment appears here once a finalized bounty gets a payment obligation.</EmptyState>
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
                  <th scope="col" className="px-4 py-3 text-right">Total due</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledger.map((row) => {
                  const ref = { organizationId, programId: row.programId, reportId: row.reportId };
                  const attempt = latestAttempt.get(row.obligationId) ?? null;
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
                          {row.status === "processing" && attempt && <RecordPaymentResultDialog {...ref} attempt={attempt} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
