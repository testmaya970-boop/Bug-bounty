import React from "react";
import { DocumentTable, DocumentTotals, money } from "./document-sheet";
import type { Payout } from "../../services/documents";

/** Payouts as statement lines, then gross / withheld / net per currency (never blended). */
export function PayoutLines({ payouts, empty }: { payouts: Payout[]; empty: string }) {
  const totals = new Map<string, { gross: number; withheld: number; net: number; count: number }>();
  for (const p of payouts) {
    const t = totals.get(p.currency) ?? { gross: 0, withheld: 0, net: 0, count: 0 };
    totals.set(p.currency, { gross: t.gross + p.grossMinorUnits, withheld: t.withheld + p.withheldMinorUnits, net: t.net + p.netMinorUnits, count: t.count + 1 });
  }
  return (
    <>
      <DocumentTable
        columns={[{ header: "Paid", mono: true }, { header: "Bounty" }, { header: "Gross", align: "right" }, { header: "Withheld", align: "right" }, { header: "Net", align: "right" }]}
        rows={payouts.map((p) => [
          p.paidAt.slice(0, 10),
          <span key="b">
            <span className="block font-medium">{p.reportTitle ?? "Bounty"}</span>
            <span className="text-xs text-ink-muted">{p.organizationName}</span>
          </span>,
          money(p.grossMinorUnits, p.currency),
          p.withheldMinorUnits ? money(p.withheldMinorUnits, p.currency) : "0.00",
          money(p.netMinorUnits, p.currency),
        ])}
        empty={empty}
      />
      {[...totals].map(([currency, t]) => (
        <DocumentTotals key={currency} rows={[[`Gross (${t.count} payout${t.count === 1 ? "" : "s"})`, money(t.gross, currency)], ["Tax withheld", money(t.withheld, currency)], [`Net received, ${currency}`, money(t.net, currency)]]} />
      ))}
    </>
  );
}

export const payoutCsv = (payouts: Payout[]) => ({
  header: ["Paid", "Organization", "Program", "Report", "Currency", "Gross", "Withheld", "Net", "Rule"],
  rows: payouts.map((p) => [p.paidAt.slice(0, 10), p.organizationName, p.programName, p.reportTitle, p.currency, p.grossMinorUnits / 100, p.withheldMinorUnits / 100, p.netMinorUnits / 100, p.legalBasis]),
});
