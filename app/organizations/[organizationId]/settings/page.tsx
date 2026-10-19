import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { MetadataPair, SectionLabel } from "../../../../components/ui/security-primitives";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { OrganizationDescriptionForm } from "../../../../components/organizations/organization-description-form";
import { OrganizationLogoForm } from "../../../../components/organizations/organization-logo-form";
import { OrgLogo } from "../../../../components/ui/org-logo";
import { getOrganizationLogoVersions } from "../../../../services/organization-logos";
import { JiraConnectionSettings } from "../../../../components/organizations/jira-connection-settings";
import { canManageIntegrations, canManageMembers } from "../../../../services/authorization";
import { getJiraConnection, jiraWebhookUrl } from "../../../../services/jira";
import { getActorMembership, listOrganizationMembers, listPendingInvitations } from "../../../../services/organization-members";
import { getOrganizationDescription, listCurrentUserOrganizations } from "../../../../services/organizations";
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
  const canIntegrate = canManageIntegrations(actor.role);

  // Member roster is readable by any org member (RLS: "members read organization roster"),
  // so active/suspended counts are safe for every role. Pending invitations and audit
  // activity are readable only by owner/security_admin (RLS: "invitations read by org
  // admins"/"audit logs read by org admins") -- fetching either as a lower-privileged
  // member would silently come back empty, which would misrepresent "0" as a real count
  // rather than "you aren't authorized to see this." So that fetch only happens at all
  // when `canManage` is true.
  const [organizations, members, programs, invitations, description, jiraConnection, logoVersions] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
    listProgramsForOrganization(organizationId),
    canManage ? listPendingInvitations(organizationId) : Promise.resolve(null),
    getOrganizationDescription(organizationId),
    // Owner/security_admin only (get_jira_connection_for_org raises FORBIDDEN otherwise),
    // so only fetched for them -- same reasoning as invitations above.
    canIntegrate ? getJiraConnection(organizationId) : Promise.resolve(null),
    getOrganizationLogoVersions([organizationId]),
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

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} organizationId={organizationId} logoVersion={await getOrganizationLogoVersion(organizationId)} />

        <div>
          <p className="text-sm text-ink-muted">
            Organization-level administration governs membership, roles, and integrations. Program-level administration, managers, researchers, reports, and scope, is configured within each program.
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
          <SectionLabel>Logo</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Shown on this organization's programs, in search and on its pages.</p>
          <div className="mt-3">
            {canManage ? (
              <OrganizationLogoForm organizationId={organizationId} name={organization?.name ?? "Organization"} version={logoVersions[organizationId]} />
            ) : (
              <OrgLogo organizationId={organizationId} name={organization?.name ?? "Organization"} version={logoVersions[organizationId]} size="lg" />
            )}
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <SectionLabel>Description</SectionLabel>
          {canManage ? (
            <div className="mt-3">
              <OrganizationDescriptionForm organizationId={organizationId} initialDescription={description ?? ""} />
            </div>
          ) : description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{description}</p>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">No description set yet.</p>
          )}
        </div>

        <div className="border-t border-border pt-6">
          <SectionLabel>Members</SectionLabel>
          {canManage ? (
            <>
              <p className="mt-2 text-sm text-ink-muted">
                {activeMembers.length} active{suspendedMembers.length > 0 ? ` · ${suspendedMembers.length} suspended` : ""}
                {invitations && invitations.length > 0 ? ` · ${invitations.length} pending invitation${invitations.length === 1 ? "" : "s"}` : ""}
              </p>
              <Link prefetch={false}
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

        {/* Billing admins work on payments, not programs (they can't read programs at all, so
            the count read 0). Other non-admins only see the programs they are on. */}
        {actor.role !== "billing_admin" && (
        <div className="border-t border-border pt-6">
          <SectionLabel>Programs</SectionLabel>
          <p className="mt-2 text-sm text-ink-muted">
            {programs.length} program{programs.length === 1 ? "" : "s"} {canManage ? "in this organization." : "you work on."}
          </p>
          <Link prefetch={false}
            href={`/organizations/${organizationId}/programs` as Route}
            className="mt-2 inline-block text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            View programs →
          </Link>
        </div>
        )}

        <div className="border-t border-border pt-6" id="integrations">
          <SectionLabel>Integrations</SectionLabel>
          <h3 className="mt-3 text-base font-semibold text-ink">Jira Cloud</h3>
          {canIntegrate ? (
            <div className="mt-3">
              <JiraConnectionSettings organizationId={organizationId} connection={jiraConnection} webhookUrl={jiraWebhookUrl(organizationId)} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Only an owner or security admin can connect or manage integrations.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
