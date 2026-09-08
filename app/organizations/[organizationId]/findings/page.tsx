import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { OrganizationFindingsTable } from "../../../../components/organizations/organization-findings-table";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { listReportsForOrganization } from "../../../../services/reports";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import type { ReportSeverity, ReportStatus } from "../../../../types/report";

const VALID_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];
const VALID_SEVERITIES: ReportSeverity[] = ["none", "low", "medium", "high", "critical"];

/**
 * Findings: every report across every one of this organization's engagements, one flat,
 * filterable, paginated list -- the cross-program counterpart to the per-program triage
 * inbox (app/organizations/[organizationId]/programs/[programId]/reports), which stays
 * the surface that owns triage actions/bulk operations. Closes the gap in HackerOne's own
 * documented org nav (Home / Engagements / Findings / Inbox / Assets / Analytics /
 * Hacktivity) -- this app previously had no cross-program report view at all, only
 * per-program (the triage inbox) or per-status-bucket-and-open-only (the Home page's
 * "Needs your attention" snapshot).
 *
 * Access matches every other org-wide read surface (Analytics, Researchers): any active
 * organization member, not narrowed to owner/security_admin -- listReportsForOrganization
 * itself is RLS-scoped exactly like listReportsForProgram already is, so a plain member
 * who manages no program simply sees an empty (correctly narrowed) result, never a
 * permission error. See services/reports.ts's own comment on this.
 */
export default async function OrganizationFindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ program?: string; status?: string; severity?: string }>;
}) {
  const { organizationId } = await params;
  const { program: programParam, status: statusParam, severity: severityParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/findings` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Findings" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, programs] = await Promise.all([listCurrentUserOrganizations(user.id), listProgramsForOrganization(organizationId)]);
  const organization = organizations.find((org) => org.id === organizationId);

  const programId = programParam && programs.some((program) => program.id === programParam) ? programParam : "all";
  const status: ReportStatus | "all" = statusParam && VALID_STATUSES.includes(statusParam as ReportStatus) ? (statusParam as ReportStatus) : "all";
  const severity: ReportSeverity | "all" = severityParam && VALID_SEVERITIES.includes(severityParam as ReportSeverity) ? (severityParam as ReportSeverity) : "all";

  const { items: reports, nextCursor } = await listReportsForOrganization(organizationId, undefined, undefined, {
    programId: programId === "all" ? undefined : programId,
    status: status === "all" ? undefined : status,
    severity: severity === "all" ? undefined : severity,
  });

  return (
    <AppShell title="Findings" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationId={organizationId} organizationName={organization?.name ?? "Organization"} active="findings" />

        <p className="text-sm text-ink-muted">Every report across every engagement. Filter, scan, and open a report to act on it in its own engagement's triage inbox.</p>

        <OrganizationFindingsTable
          organizationId={organizationId}
          initialReports={reports}
          initialNextCursor={nextCursor}
          programId={programId}
          status={status}
          severity={severity}
          programOptions={programs.map((program) => ({ id: program.id, name: program.name }))}
        />
      </div>
    </AppShell>
  );
}
