import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../components/app-shell";
import { Alert } from "../../../../../../components/ui/feedback";
import { RefreshWhilePending } from "../../../../../../components/organizations/refresh-while-pending";
import { canManagePayments } from "../../../../../../services/authorization";
import { getActorMembership } from "../../../../../../services/organization-members";
import { listOrganizationDeposits, settleGatewayReturn } from "../../../../../../services/billing";
import { getCurrentUser } from "../../../../../../lib/auth/current-user";
import { minorUnitsToDecimalString } from "../../../../../../lib/money";

const GATEWAY_LABEL = { stripe: "Stripe", paypal: "PayPal", razorpay: "Razorpay" } as const;

/** Where a payment gateway sends the payer back to Unpatched (the return and cancel URLs given to
 * the gateway). The query string only says which deposit; its status is read from the database,
 * where only the gateway's signed webhook (or the sandbox) can confirm it. */
export default async function AddFundsReturnPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ ref?: string; cancelled?: string; token?: string; razorpay_payment_link_id?: string }> }) {
  const [{ organizationId }, { ref, cancelled, token, razorpay_payment_link_id }] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/payments` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManagePayments(actor.role) || !ref || !/^card_[0-9a-f]{32}$/.test(ref)) notFound();
  const find = async () => (await listOrganizationDeposits(organizationId)).find((d) => d.method === "card" && d.payerReference === ref);
  let deposit = await find();
  if (!deposit) notFound();
  // PayPal and Razorpay return the payer with their order / link id; asking the gateway here
  // confirms the payment at once instead of waiting for the webhook (which a local machine
  // never receives).
  if (!cancelled && (token || razorpay_payment_link_id) && (await settleGatewayReturn(deposit, { token, razorpay_payment_link_id }))) deposit = (await find()) ?? deposit;

  const gateway = deposit.gateway ? GATEWAY_LABEL[deposit.gateway] : "the payment provider";
  const amount = `${deposit.currency} ${minorUnitsToDecimalString(deposit.amountMinorUnits)}`;
  const payments = `/organizations/${organizationId}/payments`;

  return (
    <AppShell title="Payment status" user={user} organizationId={organizationId}>
      <div className="max-w-xl space-y-6">
        {deposit.status === "confirmed" && (
          <Alert tone="success" title={`${amount} added to your balance.`}>
            {gateway} confirmed the payment. You can award bounties from it now.
          </Alert>
        )}
        {(deposit.status === "failed" || deposit.status === "rejected") && (
          <Alert tone="danger" title="The payment didn't go through.">
            {deposit.reviewNote ?? `${gateway} did not complete it.`} Nothing was added to your balance.
          </Alert>
        )}
        {deposit.status === "pending" &&
          (cancelled ? (
            <Alert tone="warning" title="Payment cancelled.">
              You left {gateway}&apos;s page before paying. Nothing was charged, and nothing was added to your balance.
            </Alert>
          ) : (
            <>
              <Alert tone="info" title={`Waiting for ${gateway} to confirm ${amount}.`}>
                This usually takes under a minute. This page updates by itself; you can also leave it, the payment shows on Payments once confirmed.
              </Alert>
              <RefreshWhilePending />
            </>
          ))}
        <div className="flex flex-wrap gap-4 text-sm">
          <Link prefetch={false} href={payments as Route} className="font-medium text-action hover:text-action-hover">
            Back to Payments
          </Link>
          {deposit.status !== "confirmed" && (
            <Link prefetch={false} href={`${payments}/add-funds` as Route} className="font-medium text-action hover:text-action-hover">
              Try again
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
