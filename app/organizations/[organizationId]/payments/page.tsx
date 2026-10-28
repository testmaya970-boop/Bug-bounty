import React from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { BILLING_COUNTRIES } from "../../../../lib/countries";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import {
  EmptyState,
  PermissionDenied,
} from "../../../../components/ui/feedback";
import { SectionLabel } from "../../../../components/ui/security-primitives";
import { PaymentObligationStatusBadge } from "../../../../components/ui/badge";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import {
  CancelPaymentObligationDialog,
  InitiateManualPayoutButton,
} from "../../../../components/reports/payment-status";
import { HowPayingWorks } from "../../../../components/organizations/how-paying-works";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { listPendingBonuses } from "../../../../services/bonuses";
import { BonusItem } from "../../../../components/reports/report-bonuses";
import { DEPOSIT_METHOD_LABEL } from "../../../../lib/billing-labels";
import { canManagePayments } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listPaymentLedgerForBilling } from "../../../../services/payments";
import {
  getBillingProfile,
  getOrganizationBalances,
  listBalanceAlerts,
  listInvoices,
  listInvoiceRefsByObligation,
  listOrganizationDeposits,
  listProgramBudgets,
  type OrganizationBalance,
} from "../../../../services/billing";
import {
  BalanceAlertsForm,
  BillingProfileForm,
  ProgramBudgetsList,
} from "../../../../components/organizations/billing-settings";
import Link from "next/link";
import { getIntegrationStatuses } from "../../../../services/integrations";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { minorUnitsToDecimalString } from "../../../../lib/money";
import { LocalTime } from "../../../../components/ui/local-time";

const DEPOSIT_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-warning/15 text-warning" },
  confirmed: { label: "Confirmed", tone: "bg-success/10 text-success" },
  rejected: { label: "Rejected", tone: "bg-danger/10 text-danger" },
  failed: {
    label: "Did not complete",
    tone: "bg-surface-muted text-ink-muted",
  },
};

/** One line per currency -- never blended across currencies. */
function Figure({
  balances,
  pick,
  empty = "--",
}: {
  balances: OrganizationBalance[];
  pick: (b: OrganizationBalance) => number;
  empty?: string;
}) {
  if (balances.length === 0)
    return (
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">
        {empty}
      </p>
    );
  return (
    <div className="mt-1.5 space-y-0.5">
      {balances.map((b) => (
        <p
          key={b.currency}
          className={`text-2xl font-semibold tracking-tight tabular-nums ${pick(b) < 0 ? "text-danger" : "text-ink"}`}
        >
          {b.currency} {minorUnitsToDecimalString(pick(b))}
        </p>
      ))}
    </div>
  );
}

/** A first guess for the billing country: rupee funding means India; otherwise the region of
 * the browser's language (en-IN, en-GB...); otherwise the US. Only a form default. */
