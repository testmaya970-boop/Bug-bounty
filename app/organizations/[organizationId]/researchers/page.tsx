import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { SectionLabel } from "../../../../components/ui/security-primitives";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listResearchersForOrganization } from "../../../../services/organization-analytics";
import {
  dominantOrganizationResearcherRelationshipStatus,
  summarizeOrganizationResearcherRelationship,
} from "../../../../lib/organization-researcher-relationship";
import { formatDate } from "../../../../lib/format-date";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { cn } from "../../../../lib/cn";

/**
 * Organization Researcher Intelligence -- an organization research-staffing console, not
 * a leaderboard and not a CRUD table. "Which researchers have actually contributed
 * meaningful security value to this organization, and are they still active with us." See
 * services/organization-analytics.ts's listResearchersForOrganization and
 * supabase/migrations/202609060002_organization_researcher_intelligence.sql.
 *
 * Distinct from both the per-program researcher roster (components/programs/
 * researcher-table.tsx -- access/status management for ONE program, with suspend/
 * reinstate/revoke actions) and platform-wide reputation/leaderboard (services/
 * reputation.ts -- never organization-specific). Read-only, cross-program, comparison-
 * first: a flat, dense row list, never expandable rows and never a card grid -- scanning
 * across every researcher this org has ever worked with stays uninterrupted. Any action
 * (suspend/revoke/re-invite) stays exactly where it already lives, per program.
 *
 * Visual structure is RESEARCHER -> ACCESS -> IMPACT -> RECENCY, in strict column
 * alignment (docs/decisions/0074): the data creates the row rhythm, not a card boundary.
 * Access reads as a compact status dot + text (dot pulses only for a currently-active
 * relationship -- a suspended/revoked row is deliberately still, since pulse means "live,"
 * not "exists"). Impact leads with the real resolved count, severity distribution trails
 * in small mono glyphs. Recency renders as telemetry (mono, muted) not a plain date.
 *
 * Access matches the org home/analytics pages' own gate: any active organization member,
 * not narrowed to owner/security_admin -- read-only descriptive data.
 */
export default async function OrganizationResearchersPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/researchers` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Researchers" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, researchers] = await Promise.all([listCurrentUserOrganizations(user.id), listResearchersForOrganization(organizationId)]);
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Researchers" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationId={organizationId} organizationName={organization?.name ?? "Organization"} active="researchers" />

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Research staffing console</SectionLabel>
            <span className="font-mono text-xs tabular-nums text-ink-muted">{researchers.length} researcher{researchers.length === 1 ? "" : "s"}</span>
          </div>

          {researchers.length === 0 ? (
            <p className="mt-3 border-t border-dashed border-border py-6 text-sm text-ink-muted">No researcher has joined one of this organization's programs yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted/70">
                    <th scope="col" className="py-2 pr-4 font-medium">Researcher</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Access</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Impact</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Recency</th>
                  </tr>
                </thead>
                <tbody>
                  {researchers.map((researcher) => {
                    const dominantStatus = dominantOrganizationResearcherRelationshipStatus(researcher.programs);
                    const dotClass = dominantStatus === "active" ? "bg-success" : dominantStatus === "suspended" ? "bg-warning" : "bg-ink-muted";
                    return (
                      <tr key={researcher.researcherId} className="group border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-surface-muted motion-reduce:transition-none">
                        <td className="py-3 pr-4 align-top">
                          <Link
                            href={`/organizations/${organizationId}/researchers/${researcher.researcherId}` as Route}
                            className="font-semibold text-ink transition-colors duration-150 hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
                          >
                            {researcher.displayName}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 align-top">
                          <span className="inline-flex items-center gap-1.5 text-ink-muted">
                            <span
                              aria-hidden="true"
                              className={cn("size-1.5 shrink-0 rounded-full", dotClass, dominantStatus === "active" && "motion-safe:animate-status-pulse")}
                            />
                            {summarizeOrganizationResearcherRelationship(researcher.programs)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 align-top font-mono tabular-nums">
                          <span className="font-semibold text-ink">{researcher.resolvedCount}</span>
                          <span className="ml-1 text-xs text-ink-muted">resolved</span>
                          {researcher.resolvedCount > 0 && (
                            <div className="mt-0.5 text-xs">
                              {[
                                researcher.resolvedCritical > 0 && <span key="critical" className="text-severity-critical">{researcher.resolvedCritical}C</span>,
                                researcher.resolvedHigh > 0 && <span key="high" className="text-severity-high">{researcher.resolvedHigh}H</span>,
                                researcher.resolvedMedium > 0 && <span key="medium" className="text-severity-medium">{researcher.resolvedMedium}M</span>,
                                researcher.resolvedLow > 0 && <span key="low" className="text-severity-low">{researcher.resolvedLow}L</span>,
                              ]
                                .filter(Boolean)
                                .reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, <span key={`sep-${i}`} className="text-ink-muted/50"> · </span>, el]), [])}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 align-top font-mono text-xs text-ink-muted">{researcher.lastSubmittedAt ? formatDate(researcher.lastSubmittedAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
