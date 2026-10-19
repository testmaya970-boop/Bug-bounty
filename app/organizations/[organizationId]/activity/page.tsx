import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { OrganizationActivityFeed } from "../../../../components/organizations/organization-activity-feed";
import { canManageMembers } from "../../../../services/authorization";
import { getActorMembership, getOrganizationAuditActivity, listOrganizationMembers } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { perfTimed } from "../../../../lib/perf-trace";
import { ActivityDashboard } from "../../../../components/dashboards/activity-dashboard";
import { getOrganizationActivityDashboard } from "../../../../services/dashboards";
import { rangeDays } from "../../../../lib/viz";

/**
 * Hactivity (Turn 6, phase/9-ia): the org's full, chronological audit event feed --
 * item 7 of the 15-point nav map, minimal honest size per the turn spec. Reads the same
 * getOrganizationAuditActivity RLS-scoped query Home's own "Recent activity" already used
 * (owner/security_admin only, per audit_logs' own read policy -- private.has_org_role
 * narrows both by organization AND by role, so this is real cross-org and cross-role
 * denial, not a new permission model). No fabricated event types, no invented category --
 * the type filter is entity_type, already a real column on every row.
 */
export default async function OrganizationActivityPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ range?: string }> }) {
  return perfTimed("route: activity (total)", () => renderActivityPage(params, searchParams));
}

async function renderActivityPage(paramsPromise: Promise<{ organizationId: string }>, searchParamsPromise: Promise<{ range?: string }>) {
  const { organizationId } = await paramsPromise;
  const days = rangeDays((await searchParamsPromise).range ?? "30");
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/activity` as Route);

  const actor = await perfTimed("activity: getActorMembership", () => getActorMembership(user.id, organizationId));
  if (!actor || actor.status !== "active" || !canManageMembers(actor.role)) {
    return (
      <AppShell title="Activity" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an organization owner or security admin can view the activity feed.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, members, activityPage, dashboard] = await perfTimed("activity: main batch", () =>
    Promise.all([listCurrentUserOrganizations(user.id), listOrganizationMembers(organizationId), getOrganizationAuditActivity(organizationId), getOrganizationActivityDashboard(organizationId, days)]),
  );
  const organization = organizations.find((org) => org.id === organizationId);
  const actorNames = Object.fromEntries(members.map((member) => [member.userId, member.displayName]));

  return (
    <AppShell title="Activity" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} organizationId={organizationId} logoVersion={await getOrganizationLogoVersion(organizationId)} />

        <ActivityDashboard data={dashboard} days={days} organizationId={organizationId} />

        <section aria-labelledby="audit-log" className="max-w-3xl space-y-3 border-t border-border pt-6">
          <div>
            <h2 id="audit-log" className="text-lg font-semibold text-ink">
              Audit log
            </h2>
            <p className="text-sm text-ink-muted">Every action taken in this organization, most recent first.</p>
          </div>
          <OrganizationActivityFeed organizationId={organizationId} initialEvents={activityPage.items} initialNextCursor={activityPage.nextCursor} actorNames={actorNames} />
        </section>
      </div>
    </AppShell>
  );
}
