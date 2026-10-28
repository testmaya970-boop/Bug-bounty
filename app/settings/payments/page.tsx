import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { BountyTrackRecord } from "../../../components/payments/bounty-track-record";
import { AwardedBounties } from "../../../components/payments/awarded-bounties";
import { PayoutDetailsSettings } from "../../../components/settings/payout-details-settings";
import { PayoutConnections } from "../../../components/settings/payout-connections";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { listMyPayoutConnectOptions } from "../../../services/payout-connections";
import { Alert } from "../../../components/ui/feedback";
import { listMyAwardsAwaitingPayment, listMyPaymentObligations } from "../../../services/payments";
import { getMyPayoutDetails } from "../../../services/researcher-profiles";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

/** Real payment_obligations rows the researcher's own reports earned (RLS-scoped,
 * services/payments.ts). No fabricated total, no estimate. Same data and the same
 * BountyTrackRecord rendering as the top-level /bounties page (see
 * app/bounties/page.tsx) -- this settings subpage is not a second, divergent view of
 * payments, just a second entry point onto the identical real ledger.
 *
 * PayoutDetailsSettings and KycSettings are both real, fully-built components that had no
 * route rendering them anywhere in the app until now -- a researcher who earned a bounty
 * had no discoverable way to enter payout details or complete KYC. This is their natural
 * home: "how do I get paid" is exactly what this page already answers. The Alert below is
 * the same disclosure PayoutDetailsSettings' own code comment already states
 * (activePaymentProvider doesn't read this table yet) -- made visible to the researcher
 * here instead of staying a comment only a developer would ever see. */
export default async function PaymentsSettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; connect_error?: string }> }) {
  await requireResearcherSettings();
  // This page's own parent layout (app/settings/layout.tsx) already redirects an
  // unauthenticated visitor away -- Next.js layouts cannot pass their own getCurrentUser()
  // result down as a prop, so this second call is the only way this page gets the id
  // listMyPaymentObligations now requires, matching the identical pattern every other
  // settings subpage without its own prior user lookup already uses (getCurrentUser is
  // itself React.cache-memoized per request, so this costs no extra auth round trip).
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/settings/payments" as Route);

  const [obligations, awards, payoutDetails, connectOptions, { connected, connect_error: connectError }] = await Promise.all([listMyPaymentObligations(user.id), listMyAwardsAwaitingPayment(user.id), getMyPayoutDetails(), listMyPayoutConnectOptions(), searchParams]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Rewards & Payments</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every real bounty your reports have earned. The same record, with more context, lives at{" "}
          <Link prefetch={false} href={"/bounties" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Bounties
          </Link>
          .
        </p>
      </div>

      <AwardedBounties awards={awards} />
      {(obligations.length > 0 || awards.length === 0) && <BountyTrackRecord obligations={obligations} />}

      <Alert tone="info" title="Unpatched pays you, not the organization.">
        Unpatched uses the details below to send your bounties. Organizations never see them.
      </Alert>

      <section className="space-y-3">
        <SectionLabel>Connect a payout account</SectionLabel>
        {connected && <Alert tone="success" title={`${connected === "paypal" ? "PayPal" : "Stripe"} account connected.`} />}
        {connectError && <Alert tone="danger" title="The account wasn't connected.">{connectError.slice(0, 300)}</Alert>}
        <p className="text-sm text-ink-muted">Sign in on PayPal&apos;s or Stripe&apos;s own page to connect your account. Unpatched never sees your password.</p>
        <PayoutConnections options={connectOptions} />
      </section>

      <PayoutDetailsSettings initial={payoutDetails} />
      <p className="text-sm text-ink-muted">
        Your PAN, Aadhaar, passport, phone and tax form are under{" "}
        <Link prefetch={false} href={"/settings/identity" as Route} className="font-medium text-action hover:text-action-hover">
          Identity &amp; Tax
        </Link>
        .
      </p>
    </div>
  );
}
