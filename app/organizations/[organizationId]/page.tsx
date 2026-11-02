import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { Alert, PermissionDenied } from "../../../components/ui/feedback";
import { OnboardingChecklist } from "../../../components/organizations/onboarding-checklist";
import {
  ExecutiveDashboard,
  type ExecutiveActivityItem,
} from "../../../components/organizations/executive-dashboard";
import { getOrganizationOnboarding } from "../../../services/onboarding";
import { getOrganizationLogoVersion } from "../../../services/organization-logos";
import {
  canManageMembers,
  canManagePayments,
  canViewOrganizationAnalytics,
  canViewOrganizationResearchers,
} from "../../../services/authorization";
import {
  getActorMembership,
  getOrganizationAuditActivity,
  listOrganizationMembers,
} from "../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../services/organizations";
import { listProgramsForOrganization } from "../../../services/programs";
import { listOpenReportsForOrganization } from "../../../services/reports";
import {
  getOrganizationBountySpendSummary,
  getOrganizationResolutionPerformance,
  listResearchersForOrganization,
} from "../../../services/organization-analytics";
import { getOrganizationSlaSummary } from "../../../services/program-policy";
import { listOrganizationAssets } from "../../../services/scope";
import { listOrganizationDomains } from "../../../services/organization-domains";
import { formatMoney } from "../../../lib/money";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { describeOrganizationActivity } from "../../../lib/organization-activity-labels";
import { perfTimed } from "../../../lib/perf-trace";

const ACTIVITY_ROW_LIMIT = 6;
const ACTION_QUEUE_LIMIT = 8;
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

function classifyAuditCategory(action: string): ExecutiveActivityItem["category"] {
  if (action.startsWith("report.")) return "Report submitted";
  if (action.startsWith("bounty.") || action.startsWith("payment.")) return "Bounty paid";
  if (action.startsWith("researcher.")) return "Researcher joined";
  if (action.startsWith("scope.")) return "Domain verified";
  if (action.startsWith("program.")) return "Program published";
  return "Audit event";
}

export default async function OrganizationOverviewPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  return perfTimed("route: org dashboard (total)", () =>
    renderOrganizationOverviewPage(params),
  );
}

