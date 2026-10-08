import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { Breadcrumbs } from "../../../components/ui/navigation";
import { Alert, EmptyState, PermissionDenied } from "../../../components/ui/feedback";
import { AssetTypeBadge, SeverityBadge, StatusBadge } from "../../../components/ui/badge";
import { ActivityTimeline } from "../../../components/ui/data-display";
import { RegistryList, SectionLabel } from "../../../components/ui/security-primitives";
import { OrganizationHeader } from "../../../components/organizations/organization-header";
import { canManageMembers, canManagePayments, canViewOrganizationAnalytics } from "../../../services/authorization";
import { getActorMembership, getOrganizationAuditActivity, listOrganizationMembers } from "../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../services/organizations";
import { listProgramsForOrganization } from "../../../services/programs";
import { listOpenReportsForOrganization } from "../../../services/reports";
import { getOrganizationBountySpendSummary, getOrganizationResolutionPerformance } from "../../../services/organization-analytics";
import { formatMoney } from "../../../lib/money";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { reportNextActionLabel } from "../../../lib/report-status";
import { describeOrganizationActivity } from "../../../lib/organization-activity-labels";
import { perfTimed } from "../../../lib/perf-trace";
import type { Report } from "../../../types/report";
import { LocalTime } from "../../../components/ui/local-time";

// Turn 6 (phase/9-ia): Home's contract is glance-only -- a KPI row, one de-duplicated
// action queue, and a last-5 activity feed that links out. Every list that duplicated
// another route's own content (the full engagements list -- see /programs; the
// needs-attention/waiting-on-researcher split -- see /findings; disclosure requests --
// each report's own page; expiring invitations -- /members) is deleted, not just
// hidden: this page must never be the place a record renders a second time. See
// CLAUDE.md's "every nav point is its own route" rule.
const ACTIVITY_ROW_LIMIT = 5;
const ACTION_QUEUE_LIMIT = 8;
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

