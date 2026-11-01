import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { DocumentSheet, DocumentToolbar } from "../../../../components/documents/document-sheet";
import { PayoutLines, payoutCsv } from "../../../../components/documents/payout-table";
import { getMyTaxIdentity, listMyPayouts, taxPayer } from "../../../../services/documents";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { parseRange } from "../../../../lib/document-periods";
import { countryName } from "../../../../lib/countries";

/** Payouts between two dates with gross, withheld and net totals. */
export default async function EarningStatementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const q = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/bounties/documents" as Route);
  const range = parseRange(q.from, q.to);
  if (!range) notFound();
  const [payouts, identity] = await Promise.all([listMyPayouts(range.from, range.to), getMyTaxIdentity()]);
  const payer = taxPayer();

  return (
    <AppShell title="Earning statement" user={user}>
      <div className="max-w-4xl space-y-4">
        <DocumentToolbar back={{ href: "/bounties/documents", label: "Tax & documents" }} csv={{ filename: `earnings-${range.from}-${range.to}.csv`, ...payoutCsv(payouts) }} />
        <DocumentSheet
          title="Earning statement"
          number={`EARN/${range.from}/${range.to}`}
          sandbox={payer?.sandbox}
          meta={[["From", range.from], ["To", range.to], ["Payouts", String(payouts.length)]]}
          parties={[
            { title: "Researcher", name: identity?.displayName ?? user.displayName ?? "Researcher", lines: [identity?.email, identity?.country ? `Tax residence: ${countryName(identity.country)}` : null] },
            { title: "Paid by", name: payer?.name ?? "Unpatched", lines: [payer?.address] },
          ]}
          footnotes={["Each line is a completed payout; its receipt shows the rule the tax was withheld under."]}
        >
          <PayoutLines payouts={payouts} empty="No payouts in these dates." />
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
