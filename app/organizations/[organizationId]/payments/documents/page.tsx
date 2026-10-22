import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, FileText, Receipt, Scroll, Wallet, ListChecks } from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "../../../../../components/app-shell";
import { billingGate } from "../../../../../components/documents/billing-gate";
import { getOrganizationBalances, listInvoices } from "../../../../../services/billing";
import { listInvoiceNotes } from "../../../../../services/documents";
import { minorUnitsToDecimalString } from "../../../../../lib/money";
import { recentMonths } from "../../../../../lib/document-periods";
import { Button } from "../../../../../components/ui/button";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

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

/** Every billing document an organization's finance team needs, in one place. */
export default async function BillingDocumentsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const base = `/organizations/${organizationId}/payments`;
  const gate = await billingGate(organizationId, `${base}/documents`, "Billing documents");
  if (gate.denied) return gate.denied;

  const [invoices, notes, balances] = await Promise.all([listInvoices(organizationId), listInvoiceNotes(organizationId), getOrganizationBalances(organizationId)]);
  const currencies = balances.length ? balances.map((b) => b.currency) : ["USD"];
  const today = new Date().toISOString().slice(0, 10);
  const field = "h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-ink";

  return (
    <AppShell title="Billing documents" user={gate.user} organizationId={organizationId}>
      <div className="max-w-5xl space-y-5">
        <p className="max-w-2xl text-[13px] text-ink-muted">
          Tax invoices and notes are issued by Unpatched and never change once issued. Statements and reports are built from your balance ledger when you open them. Every document prints or saves as a PDF.
        </p>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Section icon={Receipt} title="GST tax invoices" description="Monthly invoices for the platform fee on completed payouts.">
            {invoices.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-ink-muted">No invoices yet. One is issued after the month a payout completes.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invoices.slice(0, 8).map((i) => (
                  <Row key={i.id} href={`${base}/invoices/${i.id}`} primary={i.number} secondary={`${i.periodStart} to ${i.periodEnd}`} amount={`${i.currency} ${minorUnitsToDecimalString(i.totalMinorUnits)}`} />
                ))}
              </ul>
            )}
          </Section>

          <Section icon={FileText} title="Credit and debit notes" description="Corrections to an issued invoice: a refund or waiver, or an extra charge.">
            {notes.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-ink-muted">No notes. Unpatched issues one only when an invoice needs correcting.</p>
            ) : (
              <ul className="divide-y divide-border">
                {notes.map((n) => (
                  <Row
                    key={n.id}
                    href={`${base}/notes/${n.id}`}
                    primary={`${n.kind === "credit" ? "Credit" : "Debit"} note ${n.number}`}
                    secondary={`Against ${n.invoiceNumber} · ${n.issuedAt.slice(0, 10)}`}
                    amount={`${n.kind === "credit" ? "-" : ""}${n.currency} ${minorUnitsToDecimalString(n.totalMinorUnits)}`}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section icon={Scroll} title="Monthly statements" description="Opening balance, funds added, bounties and fees, closing balance.">
            <ul className="divide-y divide-border">
              {recentMonths(6).flatMap((m) =>
                currencies.map((c) => <Row key={`${m}-${c}`} href={`${base}/statements/${m}?currency=${c}`} primary={MONTH.format(new Date(`${m}-01T00:00:00Z`))} secondary={`${c} balance`} />),
              )}
            </ul>
          </Section>

          <div className="space-y-5">
            <Section icon={Wallet} title="Wallet statement" description="Every movement on your balance, with a running balance, for any dates.">
              <form action={`${base}/wallet`} className="flex flex-wrap items-end gap-2 px-5 py-4 text-[13px]">
                <label className="grid gap-1 text-xs text-ink-muted">From<input type="date" name="from" required className={field} /></label>
                <label className="grid gap-1 text-xs text-ink-muted">To<input type="date" name="to" defaultValue={today} required className={field} /></label>
                <label className="grid gap-1 text-xs text-ink-muted">Currency
                  <select name="currency" className={field}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
                </label>
                <Button type="submit" variant="secondary">Open statement</Button>
              </form>
            </Section>
            <Section icon={ListChecks} title="Bounty history report" description="Every bounty you awarded, its status, fee and invoice. Exports to CSV.">
              <form action={`${base}/bounty-history`} className="flex flex-wrap items-end gap-2 px-5 py-4 text-[13px]">
                <label className="grid gap-1 text-xs text-ink-muted">From<input type="date" name="from" required className={field} /></label>
                <label className="grid gap-1 text-xs text-ink-muted">To<input type="date" name="to" defaultValue={today} required className={field} /></label>
                <Button type="submit" variant="secondary">Open report</Button>
              </form>
            </Section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
