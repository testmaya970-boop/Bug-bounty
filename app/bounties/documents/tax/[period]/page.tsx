import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { DocumentAmount, DocumentSheet, DocumentTable, DocumentToolbar, DocumentTotals, money } from "../../../../../components/documents/document-sheet";
import { payoutCsv } from "../../../../../components/documents/payout-table";
import { getMyTaxIdentity, listMyPayouts, taxPayer } from "../../../../../services/documents";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { calendarYearRange, financialPeriodRange } from "../../../../../lib/document-periods";

const SECTION: Record<string, string> = { in_194j: "393 (formerly 194J)", in_206aa: "393, no-PAN rate (formerly 206AA)" };

/**
 * A tax certificate for one period, by jurisdiction:
 *   India  "2026-27-Q2": the TDS certificate details for the quarter (what Form 16A carries).
 *   US     "2026":       the Form 1099-NEC recipient statement for the calendar year.
 * Built only from deductions recorded at payout (payout_tax_withholdings). The statutory
 * Form 16A comes from TRACES after the quarterly return is filed; this says so on its face.
 */
export default async function TaxCertificatePage({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/bounties/documents/tax/${period}` as Route);
  const indiaRange = /-Q[1-4]$/.test(period) ? financialPeriodRange(period) : null;
  const usRange = indiaRange ? null : calendarYearRange(period);
  const range = indiaRange ?? usRange;
  if (!range) notFound();
  const [all, identity] = await Promise.all([listMyPayouts(range.from, range.to), getMyTaxIdentity()]);
  const payouts = all.filter((p) => (indiaRange ? p.regime === "in_194j" || p.regime === "in_206aa" : p.regime === "us_1099" || p.regime === "us_backup"));
  if (!payouts.length) notFound();
  const payer = taxPayer();
  const name = identity?.displayName ?? user.displayName ?? "Researcher";
  const currencies = [...new Set(payouts.map((p) => p.currency))];
  const sum = (c: string, k: "grossMinorUnits" | "withheldMinorUnits") => payouts.filter((p) => p.currency === c).reduce((s, p) => s + p[k], 0);
  const back = { href: "/bounties/documents", label: "Tax & documents" };

  if (indiaRange) {
    const fy = period.slice(0, 7);
    const quarter = period.slice(8);
    return (
      <AppShell title="TDS certificate" user={user}>
        <div className="max-w-4xl space-y-4">
          <DocumentToolbar back={back} csv={{ filename: `tds-${period}.csv`, ...payoutCsv(payouts) }} />
          <DocumentSheet
            title="Certificate of tax deducted at source"
            number={`TDS/${fy}/${quarter}/${user.id.slice(0, 6).toUpperCase()}`}
            sandbox={payer?.sandbox}
            meta={[["Financial year", fy], ["Quarter", `${quarter} (${range.from} to ${range.to})`], ["Assessment year", `${Number(fy.slice(0, 4)) + 1}-${String((Number(fy.slice(0, 4)) + 2) % 100).padStart(2, "0")}`]]}
            parties={[
              { title: "Deductor", name: payer?.name ?? "Unpatched", lines: [payer?.address, `TAN ${payer?.tan ?? "not configured"}`, `PAN ${payer?.pan ?? "not configured"}`] },
              { title: "Deductee", name, lines: [`PAN ${identity?.panMasked ?? "not provided (20% rate applied)"}`, identity?.email] },
            ]}
            footnotes={[
              "Nature of payment: fees for professional services (security research bounties), section 393 of the Income-tax Act, 2025 (section 194J of the 1961 Act for earlier years). No tax is deducted until payments in the financial year pass Rs 50,000.",
              "The statutory TDS certificate is generated on the TRACES portal after Unpatched files the quarterly TDS return. Check that these deductions appear in your Form 26AS or Annual Information Statement.",
            ]}
          >
            <div className="grid grid-cols-1 gap-6 rounded-lg bg-surface-hover p-5 sm:grid-cols-2">
              {currencies.map((c) => (
                <React.Fragment key={c}>
                  <DocumentAmount label="Amount paid or credited" value={money(sum(c, "grossMinorUnits"), c)} />
                  <DocumentAmount label="Tax deducted at source" value={money(sum(c, "withheldMinorUnits"), c)} />
                </React.Fragment>
              ))}
            </div>
            <DocumentTable
              columns={[{ header: "Date of payment", mono: true }, { header: "Section" }, { header: "Amount paid", align: "right" }, { header: "Rate", align: "right" }, { header: "TDS", align: "right" }]}
              rows={payouts.map((p) => [p.paidAt.slice(0, 10), SECTION[p.regime] ?? p.regime, money(p.grossMinorUnits, p.currency), `${p.rateBps / 100}%`, money(p.withheldMinorUnits, p.currency)])}
              empty=""
            />
            {currencies.map((c) => (
              <DocumentTotals key={c} rows={[["Total amount paid", money(sum(c, "grossMinorUnits"), c)], ["Total tax deducted", money(sum(c, "withheldMinorUnits"), c)]]} />
            ))}
          </DocumentSheet>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Form 1099-NEC statement" user={user}>
      <div className="max-w-4xl space-y-4">
        <DocumentToolbar back={back} csv={{ filename: `1099-nec-${period}.csv`, ...payoutCsv(payouts) }} />
        <DocumentSheet
          title="Form 1099-NEC recipient statement"
          number={`1099NEC/${period}/${user.id.slice(0, 6).toUpperCase()}`}
          sandbox={payer?.sandbox}
          meta={[["Tax year", period], ["Copy", "B, for recipient"]]}
          parties={[
            { title: "Payer", name: payer?.name ?? "Unpatched", lines: [payer?.address, `Payer TIN ${payer?.ein ?? "not configured"}`] },
            { title: "Recipient", name, lines: [`Recipient TIN ${identity?.tinLast4 ? `***-**-${identity.tinLast4}` : "not provided"}`, identity?.email] },
          ]}
          footnotes={[
            "Box 1 is nonemployee compensation: security research bounties paid in the year. Box 4 is federal income tax withheld (backup withholding at 24% when no W-9 TIN was on file).",
            "Unpatched files Form 1099-NEC with the IRS when your total for the year reaches the reporting threshold. Report this income on your return even if no form is filed.",
            ...(currencies.some((c) => c !== "USD") ? ["Some payouts were made in another currency; convert them to US dollars at the IRS yearly average rate for your return."] : []),
          ]}
        >
          <div className="grid grid-cols-1 gap-6 rounded-lg bg-surface-hover p-5 sm:grid-cols-2">
            {currencies.map((c) => (
              <React.Fragment key={c}>
                <DocumentAmount label="Box 1: Nonemployee compensation" value={money(sum(c, "grossMinorUnits"), c)} />
                <DocumentAmount label="Box 4: Federal income tax withheld" value={money(sum(c, "withheldMinorUnits"), c)} />
              </React.Fragment>
            ))}
          </div>
          <DocumentTable
            columns={[{ header: "Paid", mono: true }, { header: "Bounty" }, { header: "Compensation", align: "right" }, { header: "Withheld", align: "right" }]}
            rows={payouts.map((p) => [p.paidAt.slice(0, 10), p.reportTitle ?? "Bounty", money(p.grossMinorUnits, p.currency), money(p.withheldMinorUnits, p.currency)])}
            empty=""
          />
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
