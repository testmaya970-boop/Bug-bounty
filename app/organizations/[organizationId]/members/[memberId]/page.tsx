import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { Avatar, Breadcrumbs } from "../../../../../components/ui/navigation";
import { Alert, Card, ErrorState, Panel, PermissionDenied } from "../../../../../components/ui/feedback";
import { MemberStatusBadge, RoleBadge } from "../../../../../components/ui/badge";
import { AccessSummary } from "../../../../../components/organizations/access-summary";
import { MemberActivity } from "../../../../../components/organizations/member-activity";
import { RoleChangeDialog } from "../../../../../components/organizations/role-change-dialog";
import { ReactivateMemberDialog, RemoveMemberDialog, SuspendMemberDialog } from "../../../../../components/organizations/member-action-dialogs";
import { OrganizationHeader } from "../../../../../components/organizations/organization-header";
import { canChangeRoles, canManageMembers, isLastActiveOwner } from "../../../../../services/authorization";
import { getActorMembership, getOrganizationAuditActivity, listOrganizationMembers } from "../../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../../services/organizations";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { LocalTime } from "../../../../../components/ui/local-time";

export default async function OrganizationMemberDetailPage({ params }: { params: Promise<{ organizationId: string; memberId: string }> }) {
  const { organizationId, memberId } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/members/${memberId}` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManageMembers(actor.role)) {
    return (
      <AppShell title="Member" user={user} organizationId={organizationId}>
        <PermissionDenied>{actor ? "Only an owner or security admin can open the organization control center." : "You do not have access to this organization."}</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, members, activityPage] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
    getOrganizationAuditActivity(organizationId, undefined, 100),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);
  // First page only -- see app/reports/page.tsx's identical note on listMyReports.
  const activity = activityPage.items;
  const target = members.find((member) => member.userId === memberId);

  if (!target) {
    return (
      <AppShell title="Member" user={user} organizationId={organizationId}>
        <ErrorState title="Member not found">This member no longer exists in this organization, or the link is incorrect.</ErrorState>
      </AppShell>
    );
  }

  const actorNames = Object.fromEntries(members.map((member) => [member.userId, member.displayName]));
  const memberEvents = activity.filter((event) => event.entityId === target.userId);
  const lastRoleChange = memberEvents.find((event) => event.action === "member.role_changed");
  const targetIsLastOwner = isLastActiveOwner(members, target.userId);

  return (
    // AppShell's title is the page-level landmark, not a second copy of the member's own
    // name -- the profile card's own h2, right below, already shows it once (and matches
    // this page's own error/permission-denied branches above, which already use the
    // static "Member" title).
    <AppShell title="Member" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` },
            { label: "Members", href: `/organizations/${organizationId}/members` },
            { label: target.displayName },
          ]}
        />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} />

        <Card className="flex flex-wrap items-center gap-4 p-5">
          <Avatar name={target.displayName} />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink">{target.displayName}</h2>
            <p className="truncate text-sm text-ink-muted">{target.email ?? `@${target.username}`}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <RoleBadge role={target.role} />
            <MemberStatusBadge status={target.status} />
          </div>
        </Card>

        {targetIsLastOwner && (
          <Alert tone="warning" title="This is the organization's only active owner">
            Role changes, suspension, and removal are blocked until another owner exists, so those actions are hidden below.
          </Alert>
        )}

        {target.status === "removed" && (
          <Alert tone="info" title="This member was removed">
            {target.removedAt ? <>Removed <LocalTime value={target.removedAt} />.</> : "Removed."} Historical attribution is preserved. They can be invited again from the members page.
          </Alert>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <Panel>
              <h3 className="text-base font-semibold">Organization role</h3>
              <p className="mt-2 text-sm text-ink-muted">
                {lastRoleChange ? (
                  <>
                    Last changed by {(lastRoleChange.actorId && actorNames[lastRoleChange.actorId]) || "a member"} on <LocalTime value={lastRoleChange.createdAt} />.
                  </>
                ) : target.invitedBy ? (
                  <>
                    Assigned by {actorNames[target.invitedBy] ?? "a member"} when invited, <LocalTime value={target.joinedAt} />.
                  </>
                ) : (
                  <>
                    Set when this membership was created, <LocalTime value={target.joinedAt} />.
                  </>
                )}
              </p>
              <div className="mt-4">
                <AccessSummary role={target.role} />
              </div>
            </Panel>

            <Panel>
              <h3 className="text-base font-semibold">Security activity</h3>
              <div className="mt-3">
                <MemberActivity events={memberEvents} actorNames={actorNames} />
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel>
              <h3 className="text-base font-semibold">Actions</h3>
              <div className="mt-3 flex flex-col items-start gap-2">
                {!targetIsLastOwner && target.status !== "removed" && canChangeRoles(actor.role) && (
                  <RoleChangeDialog organizationId={organizationId} targetUserId={target.userId} targetName={target.displayName} currentRole={target.role} />
                )}
                {!targetIsLastOwner && target.status === "active" && <SuspendMemberDialog organizationId={organizationId} targetUserId={target.userId} />}
                {!targetIsLastOwner && target.status === "suspended" && <ReactivateMemberDialog organizationId={organizationId} targetUserId={target.userId} />}
                {!targetIsLastOwner && target.status !== "removed" && <RemoveMemberDialog organizationId={organizationId} targetUserId={target.userId} />}
                {targetIsLastOwner && <p className="text-sm text-ink-muted">No actions are available for the organization&apos;s only owner.</p>}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
