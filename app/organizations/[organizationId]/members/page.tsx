import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { EmptyState, Panel, PermissionDenied } from "../../../../components/ui/feedback";
import { InviteMemberDialog } from "../../../../components/organizations/invite-member-dialog";
import { MemberTable } from "../../../../components/organizations/member-table";
import { PendingInvitationsPanel } from "../../../../components/organizations/pending-invitations-panel";
import { MemberActivity } from "../../../../components/organizations/member-activity";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { ORGANIZATION_ROLES, canGrantRole, canManageMembers } from "../../../../services/authorization";
import { getActorMembership, getOrganizationAuditActivity, listOrganizationMembers, listPendingInvitations } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";

import { IAMConsole } from "../../../../components/organizations/iam/iam-console";

export default async function OrganizationMembersPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/members` as Route);

  const actor = await getActorMembership(user.id, organizationId);

  if (!actor || actor.status !== "active" || !canManageMembers(actor.role)) {
    return (
      <AppShell title="Identity & Access" user={user} organizationId={organizationId}>
        <PermissionDenied>
          {actor ? "Only an owner or security admin can open the organization control center." : "You do not have access to this organization."}
        </PermissionDenied>
      </AppShell>
    );
  }

  const [organizations] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Team & Access (IAM)" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` },
            { label: "Identity & Access Management" },
          ]}
        />

        <IAMConsole
          organizationId={organizationId}
          organizationName={organization?.name ?? "Com Olho Cyber Corp"}
          userRole={actor.role}
        />
      </div>
    </AppShell>
  );
}
