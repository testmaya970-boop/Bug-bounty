import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { MetadataPair, SectionLabel } from "../../../../components/ui/security-primitives";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { canManageMembers } from "../../../../services/authorization";
import { getActorMembership, listOrganizationMembers, listPendingInvitations } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { getCurrentUser } from "../../../../lib/auth/current-user";

/**
 * The final page in the organization workspace hierarchy (Overview / Programs / Members
 * / Settings) -- reachable by any active member, the same gate the Overview page already
 * uses, since everything shown here is either read-only identity or a link into a page
 * that re-checks its own authorization. No rename/delete organization RPC exists in this
 * backend (confirmed by reading every migration under supabase/migrations) -- so there is
 * no "Edit" control and no Danger Zone here. Adding either would be a fake control with
 * no real operation behind it, which this task's own instructions explicitly forbid.
 */
export default async function OrganizationSettingsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/settings` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Settings" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const canManage = canManageMembers(actor.role);

  // Member roster is readable by any org member (RLS: "members read organization roster"),
  // so active/suspended counts are safe for every role. Pending invitations and audit
  // activity are readable only by owner/security_admin (RLS: "invitations read by org
  // admins"/"audit logs read by org admins") -- fetching either as a lower-privileged
  // member would silently come back empty, which would misrepresent "0" as a real count
  // rather than "you aren't authorized to see this." So that fetch only happens at all
  // when `canManage` is true.
  const [organizations, members, programs, invitations] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
    listProgramsForOrganization(organizationId),
    canManage ? listPendingInvitations(organizationId) : Promise.resolve(null),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);

  const activeMembers = members.filter((member) => member.status === "active");
  const suspendedMembers = members.filter((member) => member.status === "suspended");

  return (
    // AppShell's title is the page-level landmark, not a second copy of the organization
    // name -- OrganizationHeader's own h2, right below, already shows it once.
    <AppShell title="Settings" user={user} organizationId={organizationId}>
      <div className="max-w-2xl space-y-8">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` }, { label: "Settings" }]} />

        <OrganizationHeader organizationId={organizationId} organizationName={organization?.name ?? "Organization"} active="settings" />

        <div>
          <p className="text-sm text-ink-muted">
            Organization-level administration governs membership and roles. Program-level administration, managers, researchers, reports, and scope, is configured within each program.
          </p>
        </div>

        <div className="border-t border-border pt-6">
          <SectionLabel>General</SectionLabel>
          <div className="mt-3">
            <MetadataPair label="Organization name" value={organization?.name ?? "Organization"} />
            <p className="mt-2 text-xs text-ink-muted">Organization name changes aren&apos;t available yet.</p>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <SectionLabel>Members</SectionLabel>
          {canManage ? (
            <>
              <p className="mt-2 text-sm text-ink-muted">
                {activeMembers.length} active{suspendedMembers.length > 0 ? ` · ${suspendedMembers.length} suspended` : ""}
                {invitations && invitations.length > 0 ? ` · ${invitations.length} pending invitation${invitations.length === 1 ? "" : "s"}` : ""}
              </p>
              <Link
                href={`/organizations/${organizationId}/members` as Route}
                className="mt-2 inline-block text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Manage members →
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">{activeMembers.length} active members. Only an owner or security admin can manage organization membership.</p>
          )}
        </div>

        <div className="border-t border-border pt-6">
          <SectionLabel>Programs</SectionLabel>
          <p className="mt-2 text-sm text-ink-muted">
            {programs.length} program{programs.length === 1 ? "" : "s"} in this organization.
          </p>
          <Link
            href={`/organizations/${organizationId}/programs` as Route}
            className="mt-2 inline-block text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            View programs →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
