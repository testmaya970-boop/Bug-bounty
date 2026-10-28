import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { CardSandboxActions } from "../../../../../components/organizations/card-sandbox-actions";
import { canManagePayments } from "../../../../../services/authorization";
import { getActorMembership } from "../../../../../services/organization-members";
import { listOrganizationDeposits } from "../../../../../services/billing";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { sandboxAllowed } from "../../../../../lib/integrations/common";
import { minorUnitsToDecimalString } from "../../../../../lib/money";

/** The sandbox card provider's "hosted checkout": stands in for Razorpay / Stripe / PayPal off
 * production so the whole card flow can be tried without a real card. Never served in production. */
export default async function CardSandboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  if (!sandboxAllowed()) notFound();
  const { organizationId } = await params;
  const { ref } = await searchParams;
  const user = await getCurrentUser();
  if (!user)
    redirect(
      `/sign-in?redirectTo=/organizations/${organizationId}/payments` as Route,
    );
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManagePayments(actor.role)) {
    return (
      <AppShell
        title="Card payment"
        user={user}
        organizationId={organizationId}
      >
        <PermissionDenied>
          Only an owner, security admin, or billing admin can add funds.
        </PermissionDenied>
      </AppShell>
    );
  }
  const deposit = (await listOrganizationDeposits(organizationId)).find(
    (d) =>
      d.method === "card" &&
      d.provider === "sandbox" &&
      d.payerReference === ref,
  );
  if (!deposit) notFound();

  return (
    <AppShell title="Checkout" user={user} organizationId={organizationId}>
      <div className="mx-auto max-w-sm space-y-5 rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">{deposit.gateway ? { stripe: "Stripe", paypal: "PayPal", razorpay: "Razorpay" }[deposit.gateway] : "Unpatched"} checkout</p>
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">Test mode</span>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Amount to pay</p>
          <p className="text-3xl font-bold tabular-nums text-ink">
            {deposit.currency} {minorUnitsToDecimalString(deposit.chargedMinorUnits ?? deposit.amountMinorUnits)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Adds {deposit.currency} {minorUnitsToDecimalString(deposit.amountMinorUnits)} to your balance</p>
        </div>
        {deposit.status === "pending" ? (
          <CardSandboxActions organizationId={organizationId} reference={deposit.payerReference} gateway={deposit.gateway ?? (deposit.currency === "USD" ? "stripe" : "razorpay")} />
        ) : (
          <p className="text-sm text-ink-muted">This payment is already {deposit.status === "confirmed" ? "complete" : "closed"}.</p>
        )}
        <p className="text-[11px] text-ink-muted">Test mode stands in for the payment provider&apos;s page. No money moves.</p>
      </div>
    </AppShell>
  );
}
