import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { DocumentSheet, DocumentTable, DocumentToolbar, DocumentTotals, money } from "../../../../../components/documents/document-sheet";
import { getMyTaxIdentity, listMyPayouts } from "../../../../../services/documents";
import { invoiceSeller } from "../../../../../services/billing";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { countryName } from "../../../../../lib/countries";

/** The GST invoice for Unpatched's platform fee on one payout (202610230001): the fee is the
 * researcher's charge for awards created from 23 Oct 2026, taken from the bounty at payout.
 * An Indian resident pays 18% IGST on it (place of supply India, state not recorded); anyone
 * else receives an export of services, zero-rated. Numbered and frozen when the payout began. */
export default async function FeeInvoicePage({ params }: { params: Promise<{ obligationId: string }> }) {
  const { obligationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/bounties/documents/fee-invoices/${obligationId}` as Route);
  const [payouts, identity] = await Promise.all([listMyPayouts(), getMyTaxIdentity()]);
  const p = payouts.find((x) => x.obligationId === obligationId);
  if (!p || !p.feeInvoiceNumber) notFound();
  const seller = invoiceSeller();
  const m = (v: number) => money(v, p.currency);
  const india = p.country === "IN";

  return (
    <AppShell title="Fee invoice" user={user}>
      <div className="max-w-3xl space-y-4">
        <DocumentToolbar back={{ href: `/bounties/documents/receipts/${obligationId}`, label: "Payout receipt" }} />
        <DocumentSheet
          title="Tax invoice"
          number={p.feeInvoiceNumber}
          sandbox={!seller || seller.name.includes("SANDBOX")}
          meta={[
            ["Date", p.paidAt.slice(0, 10)],
            ["Place of supply", india ? "India" : countryName(p.country) || "Outside India"],
            ...(seller?.sac ? ([["SAC", seller.sac]] as [string, string][]) : []),
          ]}
          parties={[
            { title: "From", name: seller?.name ?? "Unpatched", lines: [seller?.address, seller?.gstin ? `GSTIN ${seller.gstin}` : null] },
            { title: "Bill to", name: identity?.displayName ?? user.displayName ?? "Researcher", lines: [identity?.email, p.country ? `Tax residence: ${countryName(p.country)}` : null] },
          ]}
          footnotes={[
            india ? "Inter-state supply: IGST 18% on the platform fee." : "Export of services: zero-rated, supplied under LUT without payment of IGST.",
            "The fee and its tax were taken from the bounty when it was paid out. Nothing is due on this invoice.",
          ]}
        >
          <DocumentTable
            columns={[{ header: "Description" }, { header: "Taxable value", align: "right" }]}
            rows={[[`Platform fee: ${p.organizationName ?? "Organization"} / ${p.reportTitle ?? "Report"}`, m(p.feeMinorUnits)]]}
            empty=""
          />
          <DocumentTotals rows={[["Taxable value", m(p.feeMinorUnits)], ...(india ? ([["IGST 18%", m(p.feeGstMinorUnits)]] as [string, string][]) : []), ["Total", m(p.feeMinorUnits + p.feeGstMinorUnits)]]} />
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
