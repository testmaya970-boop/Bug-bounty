import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { LaunchProgramStudio } from "../../../../components/programs/launch-program-studio";
import { canCreateProgram } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { getCurrentUser } from "../../../../lib/auth/current-user";

export default async function OrganizationEngagementsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Launch Program Studio" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, programs] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listProgramsForOrganization(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);
  const canCreate = canCreateProgram(actor.role);

  return (
    <AppShell title="Launch Program Studio" user={user} organizationId={organizationId}>
      <div className="-mx-4 -my-5 sm:-mx-6 lg:-mx-8">
        <Suspense
          fallback={
            <div className="min-h-screen bg-[#F6F8FB] p-6 text-sm text-[#667085]">
              Loading Launch Program Studio...
            </div>
          }
        >
          <LaunchProgramStudio
            organizationId={organizationId}
            organizationName={organization?.name ?? "Northwind Cloud"}
            existingPrograms={programs}
            canCreate={canCreate}
            initialMode="studio"
          />
        </Suspense>
      </div>
    </AppShell>
  );
}
