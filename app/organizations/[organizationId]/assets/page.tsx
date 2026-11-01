import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
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
import { listAssetRewardGroups, listRewardGroups } from "../../../../services/reward-groups";
import { AssetPosture } from "../../../../components/organizations/asset-posture";
import { Shield, Plus, Download, Radio, ShieldCheck } from "lucide-react";

const VALID_ASSET_TYPES: ProgramAssetType[] = [
  "domain",
  "url",
  "ip_cidr",
  "ios_app",
  "android_app",
  "source_code",
  "hardware",
  "ai_model",
];

/**
 * Attack Surface Workspace: Organization's centralized attack surface management (ASM),
 * inventory telemetry, verification status, and contextual security intelligence.
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
      <AppShell title="Attack Surface" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, programs] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listProgramsForOrganization(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);

  const programId =
    programParam && programs.some((program) => program.id === programParam) ? programParam : "all";
  const assetType: ProgramAssetType | "all" =
    typeParam && VALID_ASSET_TYPES.includes(typeParam as ProgramAssetType)
      ? (typeParam as ProgramAssetType)
      : "all";

  const [{ items: assets, nextCursor }, assetGroups, rewardGroups] = await Promise.all([
    listOrganizationAssets(organizationId, undefined, {
      programId: programId === "all" ? undefined : programId,
      assetType: assetType === "all" ? undefined : assetType,
      includeRetired,
    }),
    actor.role === "billing_admin"
      ? Promise.resolve({ byAsset: {}, canEdit: false })
      : listAssetRewardGroups(organizationId),
    actor.role === "billing_admin"
      ? Promise.resolve({ groups: [], canManage: false })
      : listRewardGroups(organizationId),
  ]);
  const activeGroups = rewardGroups.groups.filter((g) => !g.archived);

  return (
    <AppShell title="Attack Surface & Assets" user={user} organizationId={organizationId}>
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` as Route },
            { label: "Attack Surface" },
          ]}
        />

        {/* Executive Workspace Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E7EAF0] pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
                Attack Surface Workspace
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-xs font-semibold text-[#059669] border border-[#A7F3D0]">
                <span className="size-1.5 rounded-full bg-[#10B981] animate-pulse" />
                Live Telemetry
              </span>
            </div>
            <p className="text-sm text-[#475467] max-w-3xl">
              Track, verify, and govern every externally accessible asset, DNS record, API gateway, and internal service defended by {organization?.name ?? "your organization"}.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {programs[0] && (
              <Link
                href={`/organizations/${organizationId}/programs/${programs[0].id}#scope` as Route}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-[#FFFFFF] shadow-sm hover:bg-[#1D4ED8] transition-colors"
              >
                <Plus className="size-3.5" />
                Add Scope Target
              </Link>
            )}
          </div>
        </div>

        {/* Executive 6 KPI Cards & Exposure Distribution */}
        <AssetPosture
          assets={assets}
          groupByAsset={assetGroups.byAsset}
          groups={activeGroups}
          more={Boolean(nextCursor)}
        />

        {/* Two-Column Attack Surface Inventory & Sticky Intelligence Panel */}
        <OrganizationAssetsTable
          organizationId={organizationId}
          key={`${programId}|${assetType}|${includeRetired}`}
          initialAssets={assets}
          groupByAsset={assetGroups.byAsset}
          rewardGroups={activeGroups.map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            icon: g.icon,
          }))}
          canEditGroup={assetGroups.canEdit}
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
