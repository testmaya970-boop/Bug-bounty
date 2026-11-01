import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { TrustCenterConsole } from "../../../../components/organizations/trust/trust-center-console";

export default async function OrganizationTrustPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/trust` as Route);

  const actor = await getActorMembership(user.id, organizationId);

  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Trust Center" user={user} organizationId={organizationId}>
        <PermissionDenied>
          You do not have access to this organization's Trust Center.
        </PermissionDenied>
      </AppShell>
    );
  }

  const organizations = await listCurrentUserOrganizations(user.id);
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Security & Trust Center" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` },
            { label: "Security & Trust Center" },
          ]}
        />

        <TrustCenterConsole
          organizationId={organizationId}
          organizationName={organization?.name ?? "Com Olho Cyber Corp"}
          userRole={actor.role}
        />
      </div>
    </AppShell>
  );
}
