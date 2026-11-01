import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { canManagePayments } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { BillingFinanceCenter } from "../../../../components/organizations/finance/billing-finance-center";

/**
 * Enterprise Billing & Finance Center: Complete financial operations workspace
 * for subscriptions, reward budgets, researcher payments, invoices, taxes, and financial analytics.
 */
export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?redirectTo=/organizations/${organizationId}/payments` as Route);
  }

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManagePayments(actor.role)) {
    return (
      <AppShell title="Billing & Finance" user={user} organizationId={organizationId}>
        <PermissionDenied>
          Only an owner, security admin, or billing administrator can view financial operations.
        </PermissionDenied>
      </AppShell>
    );
  }

  const organizations = await listCurrentUserOrganizations(user.id);
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Billing & Finance" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` },
            { label: "Billing & Finance" },
          ]}
        />

        <Suspense
          fallback={
            <div className="rounded-xl border border-border bg-surface p-8 text-sm text-ink-muted">
              Loading billing & finance center...
            </div>
          }
        >
          <BillingFinanceCenter
            organizationId={organizationId}
            organizationName={organization?.name ?? "Northwind Cloud Technologies"}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}
