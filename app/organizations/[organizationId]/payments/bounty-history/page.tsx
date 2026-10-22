import React from "react";
import { notFound } from "next/navigation";
import { AppShell } from "../../../../../components/app-shell";
import { billingGate } from "../../../../../components/documents/billing-gate";
import { DocumentSheet, DocumentTable, DocumentToolbar, DocumentTotals, money } from "../../../../../components/documents/document-sheet";
import { getBountyHistory } from "../../../../../services/documents";
import { listCurrentUserOrganizations } from "../../../../../services/organizations";
import { parseRange } from "../../../../../lib/document-periods";

const STATUS: Record<string, string> = { pending: "Awarded", processing: "Paying", succeeded: "Paid", failed: "Payout failed", cancelled: "Cancelled" };

/** Every bounty the organization awarded in a period: who, for what, how much, where it stands. */
export default async function BountyHistoryPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { organizationId } = await params;
  const q = await searchParams;
  const base = `/organizations/${organizationId}/payments`;
  const gate = await billingGate(organizationId, `${base}/bounty-history`, "Bounty history");
  if (gate.denied) return gate.denied;
  const range = parseRange(q.from, q.to);
  if (!range) notFound();

  const [rows, orgs] = await Promise.all([getBountyHistory(organizationId, range.from, range.to), listCurrentUserOrganizations(gate.user.id)]);
  const orgName = orgs.find((o) => o.id === organizationId)?.name ?? "Organization";
  // Totals per currency, never blended; cancelled awards are listed but not counted.
  const totals = new Map<string, { bounty: number; fee: number; count: number }>();
  for (const r of rows.filter((r) => r.status !== "cancelled")) {
    const t = totals.get(r.currency) ?? { bounty: 0, fee: 0, count: 0 };
    totals.set(r.currency, { bounty: t.bounty + r.bountyMinorUnits, fee: t.fee + r.feeMinorUnits, count: t.count + 1 });
  }

  return (
    <AppShell title="Bounty history" user={gate.user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-4">
        <DocumentToolbar
          back={{ href: `${base}/documents`, label: "Billing documents" }}
          csv={{
            filename: `bounty-history-${range.from}-${range.to}.csv`,
            header: ["Awarded", "Paid", "Status", "Program", "Report", "Researcher", "Severity", "Currency", "Bounty", "Fee", "Invoice"],
            rows: rows.map((r) => [r.awardedAt.slice(0, 10), r.paidAt?.slice(0, 10) ?? null, STATUS[r.status] ?? r.status, r.programName, r.reportTitle, r.researcherName, r.severity, r.currency, r.bountyMinorUnits / 100, r.feeMinorUnits / 100, r.invoiceNumber]),
          }}
        />
        <DocumentSheet
          title="Bounty history report"
          number={`BHR/${range.from}/${range.to}`}
          meta={[["From", range.from], ["To", range.to], ["Bounties", String(rows.length)], ["Generated", new Date().toISOString().slice(0, 10)]]}
          parties={[{ title: "Organization", name: orgName, lines: [] }]}
          footnotes={["Cancelled awards are listed for the record and excluded from the totals.", "Report titles only: report contents are never included in billing documents."]}
        >
          <DocumentTable
            columns={[{ header: "Awarded", mono: true }, { header: "Report" }, { header: "Researcher" }, { header: "Severity" }, { header: "Status" }, { header: "Bounty", align: "right" }, { header: "Fee", align: "right" }, { header: "Invoice", mono: true }]}
            rows={rows.map((r) => [
              r.awardedAt.slice(0, 10),
              <span key="r">
                <span className="block font-medium">{r.reportTitle ?? "Report"}</span>
                <span className="text-xs text-ink-muted">{r.programName}</span>
              </span>,
              r.researcherName ?? "",
              <span key="s" className="capitalize">{r.severity ?? "Not set"}</span>,
              STATUS[r.status] ?? r.status,
              money(r.bountyMinorUnits, r.currency),
              money(r.feeMinorUnits, r.currency),
              r.invoiceNumber ?? "",
            ])}
            empty="No bounties were awarded in these dates."
          />
          {[...totals].map(([currency, t]) => (
            <DocumentTotals key={currency} rows={[[`Bounties (${t.count})`, money(t.bounty, currency)], ["Platform fees", money(t.fee, currency)], [`Total ${currency}`, money(t.bounty + t.fee, currency)]]} />
          ))}
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
