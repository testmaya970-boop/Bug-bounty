import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { AddFundsForm } from "../../../../../components/organizations/add-funds";
import { canManagePayments } from "../../../../../services/authorization";
import { getActorMembership } from "../../../../../services/organization-members";
import { checkoutGatewayOptions } from "../../../../../services/billing";
import { getCurrentUser } from "../../../../../lib/auth/current-user";

/** Add funds: pick Stripe, PayPal or Razorpay, enter the amount, pay on that gateway's page,
 * come back to add-funds/return. start_card_deposit re-checks the role and the gateway. */
export default async function AddFundsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/payments/add-funds` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  const allowed = Boolean(actor && actor.status === "active" && canManagePayments(actor.role));

  return (
    <AppShell title="Add funds" user={user} organizationId={organizationId}>
      <div className="max-w-3xl space-y-6">
        <Breadcrumbs items={[{ label: "Payments", href: `/organizations/${organizationId}/payments` }, { label: "Add funds" }]} />
        {allowed ? (
          <>
            <p className="text-sm text-ink-muted">Money you add here pays the bounties you award. Unpatched pays the researcher from it.</p>
            <AddFundsForm organizationId={organizationId} options={checkoutGatewayOptions()} />
          </>
        ) : (
          <PermissionDenied>Only an owner, security admin, or billing admin can add funds.</PermissionDenied>
        )}
      </div>
    </AppShell>
  );
}
