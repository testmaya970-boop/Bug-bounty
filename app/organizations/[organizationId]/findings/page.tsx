import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationFindingsTable } from "../../../../components/organizations/organization-findings-table";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../services/programs";
import { listAssignableStaff, listReportsForOrganization } from "../../../../services/reports";
import { getOrganizationSlaSummary } from "../../../../services/program-policy";
import { getOrganizationResolutionPerformance } from "../../../../services/organization-analytics";
import { canViewOrganizationAnalytics } from "../../../../services/authorization";
import { REPORT_SEVERITIES, REPORT_STATUSES, type OrganizationReportSummary, type ReportSeverity, type ReportStatus } from "../../../../types/report";
import { ShieldCheck, Download, Flame, ArrowUpRight } from "lucide-react";

const PAGE_SIZE = 25;

export default async function OrganizationFindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ page?: string; cursor?: string; status?: string; severity?: string; program?: string; assignee?: string; q?: string; sort?: string }>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const status = query.status && (REPORT_STATUSES as readonly string[]).includes(query.status) ? (query.status as ReportStatus) : undefined;
  const severity =
    query.severity && (REPORT_SEVERITIES as readonly string[]).includes(query.severity)
      ? (query.severity as ReportSeverity)
      : undefined;
  const programId = query.program && query.program !== "all" ? query.program : undefined;
  const search = query.q?.trim() ? query.q.trim() : undefined;
  const sort = query.sort === "oldest" ? "oldest" : "newest";

  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/findings` as Route);

  const assigneeFilter: "me" | "unassigned" | string | undefined =
    query.assignee === "me"
      ? "me"
      : query.assignee === "unassigned"
        ? "unassigned"
        : query.assignee && query.assignee !== "all"
          ? query.assignee
          : undefined;

  const [organizations, actorMembership] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    getActorMembership(user.id, organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);

  if (!organization || !actorMembership || actorMembership.status !== "active" || actorMembership.role === "billing_admin") {
    return (
      <AppShell title="Findings" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization&apos;s findings.</PermissionDenied>
      </AppShell>
    );
  }

  const [reportsPage, programs, staff, slaSummary, resolution] = await Promise.all([
    listReportsForOrganization(organizationId, query.cursor, PAGE_SIZE, {
      status,
      severity,
      programId,
      assignee: assigneeFilter,
      query: search,
      sort,
    }),
    listProgramsForOrganization(organizationId),
    listAssignableStaff(organizationId),
    getOrganizationSlaSummary(organizationId).catch(() => []),
    canViewOrganizationAnalytics(actorMembership.role) ? getOrganizationResolutionPerformance(organizationId).catch(() => null) : Promise.resolve(null),
  ]);

  const programsById = new Map(programs.map((p) => [p.id, p.name]));
  const enrichedReports: OrganizationReportSummary[] = reportsPage.items.map((report) => ({
    ...report,
    programName: programsById.get(report.programId) ?? "Security Engagement",
  }));

  // Flagship critical finding for 1-click executive inspection
  const flagshipReport =
    enrichedReports.find((r) => r.confirmedSeverity === "critical") ??
    enrichedReports[0];

  return (
    <AppShell title={organization.name} user={user} organizationId={organizationId}>
      <div className="-mx-4 -my-6 min-h-screen bg-[#F6F8FB] px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-[1440px] space-y-5">
          {/* EXECUTIVE FINDINGS HEADER HERO */}
          <section className="rounded-[16px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#475467]">
                    {organization.name}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[12px] font-semibold text-[#2563EB]">
                    <ShieldCheck className="size-3.5" />
                    Security Triage Operations
                  </span>
                  <span className="rounded-full bg-[#F2F4F7] px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#475467]">
                    CVSS v3.1 &amp; v4.0 Enabled
                  </span>
                </div>
                <h1 className="text-[24px] font-bold tracking-tight text-[#111827] sm:text-[28px]">
                  Vulnerability Findings &amp; Triage Queue
                </h1>
                <p className="max-w-3xl text-[14px] text-[#475467]">
                  Centralized vulnerability intake across all active engagements for <span className="font-semibold text-[#111827]">{organization.name}</span>. Validate researcher proof-of-concepts, enforce response SLAs, and orchestrate bounty decisions.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {flagshipReport && (
                  <Link
                    href={`/organizations/${organizationId}/programs/${flagshipReport.programId}/reports/${flagshipReport.id}` as Route}
                    prefetch={false}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF3F2] px-4 py-2 text-[13px] font-semibold text-[#B91C1C] shadow-2xs transition hover:bg-[#FEE2E2]"
                  >
                    <Flame className="size-4 text-[#EF4444]" />
                    Inspect Critical Finding (#{flagshipReport.id.slice(-4)})
                    <ArrowUpRight className="size-4" />
                  </Link>
                )}
                <a
                  href={`/api/organizations/${organizationId}/reports/export`}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#344054] shadow-2xs transition hover:bg-[#F8FAFC]"
                >
                  <Download className="size-4 text-[#667085]" />
                  Export CSV
                </a>
              </div>
            </div>
          </section>

          <OrganizationFindingsTable
            organizationId={organizationId}
            reports={enrichedReports}
            total={enrichedReports.length}
            page={page}
            pageSize={PAGE_SIZE}
            programs={programs.map((program) => ({ id: program.id, name: program.name }))}
            staff={staff}
            currentUserId={user.id}
            slaComplianceRate={(() => {
              const tracked = slaSummary.reduce((n, x) => n + x.firstResponse.tracked, 0);
              const breached = slaSummary.reduce((n, x) => n + x.firstResponse.breached, 0);
              return tracked > 0 ? Math.round(((tracked - breached) / tracked) * 1000) / 10 : null;
            })()}
            medianTriageHours={resolution?.medianHoursToFirstTriage ?? null}
          />
        </div>
      </div>
    </AppShell>
  );
}
