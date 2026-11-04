import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationSettingsCenter } from "../../../../components/organizations/settings/organization-settings-center";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { canManageMembers, canViewOrganizationResearchers } from "../../../../services/authorization";
import { getActorMembership, listOrganizationMembers } from "../../../../services/organization-members";
import { getOrganizationSettings, listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { listResearchersForOrganization } from "../../../../services/organization-analytics";
import { getSubscription, listPlans } from "../../../../services/managed-triage";
import { getCurrentUser } from "../../../../lib/auth/current-user";

/**
 * Organization settings: only what applies to the whole workspace. Members, integrations,
 * billing, audit, trust and branding each have their own page. Sections whose backend does
 * not exist yet say Coming soon rather than showing controls that do nothing.
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
  const canEdit = canManageMembers(actor.role);

  const [organizations, members, settings, programs, researchers, subscription, plans, logoVersion] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
    getOrganizationSettings(organizationId),
    listProgramsForOrganization(organizationId).catch(() => []),
    canViewOrganizationResearchers(actor.role) ? listResearchersForOrganization(organizationId).catch(() => null) : Promise.resolve(null),
    canEdit ? getSubscription(organizationId).catch(() => null) : Promise.resolve(null),
    canEdit ? listPlans().catch(() => []) : Promise.resolve([]),
    getOrganizationLogoVersion(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);
  const name = organization?.name ?? "Organization";
  const owner = members.find((m) => m.role === "owner" && m.status === "active");
  const live = programs.filter((p) => p.status === "active").length;
  const planName = subscription?.status === "active" ? (plans.find((pl) => pl.code === subscription.planCode)?.name ?? "Managed Triage") : null;
  const { updatedAt, updatedByName, ...initial } = settings;

  return (
    <AppShell titleIsSection title="Settings" user={user} organizationId={organizationId}>
      <div className="space-y-4">
        <Breadcrumbs items={[{ label: "Organization", href: `/organizations/${organizationId}` }, { label: "Settings" }]} />
        <OrganizationSettingsCenter
          organizationId={organizationId}
          name={name}
          slug={organization?.slug ?? ""}
          logoVersion={logoVersion}
          ownerName={owner?.displayName ?? null}
          createdAt={organization?.createdAt ?? null}
          updatedAt={updatedAt}
          updatedByName={updatedByName}
          plan={planName ? `${planName} plan` : null}
          stats={{ programs: programs.length, researchers: researchers ? researchers.length : null, activePercent: programs.length ? Math.round((live / programs.length) * 100) : null }}
          initial={initial}
          canEdit={canEdit}
        />
      </div>
    </AppShell>
  );
}
