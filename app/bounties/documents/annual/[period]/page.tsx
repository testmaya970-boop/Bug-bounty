import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { DocumentAmount, DocumentSheet, DocumentTable, DocumentToolbar, money } from "../../../../../components/documents/document-sheet";
import { PayoutLines, payoutCsv } from "../../../../../components/documents/payout-table";
import { getMyTaxIdentity, listMyPayouts, taxPayer } from "../../../../../services/documents";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { calendarYearRange, financialPeriodRange } from "../../../../../lib/document-periods";
import { countryName } from "../../../../../lib/countries";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** A year of earnings: "2026-27" (Indian financial year) or "2026" (calendar year), by month
 * and by organization, with tax withheld, then every payout. */
export default async function AnnualEarningsPage({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/bounties/documents/annual/${period}` as Route);
  const fy = /^\d{4}-\d{2}$/.test(period);
  const range = fy ? financialPeriodRange(period) : calendarYearRange(period);
  if (!range) notFound();
  const [payouts, identity] = await Promise.all([listMyPayouts(range.from, range.to), getMyTaxIdentity()]);
  const payer = taxPayer();
  const currencies = [...new Set(payouts.map((p) => p.currency))];

  // Month and organization breakdowns per currency.
  const group = (key: (p: (typeof payouts)[number]) => string) => {
    const out = new Map<string, { currency: string; gross: number; withheld: number; net: number; count: number }>();
    for (const p of payouts) {
      const k = `${key(p)}|${p.currency}`;
      const t = out.get(k) ?? { currency: p.currency, gross: 0, withheld: 0, net: 0, count: 0 };
      out.set(k, { currency: p.currency, gross: t.gross + p.grossMinorUnits, withheld: t.withheld + p.withheldMinorUnits, net: t.net + p.netMinorUnits, count: t.count + 1 });
    }
    return [...out];
  };
  const byMonth = group((p) => p.paidAt.slice(0, 7)).sort(([a], [b]) => a.localeCompare(b));
  const byOrg = group((p) => p.organizationName ?? "Organization").sort(([, a], [, b]) => b.gross - a.gross);
  const total = (c: string, k: "grossMinorUnits" | "withheldMinorUnits" | "netMinorUnits") => payouts.filter((p) => p.currency === c).reduce((s, p) => s + p[k], 0);
  // Bars scale within each currency; rupees and dollars are never on one axis.
  const peak = (c: string) => Math.max(1, ...byMonth.filter(([, t]) => t.currency === c).map(([, t]) => t.gross));

  return (
    <AppShell title="Annual earning report" user={user}>
      <div className="max-w-4xl space-y-4">
        <DocumentToolbar back={{ href: "/bounties/documents", label: "Tax & documents" }} csv={{ filename: `annual-earnings-${period}.csv`, ...payoutCsv(payouts) }} />
        <DocumentSheet
          title="Annual earning report"
          number={`ANNUAL/${period}/${user.id.slice(0, 6).toUpperCase()}`}
          sandbox={payer?.sandbox}
          meta={[[fy ? "Financial year" : "Year", period], ["From", range.from], ["To", range.to], ["Payouts", String(payouts.length)]]}
          parties={[{ title: "Researcher", name: identity?.displayName ?? user.displayName ?? "Researcher", lines: [identity?.email, identity?.country ? `Tax residence: ${countryName(identity.country)}` : null] }]}
          footnotes={["Amounts are per currency and never converted. Tax certificates for the same period list each deduction with its legal basis."]}
        >
          {currencies.length === 0 ? (
            <p className="text-ink-muted">No payouts in this period.</p>
          ) : (
            currencies.map((c) => (
              <div key={c} className="grid grid-cols-1 gap-6 rounded-lg bg-surface-hover p-5 sm:grid-cols-3">
                <DocumentAmount label={`Gross earnings, ${c}`} value={money(total(c, "grossMinorUnits"), c)} />
                <DocumentAmount label="Tax withheld" value={money(total(c, "withheldMinorUnits"), c)} />
                <DocumentAmount label="Net received" value={money(total(c, "netMinorUnits"), c)} />
              </div>
            ))
          )}
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-ink">By month</h3>
            <DocumentTable
              columns={[{ header: "Month" }, { header: "" }, { header: "Payouts", align: "right" }, { header: "Gross", align: "right" }, { header: "Withheld", align: "right" }]}
              rows={byMonth.map(([k, t]) => [
                MONTH.format(new Date(`${k.slice(0, 7)}-01T00:00:00Z`)),
                <span key="bar" aria-hidden="true" className="block h-1.5 min-w-1 rounded-full bg-action/70" style={{ width: `${Math.round((t.gross / peak(t.currency)) * 100)}%` }} />,
                t.count,
                money(t.gross, t.currency),
                money(t.withheld, t.currency),
              ])}
              empty="No payouts in this period."
            />
          </section>
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-ink">By organization</h3>
            <DocumentTable
              columns={[{ header: "Organization" }, { header: "Payouts", align: "right" }, { header: "Gross", align: "right" }, { header: "Net", align: "right" }]}
              rows={byOrg.map(([k, t]) => [k.split("|")[0], t.count, money(t.gross, t.currency), money(t.net, t.currency)])}
              empty="No payouts in this period."
            />
          </section>
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-ink">Every payout</h3>
            <PayoutLines payouts={[...payouts].reverse()} empty="No payouts in this period." />
          </section>
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
