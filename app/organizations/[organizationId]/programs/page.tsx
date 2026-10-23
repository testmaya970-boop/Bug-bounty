import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { EmptyState, PermissionDenied } from "../../../../components/ui/feedback";
import { ProgramStatusBadge } from "../../../../components/ui/badge";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { CreateProgramDialog } from "../../../../components/programs/create-program-dialog";
import { DeleteDraftProgramDialog } from "../../../../components/programs/delete-draft-program-dialog";
import { canCreateProgram } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { ENGAGEMENT_TYPE_ORDER, engagementTypeLabel } from "../../../../lib/program-status";
import type { EngagementType } from "../../../../types/program";
import { LocalTime } from "../../../../components/ui/local-time";

function parseEngagementTypeParam(value: string | undefined): EngagementType | undefined {
  return value && (ENGAGEMENT_TYPE_ORDER as string[]).includes(value) ? (value as EngagementType) : undefined;
}

/**
 * Organization Engagements (docs/decisions/0076-hackerone-style-engagement-taxonomy.md)
 * -- HackerOne-style category tabs (All / Bug Bounty / Response / Pentest / Code Audit /
 * Challenge / Campaign / Spot Check) over the SAME programs this org already has, never a
 * second list/route/dataset. Same route (`/organizations/{id}/programs`) as before this
 * change -- only the page's own identity (title, nav label, filtering) evolved; every
 * program URL, permission check, report/researcher/scope relationship, and CRUD action
 * this route already supported is completely unchanged.
 *
 * Filtering is query-param-driven (`?type=`) and applied server-side over the already-
 * fetched `programs` array -- the same "derive, don't refetch" pattern
 * lib/report-status.ts's applyReportFilters and app/reports/page.tsx's own filter form
 * already established this session, not a new client-side-only filter and not a new
 * per-tab query (listProgramsForOrganization already returns every real column needed,
 * engagementType included -- one query, one round trip, tabs are a pure derivation).
 */
export default async function OrganizationEngagementsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ type?: string }> }) {
  const { organizationId } = await params;
  const { type: typeParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Engagements" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const selectedType = parseEngagementTypeParam(typeParam);

  const [organizations, programs] = await Promise.all([listCurrentUserOrganizations(user.id), listProgramsForOrganization(organizationId)]);
  const organization = organizations.find((org) => org.id === organizationId);
  const canCreate = canCreateProgram(actor.role);

  // Real counts per real engagementType, derived from the one already-fetched array --
  // never a fabricated/estimated tab count, never a second query per tab.
  const countByType = new Map<EngagementType, number>();
  for (const program of programs) countByType.set(program.engagementType, (countByType.get(program.engagementType) ?? 0) + 1);

  const visiblePrograms = selectedType ? programs.filter((program) => program.engagementType === selectedType) : programs;

  return (
    // AppShell's title is the page-level landmark, not a second copy of the organization
    // name -- OrganizationHeader's own h2, right below, already shows it once.
    <AppShell title="Engagements" user={user} organizationId={organizationId}>
      <div className="max-w-3xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` }, { label: "Engagements" }]} />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} organizationId={organizationId} logoVersion={await getOrganizationLogoVersion(organizationId)} />

        {programs.length === 0 ? (
          <EmptyState title="No engagements yet">
            {canCreate
              ? "An engagement is the security boundary between this organization and researchers. Create one to start defining scope and, eventually, inviting researchers."
              : "This organization has not created an engagement yet, or none have been shared with you. Only an owner or security admin can create one."}
          </EmptyState>
        ) : (
          <>
            {/* Real filter tabs -- a plain GET link per tab (no client JS required to
                filter, matching this codebase's own established GET-form/query-param
                filter convention), each carrying a real count derived from the same
                fetch above. "All" always shows the full real total. */}
            {/* aria-current="true", not "page": these filter one list; "page" belongs to the
                sidebar's Engagements link alone (AGENTS.md: one nav control per level). */}
            <nav aria-label="Filter by engagement type" className="flex flex-wrap gap-1 border-b border-border">
              <Link prefetch={false}
                href={`/organizations/${organizationId}/programs` as Route}
                aria-current={!selectedType ? "true" : undefined}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${!selectedType ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
              >
                All <span className="font-mono text-xs tabular-nums text-ink-muted">{programs.length}</span>
              </Link>
              {ENGAGEMENT_TYPE_ORDER.filter((type) => (countByType.get(type) ?? 0) > 0).map((type) => (
                <Link prefetch={false}
                  key={type}
                  href={`/organizations/${organizationId}/programs?type=${type}` as Route}
                  aria-current={selectedType === type ? "true" : undefined}
                  className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${selectedType === type ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
                >
                  {engagementTypeLabel(type)} <span className="font-mono text-xs tabular-nums text-ink-muted">{countByType.get(type)}</span>
                </Link>
              ))}
            </nav>

            {visiblePrograms.length === 0 ? (
              <EmptyState title="No engagements in this category">Switch to a different category, or create a new engagement of this type.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {visiblePrograms.map((program) => (
                  <li key={program.id} className="flex items-center justify-between gap-3 py-3">
                    <Link prefetch={false}
                      href={`/organizations/${organizationId}/programs/${program.id}` as Route}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-ink">{program.name}</span>
                        <ProgramStatusBadge status={program.status} />
                        <span className="font-mono text-xs text-ink-muted">{engagementTypeLabel(program.engagementType)}</span>
                      </span>
                      <span className="text-sm text-ink-muted">Created <LocalTime value={program.createdAt} dateOnly /></span>
                    </Link>
                    {/* Draft-only: a program that has ever left draft carries real
                        history (once submitted -- and always for review/active/paused/
                        closed) that a delete would need to destroy -- that path is
                        Close program, on the program's own detail page, not here. */}
                    {canCreate && program.status === "draft" && <DeleteDraftProgramDialog organizationId={organizationId} programId={program.id} programName={program.name} />}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {canCreate && (
          <div>
            <CreateProgramDialog organizationId={organizationId} triggerLabel={programs.length === 0 ? "Create engagement" : "Create another engagement"} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