async function renderOrganizationOverviewPage(
  paramsPromise: Promise<{ organizationId: string }>,
) {
  const { organizationId } = await paramsPromise;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}` as Route);

  const actor = await perfTimed("org dashboard: getActorMembership", () =>
    getActorMembership(user.id, organizationId),
  );
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Home" user={user} organizationId={organizationId}>
        <PermissionDenied>
          You do not have access to this organization.
        </PermissionDenied>
      </AppShell>
    );
  }

  const canSeeAdminActivity = canManageMembers(actor.role);

  const [
    organizations,
    programs,
    openReports,
    members,
    activityPage,
    resolutionPerformance,
    bountySpendSummary,
    onboarding,
    logoVersion,
    researchers,
    slaSummary,
    assetPage,
    domains,
  ] = await perfTimed("org dashboard: main Promise.all", () =>
    Promise.all([
      listCurrentUserOrganizations(user.id),
      listProgramsForOrganization(organizationId),
      listOpenReportsForOrganization(organizationId),
      canSeeAdminActivity ? listOrganizationMembers(organizationId) : Promise.resolve([]),
      canSeeAdminActivity ? getOrganizationAuditActivity(organizationId) : Promise.resolve(null),
      canViewOrganizationAnalytics(actor.role)
        ? getOrganizationResolutionPerformance(organizationId)
        : Promise.resolve(null),
      canManagePayments(actor.role)
        ? getOrganizationBountySpendSummary(organizationId)
        : Promise.resolve(null),
      canSeeAdminActivity ? getOrganizationOnboarding(organizationId) : Promise.resolve(null),
      getOrganizationLogoVersion(organizationId),
      canViewOrganizationResearchers(actor.role) ? listResearchersForOrganization(organizationId) : Promise.resolve([]),
      getOrganizationSlaSummary(organizationId).catch(() => []),
      listOrganizationAssets(organizationId).catch(() => null),
      canSeeAdminActivity ? listOrganizationDomains(organizationId).catch(() => []) : Promise.resolve([]),
    ]),
  );

  const organization = organizations.find((org) => org.id === organizationId);
  const actorNames = Object.fromEntries(
    members.map((member) => [member.userId, member.displayName]),
  );

  const mappedAuditItems: ExecutiveActivityItem[] = (activityPage?.items ?? [])
    .slice(0, ACTIVITY_ROW_LIMIT)
    .map((event) => {
      const actorName = (event.actorId && actorNames[event.actorId]) || "A member";
      const { title, detail } = describeOrganizationActivity(event, actorName);
      return {
        id: event.id,
        category: classifyAuditCategory(event.action),
        title,
        detail,
        timestampIso: event.createdAt,
      };
    });

  // Real audit events only; the feed shows an empty state when there are none.
  const timelineItems: ExecutiveActivityItem[] = mappedAuditItems.slice(0, ACTIVITY_ROW_LIMIT);

  // Most active researcher: most resolved reports here, then most recent submission.
  const top = researchers
    .filter((r) => r.resolvedCount > 0)
    .sort((a, b) => b.resolvedCount - a.resolvedCount || (b.lastSubmittedAt ?? "").localeCompare(a.lastSubmittedAt ?? ""))[0];
  const topResearcher = top ? { displayName: top.displayName, username: top.username ?? null, resolvedCount: top.resolvedCount } : null;

  // First-response SLA adherence across programs with a published SLA.
  const slaTracked = slaSummary.reduce((n, s) => n + s.firstResponse.tracked, 0);
  const slaBreached = slaSummary.reduce((n, s) => n + s.firstResponse.breached, 0);
  const slaAdherencePercent = slaTracked > 0 ? Math.round(((slaTracked - slaBreached) / slaTracked) * 1000) / 10 : null;

  const actionQueue = openReports
    .filter((report) => report.status !== "needs_information")
    .slice()
    .sort((a, b) => {
      const severityDiff =
        SEVERITY_RANK[a.confirmedSeverity ?? "none"] -
        SEVERITY_RANK[b.confirmedSeverity ?? "none"];
      if (severityDiff !== 0) return severityDiff;
      return a.updatedAt.localeCompare(b.updatedAt);
    })
    .slice(0, ACTION_QUEUE_LIMIT);

  const totalPaidFormatted =
    bountySpendSummary && bountySpendSummary.length > 0
      ? bountySpendSummary
          .map((summary) => formatMoney(summary.totalPaidMinorUnits, summary.currency))
          .join(", ")
      : "None yet";

  const totalAwardCount =
    bountySpendSummary?.reduce((acc, item) => acc + item.awardCount, 0) ?? 0;

  const agingOver30DaysCount =
    (resolutionPerformance?.aging31To60DaysCount ?? 0) +
    (resolutionPerformance?.agingOver60DaysCount ?? 0);

  return (
    <AppShell title="Home" user={user} organizationId={organizationId}>
      <div className="-mx-4 -my-5 sm:-mx-6 lg:-mx-8">
        <ExecutiveDashboard
          organizationId={organizationId}
          organizationName={organization?.name ?? "Organization"}
          organizationSlug={organization?.slug ?? "organization"}
          organizationStatus={organization?.status ?? "active"}
          actorRole={actor.role}
          logoVersion={logoVersion}
          user={{
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            username: user.username,
          }}
          organizations={organizations}
          programs={programs}
          openReports={openReports}
          actionQueue={actionQueue}
          memberCount={Math.max(members.length, 2)}
          medianHoursToFirstTriage={
            resolutionPerformance?.medianHoursToFirstTriage ?? null
          }
          medianDaysToResolution={
            resolutionPerformance?.medianDaysToResolution ?? null
          }
          aging0To7DaysCount={resolutionPerformance?.aging0To7DaysCount ?? openReports.length}
          aging8To30DaysCount={resolutionPerformance?.aging8To30DaysCount ?? 0}
          agingOver30DaysCount={agingOver30DaysCount}
          totalPaidFormatted={totalPaidFormatted}
          totalAwardCount={totalAwardCount}
          canSeeAdminActivity={canSeeAdminActivity}
          recentActivity={timelineItems}
          topResearcher={topResearcher}
          slaAdherencePercent={slaAdherencePercent}
          assetCount={assetPage ? { count: assetPage.items.length, more: assetPage.nextCursor !== null } : null}
          domains={domains.map((d) => ({ domain: d.domain, status: d.status, verifiedAt: d.verifiedAt }))}
          researcherCount={canViewOrganizationResearchers(actor.role) ? researchers.length : null}
          researchersByProgram={Object.fromEntries(
            programs.map((program) => [program.id, researchers.filter((r) => r.programs.some((p) => p.programId === program.id && p.status === "active")).length]),
          )}
          onboardingSlot={
            onboarding ? (
              <OnboardingChecklist
                onboarding={onboarding}
                organizationId={organizationId}
              />
            ) : undefined
          }
          suspendedAlertSlot={
            organization?.status === "suspended" ? (
              <Alert tone="danger" title="This organization is suspended">
                This organization is suspended by Unpatched. Contact support for details.
              </Alert>
            ) : undefined
          }
        />
      </div>
    </AppShell>
  );
}
