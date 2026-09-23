import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AssetTypeBadge, SeverityBadge, StatusBadge } from "../ui/badge";
import { SectionLabel, MetadataPair } from "../ui/security-primitives";
import { EmptyState } from "../ui/feedback";
import { Markdown } from "../ui/markdown";
import { InboxTimeline } from "./inbox-timeline";
import { InboxTriageControls } from "./inbox-triage-controls";
import { OrganizationMessageComposer } from "./report-communication";
import { reportNextActionLabel, reportStatusMeaning, REPORT_STATUS_TRANSITIONS } from "../../lib/report-status";
import { formatDateTime } from "../../lib/format-date";
import { getReport } from "../../services/reports";
import { getReportTimeline } from "../../services/timeline";
import { listActiveScopeEntries } from "../../services/scope";
import { AssetLinkPicker } from "./asset-link-picker";
import { ScopeStateBadge } from "../ui/badge";
import type { Report } from "../../types/report";
import type { ScopeEntry } from "../../types/scope";

/** No report selected yet -- the inbox's own resting state for the middle/right panes,
 * distinct from "no reports exist at all" (InboxReportList's own EmptyState). */
export function InboxNoSelection() {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center p-8">
      <EmptyState title="Select a report">Choose a report from the list to view its details and timeline.</EmptyState>
    </div>
  );
}

/** `?reportId=` was present but did not resolve to a real, accessible report in THIS
 * program -- a malformed value, a well-formed id belonging to another program/org
 * entirely, or an id that simply doesn't exist. Deliberately the SAME copy for all three:
 * distinguishing "exists but you can't access it" from "doesn't exist" would leak
 * existence across a permission boundary, the same posture the report detail page's own
 * `report === null` covers-both-cases comment already documents for the identical
 * question on that surface. Visually and textually distinct from InboxNoSelection (which
 * means "you haven't picked one yet," a neutral resting state) -- this one means "the
 * report this link pointed at isn't here," a real, if quiet, 404 for this pane. The page
 * itself still returns a normal 200 (the list beside this pane is real and usable; see
 * the page's own comment on why a true notFound() would be the wrong call for a
 * query-param-selected pane rather than a distinct route segment). */
export function InboxReportNotFound() {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center p-8">
      <EmptyState title="Report not found">This report doesn&apos;t exist, or isn&apos;t part of this program&apos;s inbox. Choose one from the list.</EmptyState>
    </div>
  );
}

/** Fetches and renders one report's middle pane (submission + merged timeline) and right
 * pane (triage actions) -- ONE async Server Component covering both panes, wrapped in its
 * own <Suspense> boundary keyed on reportId by the page above (see that page's own
 * comment on why). No client-side state is shared between the two panes: Phase 5.5's
 * post-action contract for this surface is explicitly non-optimistic (see
 * InboxTriageControls's own comment) -- a successful mutation calls router.refresh(),
 * which re-runs this ENTIRE Server Component with fresh data from the database, so both
 * panes always reflect the same real, server-confirmed state with nothing to keep in
 * sync client-side.
 */
export async function InboxSelectedReport({
  organizationId,
  programId,
  reportId,
  actorNames,
  canFinalize,
}: {
  organizationId: string;
  programId: string;
  reportId: string;
  actorNames: Record<string, string>;
  canFinalize: boolean;
}) {
  void canFinalize; // reserved for a future bounty/payment panel on this view; not used yet.
  const report = await getReport(reportId);
  if (!report || report.organizationId !== organizationId || report.programId !== programId) {
    return (
      <div className="p-6">
        <EmptyState title="Report not found">This report does not exist, or you do not have access to it.</EmptyState>
      </div>
    );
  }

  const timelinePage = await getReportTimeline(reportId, true);
  const allowedNext = REPORT_STATUS_TRANSITIONS[report.status];
  const isFinal = allowedNext.length === 0;
  // The submitting researcher is never one of the org's own members, so they were never
  // in the page-level actorNames map -- add them here, per-report, the same way the
  // existing report detail page (reports/[reportId]/page.tsx) does, so the timeline's
  // "report.created" entry (actor_id = the researcher) resolves to their real name rather
  // than falling back to describeOrganizationActivity's generic "A team member".
  const timelineActorNames: Record<string, string> = { ...actorNames, [report.researcherId]: report.researcherName };
  // Only fetched for the "unlinked" case (matchedScopeEntryId === null) -- the common,
  // already-linked case never pays this extra query. See db/migrations/
  // 202608270001_report_foundation.sql's own comment on how a report ends up unlinked.
  const linkablePicks: ScopeEntry[] = report.matchedScopeEntryId === null ? await listActiveScopeEntries(programId) : [];

  return (
    <div className="grid h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <InboxMiddlePane organizationId={organizationId} programId={programId} report={report} timelinePage={timelinePage} actorNames={timelineActorNames} linkablePicks={linkablePicks} />
      <InboxRightPane organizationId={organizationId} programId={programId} report={report} allowedNext={allowedNext} isFinal={isFinal} />
    </div>
  );
}

