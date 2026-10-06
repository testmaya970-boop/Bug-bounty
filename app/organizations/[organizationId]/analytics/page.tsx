import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { EmptyState, PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { OrganizationReportAnalytics } from "../../../../components/organizations/organization-report-analytics";
import { OrganizationBountySpend } from "../../../../components/organizations/organization-bounty-spend";
import { ProgramHealthSection } from "../../../../components/programs/program-health-section";
import { ProgramStatusBadge } from "../../../../components/ui/badge";
import { SectionLabel } from "../../../../components/ui/security-primitives";
import { getActorMembership } from "../../../../services/organization-members";
import { canViewOrganizationAnalytics } from "../../../../services/authorization";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import {
  getOrganizationBountySpendSummary,
  getOrganizationProgramBountySpend,
  getOrganizationResolutionPerformance,
  getOrganizationSeverityStatusBreakdown,
  getOrganizationWeeklyBountySpend,
  getOrganizationWeeklyReportVolume,
} from "../../../../services/organization-analytics";
import { getProgramResolutionPerformance, getProgramSeverityStatusBreakdown, getProgramWeeklyReportVolume } from "../../../../services/program-analytics";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { formatMoney } from "../../../../lib/money";

/** Per-program row for the "which program needs attention" comparison table -- every
 * number reused directly from the existing get_program_severity_status_breakdown/
 * get_program_resolution_performance RPCs (services/program-analytics.ts), never a new
 * KPI. `unresolvedHighSeverityCount` is the same concept the triage inbox's own workload
 * summary strip uses (services/reports.ts's getReportInboxWorkloadSummary): confirmed
 * high/critical severity, still in a non-terminal status. */
async function loadProgramAnalyticsRow(
  program: { id: string; name: string; status: Awaited<ReturnType<typeof listProgramsForOrganization>>[number]["status"] },
  spendByProgram: Map<string, { currency: string; totalPaidMinorUnits: number }[]>,
) {
  const [severityStatusBreakdown, resolutionPerformance] = await Promise.all([
    getProgramSeverityStatusBreakdown(program.id),
    getProgramResolutionPerformance(program.id),
  ]);
  const unresolvedHighSeverityCount = severityStatusBreakdown
    .filter((cell) => (cell.severity === "high" || cell.severity === "critical") && cell.status !== "resolved" && cell.status !== "duplicate" && cell.status !== "informative" && cell.status !== "not_applicable" && cell.status !== "rejected")
    .reduce((sum, cell) => sum + cell.count, 0);
  return {
    id: program.id,
    name: program.name,
    status: program.status,
    openCount: resolutionPerformance.openCount,
    agingOver60DaysCount: resolutionPerformance.agingOver60DaysCount,
    unresolvedHighSeverityCount,
    // Already fetched once, org-wide, via getOrganizationProgramBountySpend -- a plain
    // lookup here, never a second per-program query (matches this function's own existing
    // "reuse an already-fetched RPC" convention). A program can have spend in more than
    // one currency (rare, but the schema allows it -- see the migration's own note), so
    // this is an array, never collapsed into one number.
    spend: spendByProgram.get(program.id) ?? [],
  };
}

/**
 * Real, backend-verified analytics across every program in this organization --
 * severity/status breakdown, weekly submission/closure activity, and resolution
 * performance (median time-to-triage, time-to-resolution, aging). See
 * services/organization-analytics.ts and supabase/migrations/
 * 202609050004_organization_report_analytics.sql. Access matches the org home page's own
 * gate: any active organization member, not narrowed to owner/security_admin -- this is
 * read-only descriptive data.
 *
 * A `?program=<id>` query param (the same GET-param pattern this codebase's own filter
 * forms already use) isolates one program's analytics via the reused ProgramHealthSection
 * -- same page, no navigation away from /analytics, org-wide view still one click back.
 * The "which program needs attention" comparison table above it only renders when there is
 * more than one program (a single-program organization has nothing to compare).
 */
export default async function OrganizationAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ program?: string }>;
}) {
  const { organizationId } = await params;
  const { program: selectedProgramId } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/analytics` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Analytics" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }
  if (!canViewOrganizationAnalytics(actor.role)) {
    return (
      <AppShell title="Analytics" user={user} organizationId={organizationId}>
        <PermissionDenied>Organization analytics are available to owners and security admins.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, programs, severityStatusBreakdown, weeklyVolume, resolutionPerformance, bountySpendSummary, weeklyBountySpend, programBountySpend] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listProgramsForOrganization(organizationId),
    getOrganizationSeverityStatusBreakdown(organizationId),
    getOrganizationWeeklyReportVolume(organizationId),
    getOrganizationResolutionPerformance(organizationId),
    getOrganizationBountySpendSummary(organizationId),
    getOrganizationWeeklyBountySpend(organizationId),
    getOrganizationProgramBountySpend(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);

  const spendByProgram = new Map<string, { currency: string; totalPaidMinorUnits: number }[]>();
  for (const row of programBountySpend) {
    const existing = spendByProgram.get(row.programId) ?? [];
    existing.push({ currency: row.currency, totalPaidMinorUnits: row.totalPaidMinorUnits });
    spendByProgram.set(row.programId, existing);
  }

  // Real per-program signal, reusing the exact RPCs the program control-center page's own
  // "Program health" section already calls -- never a new KPI, never client-side
  // aggregation of the org-wide numbers (a program's own analytics RPC already computes
  // this server-side, correctly, per program). Sorted so the program most likely to need
  // attention (unresolved high/critical first, then longest-aging) surfaces first --
  // answering "which program needs attention," not just listing them alphabetically.
  const programRows =
    programs.length > 0
      ? (await Promise.all(programs.map((program) => loadProgramAnalyticsRow(program, spendByProgram)))).sort((a, b) => {
          if (a.unresolvedHighSeverityCount !== b.unresolvedHighSeverityCount) return b.unresolvedHighSeverityCount - a.unresolvedHighSeverityCount;
          return b.agingOver60DaysCount - a.agingOver60DaysCount;
        })
      : [];

  const selectedProgram = selectedProgramId ? programRows.find((row) => row.id === selectedProgramId) : undefined;
  const selectedProgramAnalytics = selectedProgram
    ? await Promise.all([
        getProgramSeverityStatusBreakdown(selectedProgram.id),
        getProgramWeeklyReportVolume(selectedProgram.id),
        getProgramResolutionPerformance(selectedProgram.id),
      ])
    : null;

  return (
    <AppShell title="Analytics" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} />

        {programs.length === 0 ? (
          <EmptyState title="No analytics yet">Analytics fill in once this organization has at least one program receiving reports.</EmptyState>
        ) : severityStatusBreakdown.length === 0 ? (
          <EmptyState title="No reports yet">Analytics fill in as reports are submitted across this organization's programs.</EmptyState>
        ) : (
          <>
            {programRows.length > 1 && (
              <div className="space-y-3">
                <div>
                  <SectionLabel>Which program needs attention</SectionLabel>
                  <p className="mt-1 text-sm text-ink-muted">Sorted by unresolved high/critical reports, then by how long the oldest open report has aged.</p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                    <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
                      <tr>
                        {["Program", "Status", "Open", "Aging 60+ days", "Unresolved high/critical", "Spend"].map((header) => (
                          <th key={header} scope="col" className="px-4 py-3 font-semibold">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {programRows.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <Link prefetch={false}
                              href={`/organizations/${organizationId}/analytics?program=${row.id}` as Route}
                              className="font-medium text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                              {row.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <ProgramStatusBadge status={row.status} />
                          </td>
                          <td className="px-4 py-3 tabular-nums text-ink-muted">{row.openCount}</td>
                          <td className={row.agingOver60DaysCount > 0 ? "px-4 py-3 tabular-nums font-semibold text-warning" : "px-4 py-3 tabular-nums text-ink-muted"}>{row.agingOver60DaysCount}</td>
                          <td className={row.unresolvedHighSeverityCount > 0 ? "px-4 py-3 tabular-nums font-semibold text-danger" : "px-4 py-3 tabular-nums text-ink-muted"}>{row.unresolvedHighSeverityCount}</td>
                          <td className="px-4 py-3 tabular-nums text-ink-muted">
                            {row.spend.length === 0
                              ? "—"
                              : row.spend.map((s, i) => (
                                  <React.Fragment key={s.currency}>
                                    {i > 0 && ", "}
                                    {formatMoney(s.totalPaidMinorUnits, s.currency)}
                                  </React.Fragment>
                                ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedProgram && selectedProgramAnalytics ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <SectionLabel>{selectedProgram.name}</SectionLabel>
                    <h2 className="mt-1 text-lg font-semibold text-ink">Program analytics</h2>
                  </div>
                  <Link prefetch={false}
                    href={`/organizations/${organizationId}/analytics` as Route}
                    className="text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    ← Back to organization-wide analytics
                  </Link>
                </div>
                <ProgramHealthSection
                  severityStatusBreakdown={selectedProgramAnalytics[0]}
                  weeklyVolume={selectedProgramAnalytics[1]}
                  resolutionPerformance={selectedProgramAnalytics[2]}
                />
              </div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-3">
                  <SectionLabel>Organization-wide</SectionLabel>
                  <OrganizationReportAnalytics severityStatusBreakdown={severityStatusBreakdown} weeklyVolume={weeklyVolume} resolutionPerformance={resolutionPerformance} />
                </div>
                <OrganizationBountySpend summary={bountySpendSummary} weeklySpend={weeklyBountySpend} />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
