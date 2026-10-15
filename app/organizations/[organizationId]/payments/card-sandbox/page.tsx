import React from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { CardSandboxActions } from "../../../../../components/organizations/card-sandbox-actions";
import { canManagePayments } from "../../../../../services/authorization";
import { getActorMembership } from "../../../../../services/organization-members";
import { listOrganizationDeposits } from "../../../../../services/billing";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { sandboxAllowed } from "../../../../../lib/integrations/common";
import { minorUnitsToDecimalString } from "../../../../../lib/money";

/** The sandbox card provider's "hosted checkout": stands in for Razorpay / Stripe off
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
    <AppShell title="Card payment" user={user} organizationId={organizationId}>
      <div className="max-w-lg space-y-5 rounded-lg border border-dashed border-warning bg-surface p-6">
        <div>
          <SectionLabel>Sandbox card checkout</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">
            In production this is the card provider&apos;s own payment page.
            Here you decide the outcome; no card is charged.
          </p>
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums text-ink">
          {deposit.currency}{" "}
          {minorUnitsToDecimalString(deposit.amountMinorUnits)}
        </p>
        {deposit.status === "pending" ? (
          <CardSandboxActions
            organizationId={organizationId}
            reference={deposit.payerReference}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            This payment is already{" "}
            {deposit.status === "confirmed" ? "confirmed" : "closed"}.
          </p>
        )}
      </div>
    </AppShell>
  );
}