function ActionQueueRow({ organizationId, report, programName }: { organizationId: string; report: Report; programName: string }) {
  return (
    <li>
      <Link prefetch={false}
        href={`/organizations/${organizationId}/programs/${report.programId}/inbox?reportId=${report.id}` as Route}
        className="block px-4 py-3 transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          {report.confirmedSeverity && <SeverityBadge severity={report.confirmedSeverity} />}
          <span className="font-medium text-ink">{report.title}</span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <AssetTypeBadge assetType={report.assetType} />
          <span className="break-all font-mono">{report.displayTarget}</span>
          <span>·</span>
          <span>{programName}</span>
          <span>·</span>
          <span><LocalTime value={report.updatedAt} /></span>
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm">
          <StatusBadge status={report.status} />
          <span className="font-medium text-action">{reportNextActionLabel(report.status)} →</span>
        </p>
      </Link>
    </li>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export default async function OrganizationOverviewPage({ params }: { params: Promise<{ organizationId: string }> }) {
  return perfTimed("route: org dashboard (total)", () => renderOrganizationOverviewPage(params));
}

async function renderOrganizationOverviewPage(paramsPromise: Promise<{ organizationId: string }>) {
  const { organizationId } = await paramsPromise;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}` as Route);

  const actor = await perfTimed("org dashboard: getActorMembership", () => getActorMembership(user.id, organizationId));
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Home" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const canSeeAdminActivity = canManageMembers(actor.role);

  // getOrganizationAuditActivity/listOrganizationMembers are RLS-gated to owner/
  // security_admin (same gate app/organizations/[organizationId]/members/page.tsx
  // applies) -- only fetched when canSeeAdminActivity is true, matching Settings'
  // established pattern, so a lower-privileged member never sees a misleadingly empty
  // activity feed in place of "you aren't authorized to see this."
  const [organizations, programs, openReports, members, activityPage, resolutionPerformance, bountySpendSummary] = await perfTimed(
    "org dashboard: main Promise.all",
    () =>
      Promise.all([
        listCurrentUserOrganizations(user.id),
        listProgramsForOrganization(organizationId),
        listOpenReportsForOrganization(organizationId),
        canSeeAdminActivity ? listOrganizationMembers(organizationId) : Promise.resolve([]),
        canSeeAdminActivity ? getOrganizationAuditActivity(organizationId) : Promise.resolve(null),
        // Org-wide figures follow the same role rules as Analytics and Payments (202610060004).
        canViewOrganizationAnalytics(actor.role) ? getOrganizationResolutionPerformance(organizationId) : Promise.resolve(null),
        canManagePayments(actor.role) ? getOrganizationBountySpendSummary(organizationId) : Promise.resolve(null),
      ]),
  );
  const organization = organizations.find((org) => org.id === organizationId);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const activeEngagementCount = programs.filter((program) => program.status === "active").length;

  const actorNames = Object.fromEntries(members.map((member) => [member.userId, member.displayName]));
  const recentActivity = (activityPage?.items ?? []).slice(0, ACTIVITY_ROW_LIMIT).map((event) => {
    const actorName = (event.actorId && actorNames[event.actorId]) || "A member";
    const { title, detail } = describeOrganizationActivity(event, actorName);
    return { id: event.id, title, detail, timestamp: <LocalTime value={event.createdAt} /> };
  });

  // The single action queue: every open report the organization's own turn (excludes
  // needs_information -- the ball is in the researcher's court there, same DOMAIN.md
  // "whose turn" rule the rest of this codebase uses), ranked critical/high first, then
  // oldest-updated within the same severity. One row per report id -- no report can
  // appear in this list twice, and this is now the ONLY list of reports on this page, so
  // no report can appear on this page twice either.
  const actionQueue = openReports
    .filter((report) => report.status !== "needs_information")
    .slice()
    .sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.confirmedSeverity ?? "none"] - SEVERITY_RANK[b.confirmedSeverity ?? "none"];
      if (severityDiff !== 0) return severityDiff;
      return a.updatedAt.localeCompare(b.updatedAt);
    })
    .slice(0, ACTION_QUEUE_LIMIT);
  const unresolvedCriticalCount = openReports.filter((report) => report.confirmedSeverity === "critical").length;
  const unresolvedHighCount = openReports.filter((report) => report.confirmedSeverity === "high").length;

  return (
    <AppShell title="Home" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} />

        {/* Read-only and purely informational -- only a platform admin can lift a
            suspension (see supabase/migrations/202609050016_organization_status_control.sql
            and 202609050017_organization_operability_gate.sql), so this banner has no
            dismiss action. */}
        {organization?.status === "suspended" && (
          <Alert tone="danger" title="This organization is suspended">
            This organization is suspended by Unpatched. Contact support for details.
          </Alert>
        )}

        {/* KPI row -- four real, already-queried numbers, no new query beyond what Home
            already fetched. Never a card grid of fabricated metrics: each tile is either a
            plain count over already-fetched arrays, or the same
            get_organization_resolution_performance / get_organization_bounty_spend_summary
            RPCs the Analytics page's own KPIs already use. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="Active engagements" value={activeEngagementCount.toLocaleString("en-US")} />
          <KpiTile label="Open reports" value={openReports.length.toLocaleString("en-US")} />
          {resolutionPerformance && (
            <KpiTile
              label="Median time to first triage"
              value={resolutionPerformance.medianHoursToFirstTriage !== null ? `${resolutionPerformance.medianHoursToFirstTriage.toFixed(1)}h` : "—"}
              hint={resolutionPerformance.medianHoursToFirstTriage === null ? "No triaged reports yet" : undefined}
            />
          )}
          {bountySpendSummary && (
            <KpiTile
              label="Total paid"
              value={bountySpendSummary.length > 0 ? bountySpendSummary.map((summary) => formatMoney(summary.totalPaidMinorUnits, summary.currency)).join(", ") : "—"}
              hint={bountySpendSummary.length === 0 ? "No bounties awarded yet" : undefined}
            />
          )}
        </div>

        {programs.length === 0 ? (
          <EmptyState title="No engagements yet">
            {canManageMembers(actor.role) ? "Create an engagement from Engagements to define scope and start receiving reports." : "You do not currently manage any engagement in this organization."}
          </EmptyState>
        ) : (
          <div className="rounded-lg border-2 border-ink bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <SectionLabel>Action queue</SectionLabel>
                <h2 className="mt-0.5 text-base font-semibold text-ink">Needs your decision</h2>
              </div>
              <div className="flex items-baseline gap-4 font-mono text-xs">
                <span className={unresolvedCriticalCount > 0 ? "font-semibold text-severity-critical" : "text-ink-muted"}>
                  <span className="text-base tabular-nums">{unresolvedCriticalCount}</span> critical
                </span>
                <span className={unresolvedHighCount > 0 ? "font-semibold text-severity-high" : "text-ink-muted"}>
                  <span className="text-base tabular-nums">{unresolvedHighCount}</span> high
                </span>
              </div>
            </div>
            {actionQueue.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Nothing needs your decision right now.</p>
            ) : (
              <RegistryList className="mt-3">
                {actionQueue.map((report) => (
                  <ActionQueueRow key={report.id} organizationId={organizationId} report={report} programName={programNameById.get(report.programId) ?? "Unknown program"} />
                ))}
              </RegistryList>
            )}
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <Link prefetch={false} href={`/organizations/${organizationId}/findings` as Route} className="font-medium text-action hover:text-action-hover">
                View all findings →
              </Link>
              <Link prefetch={false} href={`/organizations/${organizationId}/programs` as Route} className="font-medium text-action hover:text-action-hover">
                View all engagements →
              </Link>
            </div>
          </div>
        )}

        {/* Last-5 activity, linking out -- never the full feed (that would duplicate a
            route this same turn adds: Activity, /organizations/{id}/activity). */}
        {canSeeAdminActivity && recentActivity.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <SectionLabel>Activity</SectionLabel>
                <h2 className="mt-0.5 text-base font-semibold text-ink">Recent activity</h2>
              </div>
              <Link prefetch={false} href={`/organizations/${organizationId}/activity` as Route} className="text-sm font-medium text-action hover:text-action-hover">
                View all activity →
              </Link>
            </div>
            <div className="mt-2">
              <ActivityTimeline items={recentActivity} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
