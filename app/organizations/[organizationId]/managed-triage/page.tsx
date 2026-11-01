import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { ManagedTriageCenter } from "../../../../components/organizations/managed-triage-center";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../services/organization-members";
import {
  getPerformance,
  getSubscription,
  listOrganizationEscalations,
  listPlans,
  listServiceCharges,
} from "../../../../services/managed-triage";

/** Managed Triage: enterprise Managed Security Operations Center (SOC). */
export default async function ManagedTriagePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user)
    redirect(
      `/sign-in?redirectTo=/organizations/${organizationId}/managed-triage` as Route,
    );
  const actor = await getActorMembership(user.id, organizationId);
  if (
    !actor ||
    actor.status !== "active" ||
    (actor.role !== "owner" && actor.role !== "security_admin")
  ) {
    return (
      <AppShell
        title="Managed Triage"
        user={user}
        organizationId={organizationId}
      >
        <PermissionDenied>
          Managed Triage is managed by owners and security admins.
        </PermissionDenied>
      </AppShell>
    );
  }

  const [plans, sub] = await Promise.all([
    listPlans(),
    getSubscription(organizationId),
  ]);
  const live =
    sub &&
    (sub.status === "active" ||
      sub.status === "past_due" ||
      sub.status === "requested");
  const [performance, escalations, charges] =
    sub && sub.status !== "requested" && live
      ? await Promise.all([
          getPerformance(organizationId),
          listOrganizationEscalations(organizationId),
          listServiceCharges(organizationId),
        ])
      : [null, [], sub ? await listServiceCharges(organizationId) : []];

  return (
    <AppShell
      title="Managed Triage"
      user={user}
      organizationId={organizationId}
    >
      <ManagedTriageCenter
        organizationId={organizationId}
        organizationName="Organization"
        plans={plans}
        subscription={sub}
        performance={performance}
        escalations={escalations}
        charges={charges}
      />
    </AppShell>
  );
}
