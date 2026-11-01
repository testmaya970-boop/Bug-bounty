import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { BrandCenter } from "../../../../components/organizations/branding/brand-center";

/**
 * Enterprise Brand Center: Complete identity and branding governance workspace
 * across Public Directory, Programs, Hall of Fame, Disclosure Pages, and Emails.
 */
export default async function OrganizationBrandingPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?redirectTo=/organizations/${organizationId}/branding` as Route);
  }

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Brand Center" user={user} organizationId={organizationId}>
        <PermissionDenied>
          Only active organization administrators can manage brand identity.
        </PermissionDenied>
      </AppShell>
    );
  }

  const organizations = await listCurrentUserOrganizations(user.id);
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Brand Center" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` },
            { label: "Brand Center" },
          ]}
        />

        <Suspense
          fallback={
            <div className="rounded-xl border border-border bg-surface p-8 text-sm text-ink-muted">
              Loading brand center...
            </div>
          }
        >
          <BrandCenter
            organizationId={organizationId}
            organizationName={organization?.name ?? "Northwind Cloud"}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}