async function likelyBillingCountry(currencies: string[]): Promise<string> {
  if (currencies.includes("INR")) return "IN";
  const region = /^[a-z]{2,3}-([A-Z]{2})/.exec((await headers()).get("accept-language") ?? "")?.[1];
  return region && BILLING_COUNTRIES.some((c) => c.code === region) ? region : "US";
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
  if (!user)
    redirect(
      `/sign-in?redirectTo=/organizations/${organizationId}/payments` as Route,
    );

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManagePayments(actor.role)) {
    return (
      <AppShell title="Payments" user={user} organizationId={organizationId}>
        <PermissionDenied>
          Only an owner, security admin, or billing admin can view this
          organization&apos;s payments.
        </PermissionDenied>
      </AppShell>
    );
  }

  const [
    organizations,
    ledger,
    balances,
    deposits,
    alerts,
    budgets,
    billingProfile,
    invoices,
    invoiceRefs,
    pendingBonuses,
  ] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listPaymentLedgerForBilling(organizationId),
    getOrganizationBalances(organizationId),
    listOrganizationDeposits(organizationId),
    listBalanceAlerts(organizationId),
    listProgramBudgets(organizationId),
    getBillingProfile(organizationId),
    listInvoices(organizationId),
    listInvoiceRefsByObligation(organizationId),
    // Approvers are owners and security admins; billing admins only pay.
    actor.role === "owner" || actor.role === "security_admin" ? listPendingBonuses(organizationId) : Promise.resolve([]),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);

  // Live and sandbox providers send the money themselves; manual (or not yet set up) needs a person.
  const payoutRoutes = getIntegrationStatuses()
    .filter((s) => s.module === "payments")
    .map((s) => ({
      label: s.route,
      automated: s.mode === "live" || s.mode === "sandbox",
    }));
  const pendingDeposits = balances.filter((b) => b.pendingDeposits > 0);

  return (
    <AppShell title="Payments" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization" },
          ]}
        />
        <OrganizationHeader
          organizationName={organization?.name ?? "Organization"}
          organizationId={organizationId}
          logoVersion={await getOrganizationLogoVersion(organizationId)}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-ink-muted">
            Add funds to your balance; each bounty you award is taken from it
            and Unpatched pays the researcher. There is no fee on top: the
            platform fee comes out of the researcher&apos;s bounty.
          </p>
          <div className="flex flex-wrap gap-2">
            <HowPayingWorks routes={payoutRoutes} />
            <Link
              prefetch={false}
              href={`/organizations/${organizationId}/payments/add-funds` as Route}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-action px-3.5 text-[13px] font-medium text-on-action hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [@media(pointer:fine)]:min-h-8"
            >
              <Plus aria-hidden="true" weight="bold" className="size-4" />
              Add funds
            </Link>
          </div>
        </div>
        {pendingBonuses.length > 0 && (
          <section aria-label="Bonuses awaiting approval" className="rounded-xl border border-warning/40 bg-surface px-5 py-4">
            <SectionLabel>Bonuses awaiting approval</SectionLabel>
            <ul className="mt-1 divide-y divide-border">
              {pendingBonuses.map((b) => (
                <BonusItem key={b.id} organizationId={organizationId} bonus={b} currentUserId={user.id} canDecide showReport />
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <SectionLabel>Available to award</SectionLabel>
            <Figure
              balances={balances}
              pick={(b) => b.available}
              empty="0.00"
            />
            {pendingDeposits.length > 0 && (
              <p className="mt-1 text-xs text-ink-muted">
                +{" "}
                {pendingDeposits
                  .map(
                    (b) =>
                      `${b.currency} ${minorUnitsToDecimalString(b.pendingDeposits)}`,
                  )
                  .join(" · ")}{" "}
                waiting for confirmation
              </p>
            )}
          </div>
          <div className="p-5">
            <SectionLabel>Awarded, not yet paid</SectionLabel>
            <Figure balances={balances} pick={(b) => b.committed} />
            <p className="mt-1 text-xs text-ink-muted">
              Already taken from your balance.
            </p>
          </div>
          <div className="p-5">
            <SectionLabel>Paid out</SectionLabel>
            <Figure balances={balances} pick={(b) => b.paid} />
            <p className="mt-1 text-xs text-ink-muted">
              Bounties on completed payouts.
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <SectionLabel>Awards</SectionLabel>
          {ledger.length === 0 ? (
            <EmptyState title="No payments yet">
              A payment appears here once a finalized bounty is awarded.
            </EmptyState>
          ) : (
            <div className="relative overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <caption className="sr-only">Payment ledger</caption>
                <thead className="border-b border-border text-xs font-semibold text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Report
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Researcher
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Bounty
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Fee
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Total
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Invoice
                    </th>
                    <th
                      scope="col"
                      className="sticky right-0 bg-surface px-4 py-3 text-right shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]"
                    >
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.map((row) => {
                    const ref = {
                      organizationId,
                      programId: row.programId,
                      reportId: row.reportId,
                    };
                    return (
                      <tr key={row.obligationId}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">
                            {row.reportTitle}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {row.programName} ·{" "}
                            <LocalTime value={row.createdAt} />
                          </p>
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {row.researcherName ?? "--"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {minorUnitsToDecimalString(row.amountMinorUnits)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">
                          {minorUnitsToDecimalString(row.platformFeeMinorUnits)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          {row.currency}{" "}
                          {minorUnitsToDecimalString(
                            row.amountMinorUnits + row.platformFeeMinorUnits,
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <PaymentObligationStatusBadge
                            status={row.status}
                            pulse={row.status === "processing"}
                          />
                        </td>
                        {/* Each paid award's fee is billed on the monthly invoice that lists it. */}
                        <td className="whitespace-nowrap px-4 py-3">
                          {invoiceRefs[row.obligationId] ? (
                            <Link
                              prefetch={false}
                              href={`/organizations/${organizationId}/payments/invoices/${invoiceRefs[row.obligationId].invoiceId}` as Route}
                              className="font-mono text-xs font-semibold text-action hover:underline"
                            >
                              {invoiceRefs[row.obligationId].number}
                            </Link>
                          ) : row.status === "succeeded" ? (
                            <span className="text-xs text-ink-muted">After month end</span>
                          ) : (
                            <span className="text-xs text-ink-muted">Not paid yet</span>
                          )}
                        </td>
                        {/* Pinned right: on a phone the table scrolls and the actions stay in view. */}
                        <td className="sticky right-0 bg-surface px-4 py-3 shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]">
                          <div className="flex flex-wrap justify-end gap-2">
                            {(row.status === "pending" ||
                              row.status === "failed") && (
                              <InitiateManualPayoutButton
                                {...ref}
                                obligationId={row.obligationId}
                                currency={row.currency}
                                amountMinorUnits={row.amountMinorUnits}
                                platformFeeMinorUnits={
                                  row.platformFeeMinorUnits
                                }
                                isRetry={row.status === "failed"}
                              />
                            )}
                            {row.status === "pending" && (
                              <CancelPaymentObligationDialog
                                {...ref}
                                obligationId={row.obligationId}
                              />
                            )}
                            {row.status === "processing" && (
                              <span className="text-xs text-ink-muted">
                                Unpatched is sending this
                              </span>
                            )}
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
            <p className="text-sm text-ink-muted">
              No deposits yet. Use Add funds to send money to your balance.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {deposits.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <span className="font-mono font-semibold tabular-nums text-ink">
                    {d.currency} {minorUnitsToDecimalString(d.amountMinorUnits)}
                  </span>
                  <span className="text-ink-muted">
                    {DEPOSIT_METHOD_LABEL[d.method]}
                    {d.method !== "card" ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="font-mono text-xs">
                          {d.payerReference}
                        </span>
                      </>
                    ) : (
                      // The provider's own confirmation: method and payment reference.
                      d.status === "confirmed" && d.reviewNote && <> · {d.reviewNote}</>
                    )}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${DEPOSIT_STATUS[d.status].tone}`}
                  >
                    {DEPOSIT_STATUS[d.status].label}
                  </span>
                  {d.reviewNote && (
                    <span className="text-xs text-ink-muted">
                      {d.reviewNote}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-ink-muted">
                    <LocalTime value={d.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <SectionLabel>Low-balance alerts</SectionLabel>
            <p className="mt-1 text-sm text-ink-muted">
              Owners, security admins and billing admins are notified once when
              the amount available to award drops below this.
            </p>
          </div>
          <BalanceAlertsForm organizationId={organizationId} alerts={alerts} />
        </section>

        <section className="space-y-3">
          <div>
            <SectionLabel>Program budgets</SectionLabel>
            <p className="mt-1 text-sm text-ink-muted">
              Cap what each program can award. An award that
              would go over its program&apos;s budget is refused.
            </p>
          </div>
          <ProgramBudgetsList
            organizationId={organizationId}
            budgets={budgets}
          />
        </section>

        <section className="space-y-3">
          <div>
            <SectionLabel>Invoices</SectionLabel>
            <p className="mt-1 text-sm text-ink-muted">
              Fee invoices for awards made before 23 October 2026, when the
              platform fee was charged to your organization. Newer awards carry
              no fee for you, so they never appear here.
            </p>
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No invoices yet. The first one is issued after the month in which
              a bounty is paid.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <Link
                    href={
                      `/organizations/${organizationId}/payments/invoices/${inv.id}` as Route
                    }
                    prefetch={false}
                    className="font-mono font-semibold text-action hover:underline"
                  >
                    {inv.number}
                  </Link>
                  <span className="text-ink-muted">
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
          <div id="billing-details" className="scroll-mt-16 pt-2">
            <SectionLabel>Billing details</SectionLabel>
            <p className="mb-3 mt-1 text-sm text-ink-muted">
              Printed on your invoices. Add your GSTIN to claim input tax
              credit.
            </p>
            {!billingProfile && (
              <p className="mb-3 text-[13px] text-ink-muted">
                Filled in from your organization. Check it, add your address,
                and save.
              </p>
            )}
            <BillingProfileForm
              organizationId={organizationId}
              profile={billingProfile}
              defaults={{
                legalName: organization?.name ?? "",
                country: await likelyBillingCountry(balances.map((b) => b.currency)),
              }}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
