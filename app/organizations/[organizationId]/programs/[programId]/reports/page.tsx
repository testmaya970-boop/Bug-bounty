import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../../components/ui/feedback";
import { ReportInboxTable } from "../../../../../../components/reports/report-inbox-table";
import { ProgramHeader } from "../../../../../../components/programs/program-header";
import { canCreateProgram } from "../../../../../../services/authorization";
import { getActorMembership } from "../../../../../../services/organization-members";
import { getProgram, listProgramMembers } from "../../../../../../services/programs";
import { getReportInboxWorkloadSummary, listReportsForProgram, listAssignableStaff } from "../../../../../../services/reports";
import { getCurrentUser } from "../../../../../../lib/auth/current-user";
import type { ReportSeverity, ReportStatus } from "../../../../../../types/report";

const VALID_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];
const VALID_SEVERITIES: ReportSeverity[] = ["none", "low", "medium", "high", "critical"];

/**
 * The organization's dedicated triage inbox -- a first-class surface optimized for
 * triage (filter, scan, act), distinct from the program control-center page's own
 * lighter "reports at a glance" summary. Manager-authorized only (the identical
 * canManageProgram predicate every other manager-facing surface on the program page
 * already uses) -- a researcher belongs on their own report list (/reports) or the
 * program page's researcher-facing summary, not this inbox.
 */
export default async function ProgramReportsInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; programId: string }>;
  searchParams: Promise<{ status?: string; severity?: string; assignee?: string }>;
}) {
  const { organizationId, programId } = await params;
  const { status: statusParam, severity: severityParam, assignee: assigneeParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}/reports` as Route);

  const program = await getProgram(programId);
  if (!program || program.organizationId !== organizationId) {
    return (
      <AppShell title="Triage inbox" user={user} organizationId={organizationId}>
        <PermissionDenied>This program does not exist, or you do not have access to it.</PermissionDenied>
      </AppShell>
    );
  }

  const [members, actorMembership] = await Promise.all([listProgramMembers(programId), getActorMembership(user.id, organizationId)]);
  // program_members (202609250012): "manager" runs the program; any assignment, including
  // "triager", works its reports.
  const isProgramManager = members.some((member) => member.userId === user.id && member.role === "manager");
  const isProgramTriager = members.some((member) => member.userId === user.id);
  const isOrgAdmin = Boolean(actorMembership && actorMembership.status === "active" && canCreateProgram(actorMembership.role));
  const canManageProgram = isProgramManager || isOrgAdmin;

  if (!(canManageProgram || isProgramTriager)) {
    return (
      <AppShell title="Triage inbox" user={user} organizationId={organizationId}>
        <PermissionDenied>Only this program&apos;s assigned team or an organization admin can open the triage inbox. Your own reports are available at /reports.</PermissionDenied>
      </AppShell>
    );
  }

  const status: ReportStatus | "all" = statusParam && VALID_STATUSES.includes(statusParam as ReportStatus) ? (statusParam as ReportStatus) : "all";
  const severity: ReportSeverity | "all" = severityParam && VALID_SEVERITIES.includes(severityParam as ReportSeverity) ? (severityParam as ReportSeverity) : "all";

  const assignee = assigneeParam === "me" || assigneeParam === "unassigned" || /^[0-9a-f-]{36}$/.test(assigneeParam ?? "") ? assigneeParam! : "all";

  const [{ items: reports, nextCursor }, workloadSummary, assignableStaff] = await Promise.all([
    listReportsForProgram(programId, undefined, undefined, {
      status: status === "all" ? undefined : status,
      severity: severity === "all" ? undefined : severity,
      assignee: assignee === "all" ? undefined : assignee,
    }),
    getReportInboxWorkloadSummary(programId),
    listAssignableStaff(organizationId, programId),
  ]);

  return (
    <AppShell title="Triage inbox" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: "Engagements", href: `/organizations/${organizationId}/programs` },
            { label: program.name, href: `/organizations/${organizationId}/programs/${programId}` },
            { label: "Triage inbox" },
          ]}
        />
        <ProgramHeader organizationId={organizationId} programId={programId} programName={program.name} status={program.status} active="reports" canManage={canManageProgram} canWorkReports />

        <p className="text-sm text-ink-muted">Every report submitted to this program. Filter, scan, and open a report to act on it.</p>

        <div className="rounded-lg border border-border bg-surface">
          <ReportInboxTable organizationId={organizationId} programId={programId} initialReports={reports} initialNextCursor={nextCursor} status={status} severity={severity} workloadSummary={workloadSummary} assignee={assignee} assignableStaff={assignableStaff} />
        </div>
      </div>
    </AppShell>
  );
}
