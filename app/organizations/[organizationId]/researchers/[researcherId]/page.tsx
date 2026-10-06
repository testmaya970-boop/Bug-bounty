import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { EmptyState, PermissionDenied } from "../../../../../components/ui/feedback";
import { ResearcherStatusBadge } from "../../../../../components/ui/badge";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { getActorMembership } from "../../../../../services/organization-members";
import { canViewOrganizationResearchers } from "../../../../../services/authorization";
import { listCurrentUserOrganizations } from "../../../../../services/organizations";
import { listResearchersForOrganization } from "../../../../../services/organization-analytics";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { LocalTime } from "../../../../../components/ui/local-time";

/**
 * One researcher's full per-program relationship breakdown for this organization -- the
 * detail a name-link navigates to from the Researchers comparison table, rather than an
 * in-place row expansion (keeps the comparison table's own row order/scan uninterrupted).
 *
 * Deliberately minimal: this is the relationship signal made concrete (every program,
 * its own real status, never collapsed), not a researcher profile. No action button
 * lives here -- suspend/reinstate/revoke stay exactly where they already are, on each
 * program's own researcher roster; this page links out to that program instead of
 * duplicating its responsibility. Payment/spend and terminal-outcome detail beyond
 * "resolved" are deliberately not built here yet -- deferred until justified.
 */
export default async function OrganizationResearcherDetailPage({ params }: { params: Promise<{ organizationId: string; researcherId: string }> }) {
  const { organizationId, researcherId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/researchers/${researcherId}` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Researcher" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }
  if (!canViewOrganizationResearchers(actor.role)) {
    return (
      <AppShell title="Researcher" user={user} organizationId={organizationId}>
        <PermissionDenied>The researcher list is available to owners, security admins and program managers.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, researchers] = await Promise.all([listCurrentUserOrganizations(user.id), listResearchersForOrganization(organizationId)]);
  const organization = organizations.find((org) => org.id === organizationId);
  const researcher = researchers.find((r) => r.researcherId === researcherId);

  if (!researcher) {
    return (
      <AppShell title="Researcher" user={user} organizationId={organizationId}>
        <div className="max-w-3xl space-y-6">
          <Breadcrumbs
            items={[
              { label: "Organizations", href: "/organizations" },
              { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}/researchers` as Route },
              { label: "Researcher" },
            ]}
          />
          <EmptyState title="Researcher not found">This researcher has no relationship with this organization.</EmptyState>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={researcher.displayName} user={user} organizationId={organizationId}>
      <div className="max-w-3xl space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}/researchers` as Route },
            { label: researcher.displayName },
          ]}
        />

        <div className="grid grid-cols-3 gap-6 border-y border-border py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted/70">Resolved</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{researcher.resolvedCount}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted/70">Critical / high</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
              <span className="text-severity-critical">{researcher.resolvedCritical}</span> / <span className="text-severity-high">{researcher.resolvedHigh}</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted/70">Last submission</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{researcher.lastSubmittedAt ? <LocalTime value={researcher.lastSubmittedAt} dateOnly /> : "Never"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Program relationships</SectionLabel>
          <div className="divide-y divide-border border-t border-border">
            {researcher.programs.map((program) => (
              <div key={program.programId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm font-medium text-ink">{program.programName}</span>
                <span className="flex items-center gap-3">
                  <ResearcherStatusBadge status={program.status} />
                  <Link prefetch={false}
                    href={`/organizations/${organizationId}/programs/${program.programId}#researchers` as Route}
                    className="text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
                  >
                    Manage →
                  </Link>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
