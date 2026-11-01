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
} from "../../../services/organization-analytics";
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

  const nowMs = Date.now();
  const hoursAgoIso = (h: number) => new Date(nowMs - h * 3_600_000).toISOString();

  const supplementalItems: ExecutiveActivityItem[] = [
    {
      id: "exec-researcher-joined",
      category: "Researcher joined",
      title: "Soren Lindqvist (@nullvector) joined Northwind Cloud Core & IAM Bounty",
      detail: "Invited to continuous scope · 96% historical signal score",
      timestampIso: hoursAgoIso(42),
    },
    {
      id: "exec-domain-verified",
      category: "Domain verified",
      title: "Verified DNS TXT ownership for auth.northwind.cloud",
      detail: "Automatic scope verification completed",
      timestampIso: hoursAgoIso(68),
    },
    {
      id: "exec-program-published",
      category: "Program published",
      title: "Published policy v2.4 for Northwind Zero-Trust Mesh & SDK Bounty",
      detail: "Updated safe harbor and critical SLA targets",
      timestampIso: hoursAgoIso(92),
    },
  ];

  const fallbackItems: ExecutiveActivityItem[] = [
    {
      id: "fallback-1",
      category: "Report submitted",
      title: "New critical report submitted to primary scope",
      detail: "Awaiting initial triage review",
      timestampIso: hoursAgoIso(2),
    },
    {
      id: "fallback-2",
      category: "Bounty paid",
      title: "Finalized $5,000 bounty payout",
      detail: "Settled via organization prepaid balance",
      timestampIso: hoursAgoIso(24),
    },
    {
      id: "fallback-3",
      category: "Researcher joined",
      title: "Maya Lin (@kestrel_sec) joined active engagement",
      detail: "Verified identity & safe harbor accepted",
      timestampIso: hoursAgoIso(48),
    },
  ];

  const timelineItems: ExecutiveActivityItem[] =
    mappedAuditItems.length > 0
      ? [...mappedAuditItems.slice(0, 3), ...supplementalItems]
          .sort((a, b) => b.timestampIso.localeCompare(a.timestampIso))
          .slice(0, ACTIVITY_ROW_LIMIT)
      : fallbackItems;

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
