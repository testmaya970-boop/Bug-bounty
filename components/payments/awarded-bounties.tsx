import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { LocalTime } from "../ui/local-time";
import { minorUnitsToDecimalString } from "../../lib/money";
import type { MyAwardAwaitingPayment } from "../../services/payments";

/** Bounties already awarded on the researcher's reports that have no payment yet. Shown
 * above the payment history, which only lists awards once a payment exists. */
export function AwardedBounties({ awards }: { awards: MyAwardAwaitingPayment[] }) {
  if (awards.length === 0) return null;
  return (
    <section>
      <SectionLabel>Awarded, payment not started</SectionLabel>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
        {awards.map((award) => (
          <li key={award.reportId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{award.reportTitle}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {award.programName} · awarded <LocalTime value={award.finalizedAt} dateOnly />
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold tabular-nums text-ink">
                {award.currency} {minorUnitsToDecimalString(award.amountMinorUnits)}
              </span>
              <Link
                prefetch={false}
                href={`/organizations/${award.organizationId}/programs/${award.programId}/reports/${award.reportId}` as Route}
                className="text-xs font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {award.confirmed ? "View report" : "Confirm this award"}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        {awards.some((a) => !a.confirmed) ? "Confirm an award on its report so the organization can pay it." : "The organization starts the payment; it then moves to your payment history below."}
      </p>
    </section>
  );
}
