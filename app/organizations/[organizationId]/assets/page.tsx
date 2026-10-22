import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { OrganizationAssetsTable } from "../../../../components/organizations/organization-assets-table";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { listOrganizationAssets } from "../../../../services/scope";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import type { ProgramAssetType } from "../../../../types/scope";
import { listAssetTiers } from "../../../../services/asset-tiers";

const VALID_ASSET_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

/**
 * Assets: the organization's asset inventory (public.assets, 202610160009) -- every asset its
 * engagements have had in scope, the engagements it is assigned to, and the findings filed
 * against it, the model HackerOne's Asset Inventory and Bugcrowd's asset management use.
 * Owners and security admins see every asset; program staff see the assets of their programs
 * (list_organization_assets decides, so a narrower role gets a narrower list, not an error).
 */
export default async function OrganizationAssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ program?: string; type?: string; retired?: string }>;
}) {
  const { organizationId } = await params;
  const { program: programParam, type: typeParam, retired } = await searchParams;
  const includeRetired = retired === "1";
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/assets` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Assets" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, programs] = await Promise.all([listCurrentUserOrganizations(user.id), listProgramsForOrganization(organizationId)]);
  const organization = organizations.find((org) => org.id === organizationId);

  const programId = programParam && programs.some((program) => program.id === programParam) ? programParam : "all";
  const assetType: ProgramAssetType | "all" = typeParam && VALID_ASSET_TYPES.includes(typeParam as ProgramAssetType) ? (typeParam as ProgramAssetType) : "all";

  const [{ items: assets, nextCursor }, assetTiers] = await Promise.all([
    listOrganizationAssets(organizationId, undefined, {
      programId: programId === "all" ? undefined : programId,
      assetType: assetType === "all" ? undefined : assetType,
      includeRetired,
    }),
    actor.role === "billing_admin" ? Promise.resolve({ tiers: {}, canEdit: false }) : listAssetTiers(organizationId),
  ]);

  return (
    <AppShell title="Assets" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} organizationId={organizationId} logoVersion={await getOrganizationLogoVersion(organizationId)} />

        <p className="text-sm text-ink-muted">Every asset your engagements cover, where it is in scope, and the findings filed against it. Change scope from an engagement's Scope section.</p>

        <OrganizationAssetsTable
          organizationId={organizationId}
          initialAssets={assets}
          tiers={assetTiers.tiers}
          canEditTier={assetTiers.canEdit}
          initialNextCursor={nextCursor}
          programId={programId}
          assetType={assetType}
          includeRetired={includeRetired}
          programOptions={programs.map((program) => ({ id: program.id, name: program.name }))}
        />
      </div>
    </AppShell>
  );
}
