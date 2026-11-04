import React from "react";
import Link from "next/link";
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
import { PageSummary, type SummaryBadge } from "../../../../components/ui/page-summary";
import { RolePermissionMatrix } from "../../../../components/organizations/role-permission-matrix";
import { getSsoConnection } from "../../../../services/sso";

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

  const [organizations, members, invitations, activityPage, sso] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
    listPendingInvitations(organizationId),
    getOrganizationAuditActivity(organizationId),
    getSsoConnection(organizationId).catch(() => null),
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
  // Read once per request on the server.
  const now = Date.now();
  const expiredInvitations = invitations.filter((inv) => new Date(inv.expiresAt).getTime() < now).length;
  const adminCount = activeMembers.filter((member) => member.role === "owner" || member.role === "security_admin").length;
  const ssoBadges: SummaryBadge[] = !sso
    ? [{ label: "SSO not set up", tone: "neutral" }]
    : [
        { label: sso.status === "active" ? "SSO active" : "SSO draft", tone: sso.status === "active" ? "success" : "warning" },
        ...(sso.enforced ? [{ label: "SSO enforced", tone: "info" as const }] : []),
        ...(sso.scimTokenLast4 ? [{ label: "SCIM provisioning", tone: "info" as const }] : []),
      ];

  return (
    // AppShell's title is the page-level landmark, not a second copy of the organization
    // name -- OrganizationHeader's own h2, right below, already shows it once.
    <AppShell titleIsSection title="Members" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` }, { label: "Members" }]} />

        <OrganizationHeader title="Members" organizationName={organization?.name ?? "Organization"} organizationId={organizationId} logoVersion={await getOrganizationLogoVersion(organizationId)} />

        <PageSummary
          description="Who can work in this organization, with which role. Invitations, suspensions and role changes are recorded in the audit log."
          badges={ssoBadges}
          actions={<InviteMemberDialog organizationId={organizationId} invitableRoles={invitableRoles} />}
          metrics={[
            { label: "Active members", value: String(activeMembers.length), detail: `${members.length} in total` },
            { label: "Administrators", value: String(adminCount), detail: "Owners and security admins" },
            { label: "Suspended", value: String(suspendedMembers.length), detail: suspendedMembers.length > 0 ? "No access until restored" : "None", tone: suspendedMembers.length > 0 ? "warning" : "neutral" },
            { label: "Pending invitations", value: String(invitations.length), detail: invitations.length === 0 ? "None" : expiredInvitations > 0 ? `${expiredInvitations} expired, resend or revoke` : "Not accepted yet", tone: invitations.length > 0 ? "warning" : "neutral" },
          ]}
        />

        {activeMembers.length === 1 && (
          <EmptyState title="You're the only member of this organization">Invite your security team to start collaborating on programs.</EmptyState>
        )}

        <div className="rounded-lg border border-border bg-surface">
          <MemberTable organizationId={organizationId} members={members} lastActivityByUserId={lastActivityByUserId} />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <PendingInvitationsPanel organizationId={organizationId} invitations={invitations} canManage={canManageMembers(actor.role)} />
          <Panel>
            <h2 className="text-base font-semibold">Recent activity</h2>
            <div className="mt-3">
              <MemberActivity events={activity.slice(0, 8)} actorNames={actorNames} />
            </div>
            {activity.length > 8 && (
              <Link prefetch={false} href={`/organizations/${organizationId}/activity` as Route} className="mt-3 inline-block text-sm font-medium text-action hover:underline">
                View the full audit log
              </Link>
            )}
          </Panel>
        </div>

        <RolePermissionMatrix />
      </div>
    </AppShell>
  );
}
