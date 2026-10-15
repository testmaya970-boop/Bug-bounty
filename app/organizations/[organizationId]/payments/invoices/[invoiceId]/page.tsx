import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../../components/ui/navigation";
import { PrintButton } from "../../../../../../components/organizations/print-button";
import {
  getInvoice,
  type InvoiceParty,
} from "../../../../../../services/billing";
import { getCurrentUser } from "../../../../../../lib/auth/current-user";
import { minorUnitsToDecimalString } from "../../../../../../lib/money";

function Party({ title, party }: { title: string; party: InvoiceParty }) {
  const address =
    party.address ??
    [party.address_line, party.city, party.postal_code, party.country]
      .filter(Boolean)
      .join(", ");
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </p>
      <p className="mt-1 font-semibold text-ink">{party.name}</p>
      {address && <p className="text-ink-muted">{address}</p>}
      {party.gstin && (
        <p className="font-mono text-xs text-ink">GSTIN {party.gstin}</p>
      )}
      {party.state_code && (
        <p className="text-xs text-ink-muted">State code {party.state_code}</p>
      )}
    </div>
  );
}

/** A GST invoice for Unpatched's platform fee (202610150002). Immutable once issued: the
 * database refuses edits. Readable by the organization's finance roles and platform admins (RLS). */
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ organizationId: string; invoiceId: string }>;
}) {
  const { organizationId, invoiceId } = await params;
  const user = await getCurrentUser();
  if (!user)
    redirect(
      `/sign-in?redirectTo=/organizations/${organizationId}/payments/invoices/${invoiceId}` as Route,
    );
  const invoice = await getInvoice(invoiceId);
  if (!invoice || invoice.organizationId !== organizationId) notFound();
  const sac = invoice.seller.sac;
  const money = (minor: number) =>
    `${invoice.currency} ${minorUnitsToDecimalString(minor)}`;
  const taxRows = [
    ["CGST 9%", invoice.cgstMinorUnits],
    ["SGST 9%", invoice.sgstMinorUnits],
    ["IGST 18%", invoice.igstMinorUnits],
  ].filter(([, v]) => Number(v) > 0) as [string, number][];

  return (
    <AppShell title="Invoice" user={user} organizationId={organizationId}>
      <div className="max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Breadcrumbs
            items={[
              {
                label: "Payments",
                href: `/organizations/${organizationId}/payments`,
              },
              { label: invoice.number },
            ]}
          />
          <PrintButton />
        </div>
        <article className="print-only-this space-y-6 rounded-lg border border-border bg-surface p-6 text-sm sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-ink">Tax invoice</h1>
              <p className="mt-1 font-mono text-ink">{invoice.number}</p>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right">
              <dt className="text-ink-muted">Issued</dt>
              <dd className="font-mono text-ink">
                {invoice.issuedAt.slice(0, 10)}
              </dd>
              <dt className="text-ink-muted">Period</dt>
              <dd className="font-mono text-ink">
                {invoice.periodStart} to {invoice.periodEnd}
              </dd>
              {sac && (
                <>
                  <dt className="text-ink-muted">SAC</dt>
                  <dd className="font-mono text-ink">{sac}</dd>
                </>
              )}
            </dl>
          </header>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Party title="From" party={invoice.seller} />
            <Party title="Bill to" party={invoice.buyer} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3">
                    Platform fee on
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Paid
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    Bounty (paid on your behalf)
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Fee
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.lines.map((line, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-ink">{line.description}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-ink-muted">
                      {line.paidAt.slice(0, 10)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">
                      {minorUnitsToDecimalString(line.bountyMinorUnits)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-ink">
                      {minorUnitsToDecimalString(line.feeMinorUnits)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            <dt className="text-ink-muted">Taxable value</dt>
            <dd className="text-right font-mono tabular-nums">
              {money(invoice.subtotalMinorUnits)}
            </dd>
            {taxRows.map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-mono tabular-nums">
                  {money(value)}
                </dd>
              </React.Fragment>
            ))}
            <dt className="border-t border-border pt-1 font-semibold text-ink">
              Total
            </dt>
            <dd className="border-t border-border pt-1 text-right font-mono font-semibold tabular-nums text-ink">
              {money(invoice.totalMinorUnits)}
            </dd>
          </dl>
          <p className="text-xs text-ink-muted">{invoice.taxNote}</p>
          <p className="text-xs text-ink-muted">
            The fee was already taken from your prepaid balance when each bounty
            was awarded. Nothing is due on this invoice.
          </p>
        </article>
      </div>
    </AppShell>
  );
}