function InboxMiddlePane({
  organizationId,
  programId,
  report,
  timelinePage,
  actorNames,
  linkablePicks,
}: {
  organizationId: string;
  programId: string;
  report: Report;
  timelinePage: Awaited<ReturnType<typeof getReportTimeline>>;
  actorNames: Record<string, string>;
  linkablePicks: ScopeEntry[];
}) {
  return (
    <div className="min-w-0 space-y-6 overflow-y-auto border-b border-border p-4 xl:border-b-0 xl:border-r xl:p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {report.confirmedSeverity && <SeverityBadge severity={report.confirmedSeverity} />}
          <StatusBadge status={report.status} />
          <Link
            href={`/organizations/${organizationId}/programs/${programId}/reports/${report.id}` as Route}
            className="ml-auto text-xs font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            View full report →
          </Link>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-ink">{report.title}</h2>
        <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          <MetadataPair label="Researcher" value={report.researcherName} />
          <MetadataPair label="Submitted" value={formatDateTime(report.submittedAt)} />
          <MetadataPair
            label="Target"
            className="sm:col-span-2"
            value={
              <span className="flex flex-wrap items-center gap-2">
                <AssetTypeBadge assetType={report.assetType} />
                <span className="break-all font-mono">{report.displayTarget}</span>
              </span>
            }
          />
          <MetadataPair
            label="Linked asset"
            className="sm:col-span-2"
            value={
              report.matchedScopeEntryId ? (
                <span className="flex flex-wrap items-center gap-2">
                  <ScopeStateBadge state={report.matchedScopeState} />
                  <span className="break-all font-mono">{report.matchedTarget}</span>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-muted">No asset linked</span>
                  <AssetLinkPicker organizationId={organizationId} programId={programId} reportId={report.id} candidates={linkablePicks} />
                </span>
              )
            }
          />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <SectionLabel>Reproduction</SectionLabel>
        <Markdown content={report.description} className="mt-2" />
      </div>

      {report.impact && (
        <div className="border-t border-border pt-4">
          <SectionLabel>Impact</SectionLabel>
          <Markdown content={report.impact} className="mt-2" />
        </div>
      )}

      <div className="border-t border-border pt-4">
        <SectionLabel>Timeline</SectionLabel>
        <div className="mt-3">
          <InboxTimeline
            organizationId={organizationId}
            programId={programId}
            reportId={report.id}
            initialEntries={timelinePage.entries}
            initialHasEarlier={timelinePage.hasEarlier}
            totalCount={timelinePage.totalCount}
            actorNames={actorNames}
          />
        </div>
      </div>
    </div>
  );
}

function InboxRightPane({
  organizationId,
  programId,
  report,
  allowedNext,
  isFinal,
}: {
  organizationId: string;
  programId: string;
  report: Report;
  allowedNext: Report["status"][];
  isFinal: boolean;
}) {
  return (
    <div className="space-y-5 overflow-y-auto p-4 xl:p-5">
      <div>
        <SectionLabel>{isFinal ? "Final decision" : "Triage"}</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">{reportStatusMeaning(report.status)}</p>
        {!isFinal && <p className="mt-2 text-xs font-medium text-ink-muted">Next: {reportNextActionLabel(report.status)}</p>}
      </div>

      <div className="border-t border-border pt-4">
        <InboxTriageControls
          organizationId={organizationId}
          programId={programId}
          reportId={report.id}
          status={report.status}
          allowedNext={allowedNext}
          currentSeverity={report.confirmedSeverity}
          isFinal={isFinal}
        />
      </div>

      {/* OrganizationMessageComposer's own "Visible to" select defaults to
          "Researcher and organization" -- switch it to "Internal only" to post a
          team-only note the researcher never sees. The composer itself (not a second,
          internal-only-only variant) is reused verbatim so a triager who actually wants to
          reply TO the researcher from this same panel isn't forced back to the full report
          page to do it. */}
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm font-medium text-ink">Add a comment</p>
        <OrganizationMessageComposer organizationId={organizationId} programId={programId} reportId={report.id} />
      </div>
    </div>
  );
}
