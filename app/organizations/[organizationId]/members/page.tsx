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
import { ORGANIZATION_ROLES, canGrantRole, canManageMembers } from "../../../../services/authorization";
import { getActorMembership, getOrganizationAuditActivity, listOrganizationMembers, listPendingInvitations } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";

export default async function OrganizationMembersPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/members` as Route);

  const actor = await getActorMembership(user.id, organizationId);

  if (!actor || actor.status !== "active" || !canManageMembers(actor.role)) {
    return (
      <AppShell title="Members" user={user} organizationId={organizationId}>
        <PermissionDenied>
          {actor ? "Only an owner or security admin can open the organization control center." : "You do not have access to this organization."}
        </PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, members, invitations, activityPage] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
    listPendingInvitations(organizationId),
    getOrganizationAuditActivity(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);
  // First page only -- see app/reports/page.tsx's identical note on listMyReports.
  const activity = activityPage.items;

  const activeMembers = members.filter((member) => member.status === "active");
  const suspendedMembers = members.filter((member) => member.status === "suspended");
  const lastActivityByUserId: Record<string, string> = {};
  for (const event of activity) {
    if (event.actorId && !lastActivityByUserId[event.actorId]) lastActivityByUserId[event.actorId] = event.createdAt;
  }
  const actorNames = Object.fromEntries(members.map((member) => [member.userId, member.displayName]));
  const invitableRoles = ORGANIZATION_ROLES.filter((role) => canGrantRole(actor.role, role));

  return (
    // AppShell's title is the page-level landmark, not a second copy of the organization
    // name -- OrganizationHeader's own h2, right below, already shows it once.
    <AppShell title="Members" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` }, { label: "Members" }]} />

        <OrganizationHeader organizationId={organizationId} organizationName={organization?.name ?? "Organization"} active="members" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {activeMembers.length} active{suspendedMembers.length > 0 ? ` · ${suspendedMembers.length} suspended` : ""}
            {invitations.length > 0 ? ` · ${invitations.length} pending invitation${invitations.length === 1 ? "" : "s"}` : ""}
          </p>
          <InviteMemberDialog organizationId={organizationId} invitableRoles={invitableRoles} />
        </div>

        {activeMembers.length === 1 && (
          <EmptyState title="You're the only member of this organization">Invite your security team to start collaborating on programs.</EmptyState>
        )}

        <div className="rounded-lg border border-border bg-surface">
          <MemberTable organizationId={organizationId} members={members} lastActivityByUserId={lastActivityByUserId} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <PendingInvitationsPanel organizationId={organizationId} invitations={invitations} canManage={canManageMembers(actor.role)} />
          <Panel>
            <h2 className="text-base font-semibold">Recent activity</h2>
            <div className="mt-3">
              <MemberActivity events={activity} actorNames={actorNames} />
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
