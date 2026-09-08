import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { Breadcrumbs } from "../../../components/ui/navigation";
import { Alert, EmptyState, PermissionDenied } from "../../../components/ui/feedback";
import { AssetTypeBadge, ProgramStatusBadge, SeverityBadge, StatusBadge } from "../../../components/ui/badge";
import { ActivityTimeline } from "../../../components/ui/data-display";
import { RegistryList, SectionLabel } from "../../../components/ui/security-primitives";
import { OrganizationHeader } from "../../../components/organizations/organization-header";
import { CreateProgramDialog } from "../../../components/programs/create-program-dialog";
import { canCreateProgram, canManageMembers } from "../../../services/authorization";
import { getActorMembership, getOrganizationAuditActivity, listOrganizationMembers, listPendingInvitations } from "../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../services/organizations";
import { listProgramsForOrganization } from "../../../services/programs";
import { listOpenReportsForOrganization, OPEN_REPORTS_OVERVIEW_LIMIT } from "../../../services/reports";
import { listPendingReportDisclosures } from "../../../services/report-disclosures";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { reportNextActionLabel } from "../../../lib/report-status";
import { formatDate, formatDateTime } from "../../../lib/format-date";
import { describeOrganizationActivity } from "../../../lib/organization-activity-labels";
import type { ProgramStatus } from "../../../types/program";
import type { Report } from "../../../types/report";

const ATTENTION_ROW_LIMIT = 5;
const ACTIVITY_ROW_LIMIT = 6;
const EXPIRING_INVITATION_LIMIT = 5;

// Every real value here already exists on ProgramStatus (types/program.ts) -- draft/
// review/active/paused/closed -- no new status invented; this is a plain client-side
// tally over the org's own already-fetched programs array (real "active programs/
// engagements" signal per the Home brief), never a new query.
const PROGRAM_STATUS_ORDER: ProgramStatus[] = ["active", "review", "draft", "paused", "closed"];
const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = { draft: "Draft", review: "In review", active: "Active", paused: "Paused", closed: "Closed" };

/**
 * `ownership` distinguishes who owns the next move -- not a new priority/status concept,
 * just how the identical next-action line reads. "action" (the organization's own turn,
 * e.g. "Decide outcome") keeps the existing text-action accent + arrow, since it really is
 * a call to action. "waiting" (e.g. reportNextActionLabel's own "Awaiting researcher" for
 * needs_information) drops the accent color and arrow -- the copy already says the
 * organization isn't the one to act next; the previous shared treatment gave that same
 * text a clickable-CTA color regardless, contradicting its own words. Severity/status
 * badges, target, program, and timestamp are unchanged in both cases -- only the next-
 * action line's own treatment differs.
 */
function ReportRow({ organizationId, report, programName, ownership = "action" }: { organizationId: string; report: Report; programName: string; ownership?: "action" | "waiting" }) {
  return (
    <li>
      <Link
        href={`/organizations/${organizationId}/programs/${report.programId}/reports/${report.id}` as Route}
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
          <span>{formatDateTime(report.updatedAt)}</span>
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm">
          <StatusBadge status={report.status} />
          {ownership === "action" ? (
            <span className="font-medium text-action">{reportNextActionLabel(report.status)} →</span>
          ) : (
            <span className="text-ink-muted">{reportNextActionLabel(report.status)}</span>
          )}
        </p>
      </Link>
    </li>
  );
}

