import React from "react";
import { notFound } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { billingGate } from "../../../../../components/documents/billing-gate";
import { DocumentSheet, DocumentTable, DocumentToolbar, DocumentTotals, money } from "../../../../../components/documents/document-sheet";
import { getWalletStatement, type LedgerKind } from "../../../../../services/documents";
import { listCurrentUserOrganizations } from "../../../../../services/organizations";
import { parseRange } from "../../../../../lib/document-periods";
import { cn } from "../../../../../lib/cn";

const KIND: Record<Exclude<LedgerKind, "opening">, string> = { deposit: "Funds added", award: "Bounty", fee: "Platform fee", release: "Award cancelled" };

/** Every movement on one currency's prepaid balance for any dates (up to 400 days), with a
 * running balance -- the bank-statement view of the wallet. */
export default async function WalletStatementPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ from?: string; to?: string; currency?: string }> }) {
  const { organizationId } = await params;
  const q = await searchParams;
  const base = `/organizations/${organizationId}/payments`;
  const gate = await billingGate(organizationId, `${base}/wallet`, "Wallet statement");
  if (gate.denied) return gate.denied;
  const range = parseRange(q.from, q.to);
  const currency = (q.currency ?? "USD").toUpperCase();
  if (!range || !/^[A-Z]{3}$/.test(currency)) notFound();

  const [s, orgs] = await Promise.all([getWalletStatement(organizationId, currency, range.from, range.to), listCurrentUserOrganizations(gate.user.id)]);
  const orgName = orgs.find((o) => o.id === organizationId)?.name ?? "Organization";
  const m = (v: number) => money(v, currency);

  return (
    <AppShell title="Wallet statement" user={gate.user} organizationId={organizationId}>
      <div className="max-w-5xl space-y-4">
        <DocumentToolbar
          back={{ href: `${base}/documents`, label: "Billing documents" }}
          csv={{ filename: `wallet-${currency}-${range.from}-${range.to}.csv`, header: ["Date", "Type", "Description", "Reference", "Amount", "Balance"], rows: s.entries.map((e) => [e.occurredAt.slice(0, 19).replace("T", " "), e.kind, e.description, e.reference, e.amountMinorUnits / 100, e.balanceMinorUnits / 100]) }}
        />
        <DocumentSheet
          title="Wallet statement"
          number={`WAL/${currency}/${range.from}/${range.to}`}
          meta={[["From", range.from], ["To", range.to], ["Currency", currency], ["Movements", String(s.entries.length)]]}
          parties={[{ title: "Account", name: `${orgName} prepaid balance`, lines: [`Held by Unpatched in ${currency}`] }]}
          footnotes={["Times are UTC. Opening balance includes every movement before the first day."]}
        >
          <DocumentTable
            columns={[{ header: "Date", mono: true }, { header: "Description" }, { header: "Reference", mono: true }, { header: "Amount", align: "right" }, { header: "Balance", align: "right" }]}
            rows={[
              [range.from, <span key="o" className="font-medium">Opening balance</span>, "", "", m(s.opening)],
              ...s.entries.map((e) => [
                e.occurredAt.slice(0, 10),
                <span key="d">
                  <span className="block">{e.description}</span>
                  <span className="text-xs text-ink-muted">{KIND[e.kind as keyof typeof KIND]}</span>
                </span>,
                e.reference ?? "",
                <span key="a" className={cn(e.amountMinorUnits >= 0 ? "text-success" : "text-ink")}>{`${e.amountMinorUnits >= 0 ? "+" : ""}${m(e.amountMinorUnits)}`}</span>,
                m(e.balanceMinorUnits),
              ]),
            ]}
            empty=""
          />
          <DocumentTotals rows={[["Opening balance", m(s.opening)], ["Credits", m(s.totals.deposit + s.totals.release)], ["Debits", m(s.totals.award + s.totals.fee)], ["Closing balance", m(s.closing)]]} />
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
