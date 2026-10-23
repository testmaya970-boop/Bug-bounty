import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Certificate, ChartBar, IdentificationBadge, Receipt, Scroll } from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "../../../components/app-shell";
import { TaxResidenceForm } from "../../../components/documents/document-forms";
import { Button } from "../../../components/ui/button";
import { getMyTaxIdentity, listMyPayouts, type Payout } from "../../../services/documents";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { BILLING_COUNTRIES, countryName } from "../../../lib/countries";
import { financialQuarterOf, financialYearOf } from "../../../lib/document-periods";
import { minorUnitsToDecimalString } from "../../../lib/money";

function Section({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span aria-hidden="true" className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink-muted">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <p className="text-[13px] text-ink-muted">{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Row({ href, primary, secondary, amount }: { href: string; primary: string; secondary: string; amount?: string }) {
  return (
    <li>
      <Link prefetch={false} href={href as Route} className="group flex items-center gap-4 px-5 py-3 text-[13px] transition-colors hover:bg-surface-hover">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{primary}</span>
          <span className="block truncate text-xs text-ink-muted">{secondary}</span>
        </span>
        {amount && <span className="shrink-0 font-medium tabular-nums text-ink">{amount}</span>}
        <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}

/** The periods that have a certificate: Indian deductions by financial-year quarter (the TDS
 * certificate cadence), US payouts by calendar year (the 1099-NEC cadence). */
function certificatePeriods(payouts: Payout[]) {
  const india = new Set<string>(), us = new Set<string>();
  for (const p of payouts) {
    const day = p.paidAt.slice(0, 10);
    if (p.regime === "in_194j" || p.regime === "in_206aa") india.add(`${financialYearOf(day)}-${financialQuarterOf(day)}`);
    if (p.regime === "us_1099" || p.regime === "us_backup") us.add(day.slice(0, 4));
  }
  return [...[...india].sort().reverse().map((p) => ({ period: p, label: `TDS certificate, FY ${p.slice(0, 7)} ${p.slice(8)}`, secondary: "India, TDS certificate details" })), ...[...us].sort().reverse().map((y) => ({ period: y, label: `Form 1099-NEC statement, ${y}`, secondary: "United States, nonemployee compensation" }))];
}

const REGIME_NOTE: Record<string, string> = {
  in_194j: "10% TDS under section 393 (formerly 194J) once your payments this year pass Rs 50,000. PAN on file",
  in_206aa: "20% TDS under section 393 at the no-PAN rate (formerly 206AA) once your payments this year pass Rs 50,000. Add your PAN in Settings to lower it to 10%",
  us_1099: "No withholding; reported on Form 1099-NEC (W-9 on file)",
  us_backup: "24% backup withholding: submit a W-9 with your TIN in Settings to stop it",
  none: "Nothing withheld for your tax residence",
};

/** Every earnings document a researcher needs: receipts, statements, tax certificates, annual reports. */
export default async function EarningsDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/bounties/documents" as Route);
  const [identity, payouts] = await Promise.all([getMyTaxIdentity(), listMyPayouts()]);
  const india = identity?.country === "IN";
  const years = [...new Set(payouts.map((p) => (india ? financialYearOf(p.paidAt.slice(0, 10)) : p.paidAt.slice(0, 4))))].sort().reverse();
  const certificates = certificatePeriods(payouts);
  const today = new Date().toISOString().slice(0, 10);
  const field = "h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-ink";

  return (
    <AppShell title="Tax & documents" user={user}>
      <div className="max-w-5xl space-y-5">
        <Section icon={IdentificationBadge} title="Tax profile" description="Decides what is withheld from each payout and which certificate you get.">
          <div className="grid grid-cols-1 gap-6 px-5 py-4 md:grid-cols-[1fr_1fr]">
            <TaxResidenceForm current={identity?.country ?? null} countries={BILLING_COUNTRIES} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-ink-muted">Residence</dt>
              <dd className="text-ink">{identity?.country ? countryName(identity.country) : "Not set"}</dd>
              {india && (
                <>
                  <dt className="text-ink-muted">PAN</dt>
                  <dd className="font-mono text-xs text-ink">{identity?.panMasked ? `${identity.panMasked} (${identity.panStatus?.replace("_", " ")})` : "Not on file"}</dd>
                </>
              )}
              {identity?.country === "US" && (
                <>
                  <dt className="text-ink-muted">Tax form</dt>
                  <dd className="text-ink">{identity.taxFormType ? `${identity.taxFormType.toUpperCase().replace("_", "-")}${identity.tinLast4 ? `, TIN ending ${identity.tinLast4}` : ""}` : "None on file"}</dd>
                </>
              )}
              <dt className="text-ink-muted">Next payout</dt>
              <dd className="text-ink">{REGIME_NOTE[identity?.nextRegime ?? "none"]}</dd>
            </dl>
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Section icon={Receipt} title="Payout receipts" description="One receipt for every completed payout: gross, tax withheld, net.">
            {payouts.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-ink-muted">No completed payouts yet. A receipt appears here the moment one lands.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {payouts.map((p) => (
                  <Row key={p.obligationId} href={`/bounties/documents/receipts/${p.obligationId}`} primary={p.reportTitle ?? "Bounty"} secondary={`${p.organizationName ?? ""} · ${p.paidAt.slice(0, 10)}`} amount={`${p.currency} ${minorUnitsToDecimalString(p.netMinorUnits)}`} />
                ))}
              </ul>
            )}
          </Section>

          <div className="space-y-5">
            <Section icon={Scroll} title="Earning statement" description="Payouts in any dates, with totals per currency.">
              <form action="/bounties/documents/earnings" className="flex flex-wrap items-end gap-2 px-5 py-4 text-[13px]">
                <label className="grid gap-1 text-xs text-ink-muted">From<input type="date" name="from" required className={field} /></label>
                <label className="grid gap-1 text-xs text-ink-muted">To<input type="date" name="to" defaultValue={today} required className={field} /></label>
                <Button type="submit" variant="secondary">Open statement</Button>
              </form>
            </Section>

            <Section icon={Certificate} title="Tax certificates" description="India: TDS certificate per quarter. United States: Form 1099-NEC statement per year.">
              {certificates.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-ink-muted">{identity?.country === "IN" || identity?.country === "US" ? "A certificate appears after your first payout under this tax residence." : "Set your tax residence to India or the United States to receive certificates. Other countries have nothing withheld."}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {certificates.map((c) => (
                    <Row key={c.period} href={`/bounties/documents/tax/${c.period}`} primary={c.label} secondary={c.secondary} />
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={ChartBar} title="Annual earning reports" description={india ? "By Indian financial year (April to March)." : "By calendar year."}>
              {years.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-ink-muted">Your first annual report appears after your first payout.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {years.map((y) => (
                    <Row key={y} href={`/bounties/documents/annual/${y}`} primary={india ? `FY ${y}` : y} secondary="Earnings by month, program and tax" />
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
