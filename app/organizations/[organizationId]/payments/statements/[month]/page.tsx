import React from "react";
import { notFound } from "next/navigation";
import { AppShell } from "../../../../../../components/app-shell";
import { billingGate } from "../../../../../../components/documents/billing-gate";
import { DocumentAmount, DocumentSheet, DocumentTable, DocumentToolbar, DocumentTotals, money } from "../../../../../../components/documents/document-sheet";
import { getBillingProfile } from "../../../../../../services/billing";
import { getWalletStatement } from "../../../../../../services/documents";
import { listCurrentUserOrganizations } from "../../../../../../services/organizations";
import { monthRange } from "../../../../../../lib/document-periods";
import { countryName } from "../../../../../../lib/countries";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** One month of one currency's prepaid balance, summarized: opening, what came in, what went
 * out by kind, closing. The lines behind it are the wallet statement for the same dates. */
export default async function MonthlyStatementPage({ params, searchParams }: { params: Promise<{ organizationId: string; month: string }>; searchParams: Promise<{ currency?: string }> }) {
  const { organizationId, month } = await params;
  const currency = ((await searchParams).currency ?? "USD").toUpperCase();
  const base = `/organizations/${organizationId}/payments`;
  const gate = await billingGate(organizationId, `${base}/statements/${month}`, "Monthly statement");
  if (gate.denied) return gate.denied;
  const range = monthRange(month);
  if (!range || !/^[A-Z]{3}$/.test(currency)) notFound();

  const [s, profile, orgs] = await Promise.all([getWalletStatement(organizationId, currency, range.from, range.to), getBillingProfile(organizationId), listCurrentUserOrganizations(gate.user.id)]);
  const orgName = orgs.find((o) => o.id === organizationId)?.name ?? "Organization";
  const m = (v: number) => money(v, currency);
  const awardsCount = s.entries.filter((e) => e.kind === "award").length;

  return (
    <AppShell title="Monthly statement" user={gate.user} organizationId={organizationId}>
      <div className="max-w-4xl space-y-4">
        <DocumentToolbar
          back={{ href: `${base}/documents`, label: "Billing documents" }}
          csv={{ filename: `statement-${month}-${currency}.csv`, header: ["Date", "Type", "Description", "Reference", "Amount", "Balance"], rows: s.entries.map((e) => [e.occurredAt.slice(0, 10), e.kind, e.description, e.reference, e.amountMinorUnits / 100, e.balanceMinorUnits / 100]) }}
        />
        <DocumentSheet
          title="Monthly statement"
          number={`STMT/${month}/${currency}`}
          meta={[
            ["Period", MONTH.format(new Date(`${range.from}T00:00:00Z`))],
            ["From", range.from],
            ["To", range.to],
            ["Currency", currency],
          ]}
          parties={[
            { title: "Account holder", name: profile?.legalName ?? orgName, lines: [profile ? [profile.addressLine, profile.city, profile.postalCode, countryName(profile.country)].filter(Boolean).join(", ") : null, profile?.gstin ? `GSTIN ${profile.gstin}` : null] },
            { title: "Account", name: `${orgName} prepaid balance`, lines: [`Held by Unpatched in ${currency}`] },
          ]}
          footnotes={["Amounts awarded are taken from the balance when a bounty is awarded; Unpatched then pays the researcher. A cancelled award returns to the balance.", "GST on the platform fee is billed on the monthly tax invoice, not on this statement."]}
        >
          <div className="grid grid-cols-1 gap-6 rounded-lg bg-surface-hover p-5 sm:grid-cols-3">
            <DocumentAmount label="Opening balance" value={m(s.opening)} sub={range.from} />
            <DocumentAmount label="Net change" value={`${s.closing - s.opening >= 0 ? "+" : ""}${m(s.closing - s.opening)}`} sub={`${s.entries.length} movements`} />
            <DocumentAmount label="Closing balance" value={m(s.closing)} sub={range.to} />
          </div>
          <DocumentTable
            columns={[{ header: "Summary" }, { header: "Count", align: "right" }, { header: "Amount", align: "right" }]}
            rows={[
              ["Funds added", s.entries.filter((e) => e.kind === "deposit").length, m(s.totals.deposit)],
              ["Bounties awarded", awardsCount, m(s.totals.award)],
              ["Platform fees", s.entries.filter((e) => e.kind === "fee").length, m(s.totals.fee)],
              ["Awards cancelled (returned)", s.entries.filter((e) => e.kind === "release").length, m(s.totals.release)],
            ]}
            empty=""
          />
          <DocumentTotals rows={[["Opening balance", m(s.opening)], ["Money in", m(s.totals.deposit + s.totals.release)], ["Money out", m(s.totals.award + s.totals.fee)], ["Closing balance", m(s.closing)]]} />
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