export default async function OrganizationOverviewPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Home" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const canSeeAdminActivity = canManageMembers(actor.role);

  // getOrganizationAuditActivity/listPendingInvitations/listOrganizationMembers are all
  // RLS-gated to owner/security_admin (per organization_invitations'/audit_logs' own read
  // policies, the same gate app/organizations/[organizationId]/members/page.tsx and
  // .../settings/page.tsx already apply) -- fetching either as a lower-privileged member
  // would silently come back empty, which would misrepresent "nothing" as a real fact
  // rather than "you aren't authorized to see this." So these three only fetch at all when
  // canSeeAdminActivity is true; every other active member simply doesn't get the
  // "Recent activity"/"Upcoming actions" zones, matching Settings' own established pattern.
  const [organizations, programs, openReports, pendingDisclosures, members, pendingInvitations, activityPage] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listProgramsForOrganization(organizationId),
    listOpenReportsForOrganization(organizationId),
    listPendingReportDisclosures(organizationId),
    canSeeAdminActivity ? listOrganizationMembers(organizationId) : Promise.resolve([]),
    canSeeAdminActivity ? listPendingInvitations(organizationId) : Promise.resolve([]),
    canSeeAdminActivity ? getOrganizationAuditActivity(organizationId) : Promise.resolve(null),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);
  const programNameById = new Map(programs.map((program) => [program.id, program.name]));

  // "Active programs/engagements" -- a plain client-side tally over the org's own already-
  // fetched programs array, real ProgramStatus values only, never a fabricated category.
  const programCountByStatus = new Map<ProgramStatus, number>();
  for (const program of programs) programCountByStatus.set(program.status, (programCountByStatus.get(program.status) ?? 0) + 1);

  // "Upcoming actions" -- pending organization invitations sorted by their real
  // expiresAt, soonest first (the one genuine "needs attention soon" signal that exists
  // in this domain today; see the earlier architecture inventory for what does not).
  const expiringInvitations = [...pendingInvitations].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).slice(0, EXPIRING_INVITATION_LIMIT);

  // "Recent organization activity" -- the same actorId -> displayName resolution
  // app/organizations/[organizationId]/members/page.tsx already established, reused
  // verbatim rather than re-derived.
  const actorNames = Object.fromEntries(members.map((member) => [member.userId, member.displayName]));
  const recentActivity = (activityPage?.items ?? []).slice(0, ACTIVITY_ROW_LIMIT).map((event) => {
    const actorName = (event.actorId && actorNames[event.actorId]) || "A member";
    const { title, detail } = describeOrganizationActivity(event, actorName);
    return { id: event.id, title, detail, timestamp: formatDateTime(event.createdAt) };
  });

  // Bucketed straight from DOMAIN.md's own lifecycle: `needs_information` means the ball is
  // in the researcher's court, every other non-terminal status means it's the
  // organization's turn -- never a third, invented "priority" concept.
  const needsAttention = openReports.filter((report) => report.status !== "needs_information").slice(0, ATTENTION_ROW_LIMIT);
  const waitingOnResearchers = openReports.filter((report) => report.status === "needs_information").slice(0, ATTENTION_ROW_LIMIT);
  const openCountByProgram = new Map<string, number>();
  for (const report of openReports) openCountByProgram.set(report.programId, (openCountByProgram.get(report.programId) ?? 0) + 1);
  const snapshotMayUndercount = openReports.length === OPEN_REPORTS_OVERVIEW_LIMIT;

  // The operational priority zone's own data -- derived entirely from openReports
  // (already fetched above), no new query. unresolvedCritical/HighCount is a real count
  // across the FULL open snapshot (never the already-capped needsAttention/
  // waitingOnResearchers slices, since a critical report could rank outside the first
  // ATTENTION_ROW_LIMIT by recency but must never be invisible to this count). The single
  // most urgent action re-ranks the org's own actionable reports (needs_information
  // excluded -- same "whose turn" rule as needsAttention above) by severity first, then
  // most-recently-updated within the same severity -- never a new status/priority concept,
  // just a different sort of data that already exists.
  const unresolvedCriticalCount = openReports.filter((report) => report.confirmedSeverity === "critical").length;
  const unresolvedHighCount = openReports.filter((report) => report.confirmedSeverity === "high").length;
  const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
  const mostUrgentReport = openReports
    .filter((report) => report.status !== "needs_information")
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.confirmedSeverity ?? "none"] - SEVERITY_RANK[b.confirmedSeverity ?? "none"])[0];

  return (
    // The organization's own name is already the most prominent thing on this page --
    // OrganizationHeader's own h2, right below. AppShell's title is the page-level
    // landmark (matches every other section's own page title, e.g. "Members",
    // "Settings", "Triage inbox"), not a second copy of the entity name. "Home," not
    // "Overview" -- this page now covers the full command-center brief (open findings,
    // active programs/engagements, upcoming actions, recent activity), not just a report
    // snapshot; OrganizationHeader's own "overview" tab id/route are unchanged (no new
    // route, no duplicate page -- this recomposes the existing Overview page in place).
    <AppShell title="Home" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationId={organizationId} organizationName={organization?.name ?? "Organization"} active="overview" />

        {/* Read-only and purely informational -- only a platform admin can lift a
            suspension (see supabase/migrations/202609050016_organization_status_control.sql
            and 202609050017_organization_operability_gate.sql), so this banner has no
            dismiss action; an organization member should see this state, not just get
            surprised by write failures once create_program/invite_organization_member/
            invite_researcher_to_program/submit_program_for_review/change_member_role start
            rejecting with ORGANIZATION_SUSPENDED. */}
        {organization?.status === "suspended" && (
          <Alert tone="danger" title="This organization is suspended">
            This organization is suspended by Unpatched. Contact support for details.
          </Alert>
        )}

        {/* Active programs/engagements at a glance -- a plain inline tally, never a card
            grid or a fabricated KPI: every number is a real count from `programs`
            (already fetched above), using only real ProgramStatus values. Hidden when
            there are zero programs -- the "No programs yet" empty state below already
            covers that case, so this strip would otherwise show a redundant "0 active"
            row with nothing else on the page to give it context. */}
        {programs.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <SectionLabel className="shrink-0">Engagements</SectionLabel>
            {PROGRAM_STATUS_ORDER.filter((status) => (programCountByStatus.get(status) ?? 0) > 0).map((status) => (
              <span key={status} className="font-mono tabular-nums text-ink-muted">
                <span className="font-semibold text-ink">{programCountByStatus.get(status)}</span> {PROGRAM_STATUS_LABEL[status].toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {/* Operational priority zone -- the one dominant moment on this page, answering
            "what needs my decision right now." Severity-first, dense, controlled: a
            security-operations visual language, deliberately not CommandRow's dark panel/
            glow treatment (that's the researcher context's own workstation language, see
            components/dashboard/command-row.tsx). Every number and the single most urgent
            report are derived entirely from openReports, already fetched above -- no new
            query, no new status/priority concept beyond severity + the existing
            needs_information "whose turn" rule. Hidden entirely when there is no open
            report at all -- an org with a clean queue gets no fabricated "0 critical"
            anxiety strip, matching this codebase's own honest-empty-state convention. */}
        {mostUrgentReport && (
          <div className="rounded-lg border-2 border-ink bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <SectionLabel>Operational priority</SectionLabel>
              <div className="flex items-baseline gap-4 font-mono text-xs">
                <span className={unresolvedCriticalCount > 0 ? "font-semibold text-severity-critical" : "text-ink-muted"}>
                  <span className="text-base tabular-nums">{unresolvedCriticalCount}</span> critical
                </span>
                <span className={unresolvedHighCount > 0 ? "font-semibold text-severity-high" : "text-ink-muted"}>
                  <span className="text-base tabular-nums">{unresolvedHighCount}</span> high
                </span>
              </div>
            </div>

            <Link
              href={`/organizations/${organizationId}/programs/${mostUrgentReport.programId}/reports/${mostUrgentReport.id}` as Route}
              className="mt-3 block rounded-md transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <div className="flex flex-wrap items-center gap-2">
                {mostUrgentReport.confirmedSeverity && <SeverityBadge severity={mostUrgentReport.confirmedSeverity} />}
                <span className="font-medium text-ink">{mostUrgentReport.title}</span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <AssetTypeBadge assetType={mostUrgentReport.assetType} />
                <span>{programNameById.get(mostUrgentReport.programId) ?? "Unknown program"}</span>
                <span>·</span>
                <span>{formatDateTime(mostUrgentReport.updatedAt)}</span>
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <StatusBadge status={mostUrgentReport.status} />
                <span className="font-medium text-action">{reportNextActionLabel(mostUrgentReport.status)} →</span>
              </p>
            </Link>
          </div>
        )}

        {programs.length === 0 ? (
          <EmptyState title="No engagements yet">
            {canCreateProgram(actor.role) ? "Create an engagement to define scope and start receiving reports." : "You do not currently manage any engagement in this organization."}
          </EmptyState>
        ) : (
          <>
            <div>
              <SectionLabel>Needs your action</SectionLabel>
              <h2 className="mt-0.5 text-base font-semibold text-ink">Needs your attention</h2>
              {needsAttention.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Nothing needs your attention right now.</p>
              ) : (
                <RegistryList className="mt-2">
                  {needsAttention.map((report) => (
                    <ReportRow key={report.id} organizationId={organizationId} report={report} programName={programNameById.get(report.programId) ?? "Unknown program"} />
                  ))}
                </RegistryList>
              )}
            </div>

            {/* Deliberately quieter than "Needs your action" above -- same SectionLabel
                size, but text-ink-muted rather than text-ink, and the h2 drops to
                font-medium: the organization does not own the next move here, so this
                section should read as secondary at a glance, not equal-weight with the
                section it follows. */}
            {waitingOnResearchers.length > 0 && (
              <div>
                <SectionLabel>Waiting on researcher</SectionLabel>
                <h2 className="mt-0.5 text-base font-medium text-ink-muted">Not your turn yet</h2>
                <RegistryList className="mt-2">
                  {waitingOnResearchers.map((report) => (
                    <ReportRow key={report.id} organizationId={organizationId} report={report} programName={programNameById.get(report.programId) ?? "Unknown program"} ownership="waiting" />
                  ))}
                </RegistryList>
              </div>
            )}

            {/* A researcher's request to publish a resolved report publicly -- never
                acted on here, only surfaced; the actual approve/decline decision happens
                on the report's own page (OrganizationDisclosureDecisionPanel), the same
                place every other triage decision is made. See
                supabase/migrations/202609030001_report_disclosure_workflow.sql. */}
            {pendingDisclosures.length > 0 && (
              <div>
                <SectionLabel>Disclosure</SectionLabel>
                <h2 className="mt-0.5 text-base font-semibold text-ink">Disclosure requests</h2>
                <RegistryList className="mt-2">
                  {pendingDisclosures.map((request) => (
                    <li key={request.id}>
                      <Link
                        href={`/organizations/${organizationId}/programs/${request.programId}/reports/${request.reportId}` as Route}
                        className="block px-4 py-3 transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5"
                      >
                        <span className="font-medium text-ink">{request.reportTitle}</span>
                        <p className="mt-1 text-sm text-ink-muted">
                          Requested by {request.researcherDisplayName} · {request.programName} · {formatDateTime(request.requestedAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </RegistryList>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <SectionLabel>Portfolio</SectionLabel>
                  <h2 className="mt-0.5 text-base font-semibold text-ink">Engagements</h2>
                </div>
                <Link href={`/organizations/${organizationId}/programs` as Route} className="text-sm font-medium text-action hover:text-action-hover">
                  View all engagements →
                </Link>
              </div>
              <RegistryList className="mt-2">
                {programs.map((program) => (
                  <li key={program.id}>
                    <Link
                      href={`/organizations/${organizationId}/programs/${program.id}` as Route}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-ink">{program.name}</span>
                        <ProgramStatusBadge status={program.status} />
                      </span>
                      <span className="text-sm text-ink-muted">
                        {openCountByProgram.get(program.id) ?? 0}
                        {snapshotMayUndercount ? "+" : ""} open
                      </span>
                    </Link>
                  </li>
                ))}
              </RegistryList>
            </div>
          </>
        )}

        {/* "Upcoming actions" + "Recent organization activity" -- the two Home-brief
            zones with no existing home on Overview/Analytics before this pass. Both are
            owner/security_admin-only real data (see canSeeAdminActivity above), so this
            entire block is absent for any other active member rather than showing an
            empty/misleading version of admin-only information. Two columns on a wide
            viewport, stacked on narrow -- neither is the page's dominant zone (Operational
            priority above still is), so this reads as supporting context, not a second
            headline. */}
        {canSeeAdminActivity && (expiringInvitations.length > 0 || recentActivity.length > 0) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {expiringInvitations.length > 0 && (
              <div>
                <SectionLabel>Upcoming</SectionLabel>
                <h2 className="mt-0.5 text-base font-semibold text-ink">Invitations expiring soon</h2>
                <RegistryList className="mt-2">
                  {expiringInvitations.map((invitation) => (
                    <li key={invitation.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{invitation.email}</span>
                        <span className="block text-sm text-ink-muted">{invitation.role}</span>
                      </span>
                      <span className="shrink-0 text-sm text-ink-muted">Expires {formatDate(invitation.expiresAt)}</span>
                    </li>
                  ))}
                </RegistryList>
              </div>
            )}

            {recentActivity.length > 0 && (
              <div>
                <SectionLabel>Activity</SectionLabel>
                <h2 className="mt-0.5 text-base font-semibold text-ink">Recent organization activity</h2>
                <div className="mt-2">
                  <ActivityTimeline items={recentActivity} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Was gated on programs.length > 0 -- the exact moment a brand-new organization
            (zero programs) needs this most: the "No programs yet" empty state above names
            "Create a program" as the action but had no control anywhere on this page to
            actually do it, forcing a detour to /organizations/{id}/programs (which already
            gates this correctly, canCreate alone). Reusing that page's own dynamic-label
            pattern verbatim, not inventing new copy. */}
        {canCreateProgram(actor.role) && (
          <div>
            <CreateProgramDialog organizationId={organizationId} triggerLabel={programs.length === 0 ? "Create engagement" : "Create another engagement"} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
