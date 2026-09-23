import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { OrganizationAssetsTable } from "../../../../components/organizations/organization-assets-table";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { listActiveScopeEntriesForOrganization } from "../../../../services/scope";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import type { ProgramAssetType } from "../../../../types/scope";

const VALID_ASSET_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

/**
 * Assets: every active scope entry across every one of this organization's engagements,
 * one flat, filterable, paginated list -- extends the existing scope/asset model
 * (public.program_scope_entries, docs/decisions/0006-scope-asset-model.md) rather than
 * forking a second, global assets table. Closes the "Assets" gap in HackerOne's own
 * documented org nav -- this app previously had no cross-program scope view at all, only
 * per-program (embedded on the program detail page's own Scope section, which stays the
 * place creation/editing actually happens -- see OrganizationAssetsTable's own comment).
 *
 * Access matches every other org-wide read surface (Analytics, Findings, Researchers):
 * any active organization member, not narrowed to owner/security_admin --
 * listActiveScopeEntriesForOrganization is RLS-scoped exactly like listActiveScopeEntries
 * already is, so a plain member who manages no program simply sees an empty (correctly
 * narrowed) result, never a permission error.
 */
export default async function OrganizationAssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ program?: string; type?: string }>;
}) {
  const { organizationId } = await params;
  const { program: programParam, type: typeParam } = await searchParams;
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

  const { items: entries, nextCursor } = await listActiveScopeEntriesForOrganization(organizationId, undefined, undefined, {
    programId: programId === "all" ? undefined : programId,
    assetType: assetType === "all" ? undefined : assetType,
  });

  return (
    <AppShell title="Assets" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} />

        <p className="text-sm text-ink-muted">Every asset in scope across every engagement. Manage an asset from its own engagement's Scope section.</p>

        <OrganizationAssetsTable
          organizationId={organizationId}
          initialEntries={entries}
          initialNextCursor={nextCursor}
          programId={programId}
          assetType={assetType}
          programOptions={programs.map((program) => ({ id: program.id, name: program.name }))}
        />
      </div>
    </AppShell>
  );
}
