import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { DocumentAmount, DocumentSheet, DocumentTable, DocumentToolbar, DocumentTotals, money } from "../../../../../components/documents/document-sheet";
import { getMyTaxIdentity, listMyPayouts, taxPayer } from "../../../../../services/documents";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { countryName } from "../../../../../lib/countries";

/** One completed payout: what the bounty was, what was withheld and why, what landed. */
export default async function PayoutReceiptPage({ params }: { params: Promise<{ obligationId: string }> }) {
  const { obligationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/bounties/documents/receipts/${obligationId}` as Route);
  const [payouts, identity] = await Promise.all([listMyPayouts(), getMyTaxIdentity()]);
  const p = payouts.find((x) => x.obligationId === obligationId);
  if (!p) notFound();
  const payer = taxPayer();
  const m = (v: number) => money(v, p.currency);

  return (
    <AppShell title="Payout receipt" user={user}>
      <div className="max-w-3xl space-y-4">
        <DocumentToolbar back={{ href: "/bounties/documents", label: "Tax & documents" }} />
        <DocumentSheet
          title="Payout receipt"
          number={`RCPT-${p.obligationId.slice(0, 8).toUpperCase()}`}
          sandbox={payer?.sandbox}
          meta={[
            ["Paid", p.paidAt.slice(0, 10)],
            ["Method", p.provider === "manual" ? "Bank transfer" : p.provider],
            ["Reference", p.providerReference ?? "Recorded by Unpatched"],
          ]}
          parties={[
            { title: "Paid by", name: payer?.name ?? "Unpatched", lines: [payer?.address, payer?.tan ? `TAN ${payer.tan}` : null, payer?.ein ? `EIN ${payer.ein}` : null] },
            { title: "Paid to", name: identity?.displayName ?? user.displayName ?? "Researcher", lines: [identity?.email, identity?.country ? `Tax residence: ${countryName(identity.country)}` : null, identity?.panMasked ? `PAN ${identity.panMasked}` : null] },
          ]}
          footnotes={[p.legalBasis, "Bounty paid on behalf of the organization named above, from its prepaid balance held by Unpatched."]}
        >
          <DocumentAmount label="Amount received" value={m(p.netMinorUnits)} sub={p.withheldMinorUnits > 0 ? `after ${m(p.withheldMinorUnits)} tax withheld` : "nothing withheld"} />
          <DocumentTable
            columns={[{ header: "Description" }, { header: "Amount", align: "right" }]}
            rows={[
              [
                <span key="d">
                  <span className="block font-medium">Bounty: {p.reportTitle ?? "Report"}</span>
                  <span className="text-xs text-ink-muted">
                    {p.organizationName} · {p.programName}
                  </span>
                </span>,
                m(p.grossMinorUnits),
              ],
            ]}
            empty=""
          />
          <DocumentTotals rows={[["Gross bounty", m(p.grossMinorUnits)], [`Tax withheld (${(p.rateBps / 100).toFixed(p.rateBps % 100 ? 2 : 0)}%)`, `-${m(p.withheldMinorUnits)}`], ["Net paid", m(p.netMinorUnits)]]} />
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
