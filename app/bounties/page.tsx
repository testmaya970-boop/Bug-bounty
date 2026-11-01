import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { BountyTrackRecord } from "../../components/payments/bounty-track-record";
import { AwardedBounties } from "../../components/payments/awarded-bounties";
import { listMyAwardsAwaitingPayment, listMyPaymentObligations } from "../../services/payments";
import { getCurrentUser } from "../../lib/auth/current-user";

/**
 * The top-level "Bounties" destination the sidebar's own nav item names (see
 * components/app-shell-client.tsx's MAIN_NAV) -- previously that entry pointed at
 * /settings/payments as a stopgap. This is the dedicated route: the researcher's own
 * payment_obligations rows (RLS-scoped to researcher_id = auth.uid(),
 * listMyPaymentObligations -- no new query), presented as a bounty track record
 * (summary + full ledger) rather than buried inside Settings. /settings/payments keeps
 * existing unchanged as its own "Rewards & Payments" settings subpage over the same data.
 *
 * Always the real ledger, never a fabricated fallback -- a researcher with zero real
 * bounties gets BountyTrackRecord's own honest "No bounties yet" empty state, matching
 * /settings/payments' identical, already-real rendering of the same component.
 */
export default async function BountiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/bounties" as Route);

  const [obligations, awards] = await Promise.all([listMyPaymentObligations(user.id), listMyAwardsAwaitingPayment(user.id)]);

  return (
    <AppShell title="Bounties" user={user}>
      <div className="max-w-4xl space-y-8">
        <p className="text-sm text-ink-muted">Your bounty track record: every payment your accepted reports have earned.</p>

        <AwardedBounties awards={awards} />
        {(obligations.length > 0 || awards.length === 0) && <BountyTrackRecord obligations={obligations} />}
      </div>
    </AppShell>
  );
}
