import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../../components/ui/feedback";
import { ProgramHeader } from "../../../../../../components/programs/program-header";
import { InboxReportList } from "../../../../../../components/reports/inbox-report-list";
import { InboxNoSelection, InboxReportNotFound, InboxSelectedReport } from "../../../../../../components/reports/inbox-detail-panes";
import { canCreateProgram } from "../../../../../../services/authorization";
import { getActorMembership } from "../../../../../../services/organization-members";
import { getProgram, listProgramMembers, listProgramsForOrganization } from "../../../../../../services/programs";
import { listReportsForProgram } from "../../../../../../services/reports";
import { getCurrentUser } from "../../../../../../lib/auth/current-user";
import { perfTimed } from "../../../../../../lib/perf-trace";

// A plain shape check, not a full RFC 4122 validator -- matches this codebase's own
// light-validation-for-a-URL-param convention elsewhere (e.g. the Findings page's own
// parseEngagementTypeParam). Anything failing this is treated identically to a
// well-formed-but-nonexistent/inaccessible id below -- both are "not a real, reachable
// report in this program," and neither should render any differently, so a malformed
// value never reaches a query or a 500.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ReportDetailSkeleton() {
  return (
    <div className="grid h-full grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]" role="status" aria-label="Loading report">
      <div className="space-y-4 border-b border-border p-5 xl:border-b-0 xl:border-r">
        <div className="h-5 w-2/3 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
        <div className="h-24 w-full animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      </div>
      <div className="space-y-4 p-5">
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
        <div className="h-8 w-full animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
        <div className="h-8 w-full animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}

/**
 * Program Inbox: a 3-column triage working view for one program's reports (left: compact
 * list, middle: submission + merged timeline, right: quick triage actions) -- distinct
 * from the dense full-table "Reports" surface at .../reports, which stays the place for
 * filtering/scanning/bulk actions across many reports at once. Both operate on the exact
 * same real data (listReportsForProgram, the same RLS-scoped read the Reports page already
 * uses) and the exact same manager-only authorization gate; this is a second working shape
 * over one inbox, never a second dataset or a second permission model.
 *
 * `?reportId=` is the sole source of selection state -- a plain URL search param, not
 * client state, so the selected report is shareable, bookmarkable, and back-button
 * navigable (matching this codebase's own "the URL is the source of truth for filters"
 * convention already established on the Reports/Findings pages).
 *
 * The left pane's own data (listReportsForProgram) is awaited directly in this Server
 * Component -- it is cheap and should render immediately. The selected report's much
 * heavier detail (report row + merged audit/message timeline, two additional queries) is
 * deferred into <InboxSelectedReport>, wrapped in its own <Suspense> boundary keyed on the
 * reportId, so switching reports shows the list instantly and only the detail panes show a
 * loading skeleton while the new report's data streams in -- never a full-page reload.
 */
export default async function ProgramInboxPage(props: {
  params: Promise<{ organizationId: string; programId: string }>;
  searchParams: Promise<{ reportId?: string }>;
}) {
  return perfTimed("route: inbox (total)", () => renderProgramInboxPage(props));
}

async function renderProgramInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; programId: string }>;
  searchParams: Promise<{ reportId?: string }>;
}) {
  const { organizationId, programId } = await params;
  const { reportId: selectedReportId } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}/inbox` as Route);

  const program = await perfTimed("inbox: getProgram", () => getProgram(programId));
  if (!program || program.organizationId !== organizationId) {
    return (
      <AppShell title="Inbox" user={user} organizationId={organizationId}>
        <PermissionDenied>This program does not exist, or you do not have access to it.</PermissionDenied>
      </AppShell>
    );
  }

  const [members, actorMembership] = await perfTimed("inbox: membership batch", () => Promise.all([listProgramMembers(programId), getActorMembership(user.id, organizationId)]));
  // program_members (202609250012): "manager" runs the program; any assignment, including
  // "triager", works its reports. The database enforces the same split.
  const isProgramManager = members.some((member) => member.userId === user.id && member.role === "manager");
  const isProgramTriager = members.some((member) => member.userId === user.id);
  const isOrgAdmin = Boolean(actorMembership && actorMembership.status === "active" && canCreateProgram(actorMembership.role));
  const canManageProgram = isProgramManager || isOrgAdmin;

  if (!(canManageProgram || isProgramTriager)) {
    return (
      <AppShell title="Inbox" user={user} organizationId={organizationId}>
        <PermissionDenied>Only this program&apos;s assigned team or an organization admin can open the inbox. Your own reports are available at /reports.</PermissionDenied>
      </AppShell>
    );
  }

  const [{ items: reports }, organizationPrograms] = await Promise.all([
    perfTimed("inbox: listReportsForProgram", () => listReportsForProgram(programId)),
    // Program switcher's own data (item 11, Turn 6) -- inbox is already manager/admin-only
    // past the canManageProgram check above, so unlike the program overview page this
    // needs no conditional.
    perfTimed("inbox: listProgramsForOrganization", () => listProgramsForOrganization(organizationId)),
  ]);
  const actorNames: Record<string, string> = { [user.id]: user.displayName };
  members.forEach((member) => {
    actorNames[member.userId] = member.displayName;
  });

  // Three distinct cases, not two: no reportId at all (InboxNoSelection -- the ordinary
  // "you haven't picked one yet" resting state), a reportId that IS present but doesn't
  // resolve to a real, accessible report in THIS program (InboxReportNotFound -- covers
  // both a malformed value and a well-formed id belonging to another program/org
  // entirely, deliberately treated identically: never distinguishing "exists but you
  // can't access it" from "doesn't exist" avoids leaking existence across a permission
  // boundary, the same posture the report detail page's own null-covers-both-cases
  // comment already documents), and a reportId that resolves (renders the real detail).
  // Never trusted to render InboxSelectedReport with an id from another program/org --
  // that component independently re-validates it too, but resolving it here first keeps
  // the left pane's own "selected" highlight honest and lets the page render the correct
  // one of these three states without an extra query.
  const reportIdProvided = Boolean(selectedReportId);
  const validSelectedReportId = selectedReportId && UUID_PATTERN.test(selectedReportId) && reports.some((report) => report.id === selectedReportId) ? selectedReportId : null;
  const reportIdNotFound = reportIdProvided && !validSelectedReportId;

  return (
    <AppShell title="Inbox" user={user} organizationId={organizationId}>
      {/* Fills the window on large screens: 100dvh minus the shell header (4rem), main padding
          (2 x 2rem) and page title (~4rem). Below lg it flows and the page scrolls. Never shorter
          than 44rem: on a short window the page scrolls instead of squashing the panes. */}
      <div className="flex min-h-[44rem] max-w-[100rem] flex-col space-y-4 lg:h-[calc(100dvh-12rem)]">
        <div className="shrink-0 space-y-4">
          <Breadcrumbs
            items={[
              { label: "Organizations", href: "/organizations" },
              { label: "Engagements", href: `/organizations/${organizationId}/programs` },
              { label: program.name, href: `/organizations/${organizationId}/programs/${programId}` },
              { label: "Inbox" },
            ]}
          />
          <ProgramHeader
            organizationId={organizationId}
            programId={programId}
            programName={program.name}
            status={program.status}
            active="inbox"
            canManage={canManageProgram}
            canWorkReports
            siblingPrograms={organizationPrograms.filter((p) => p.id !== programId).map((p) => ({ id: p.id, name: p.name, status: p.status }))}
          />
        </div>

        {/* min-h: on a short window the page scrolls instead of squashing the panes. */}
        <div className="grid min-h-[32rem] flex-1 grid-cols-1 overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-border lg:border-b-0 lg:border-r">
            <InboxReportList
              reports={reports}
              selectedReportId={validSelectedReportId}
              buildHref={(reportId) => `/organizations/${organizationId}/programs/${programId}/inbox?reportId=${reportId}` as Route}
            />
          </div>

          <div className="min-h-0 overflow-y-auto">
            {validSelectedReportId ? (
              <Suspense key={validSelectedReportId} fallback={<ReportDetailSkeleton />}>
                <InboxSelectedReport organizationId={organizationId} programId={programId} reportId={validSelectedReportId} actorNames={actorNames} canFinalize={isOrgAdmin || isProgramManager} />
              </Suspense>
            ) : reportIdNotFound ? (
              <InboxReportNotFound />
            ) : (
              <InboxNoSelection />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
