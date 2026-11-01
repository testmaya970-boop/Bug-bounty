import "server-only";
import { getReportAuditActivity, listReportMessages } from "@/services/reports";
import type { ReportMessage } from "@/types/report";
import type { OrganizationAuditEventRecord } from "@/types/organization";

/**
 * A report's chronological timeline for the triage inbox's middle pane -- a pure merge of
 * two already-real, already-RLS-scoped reads (getReportAuditActivity's state-change
 * history and listReportMessages' researcher/organization communication), never a new
 * table. No new schema exists or is needed here: audit_logs already records every real
 * triage transition with a real created_at (see db/migrations/
 * 202608270002_report_triage_foundation.sql), and report_messages already distinguishes
 * researcher-visible vs. internal-only (202608270003_report_evidence_and_communication.sql).
 * This module's only job is giving the two a single sortable shape so the UI can render one
 * continuous timeline instead of two separately-fetched lists.
 */
export type TimelineEntry =
  | { kind: "state_change"; id: string; createdAt: string; event: OrganizationAuditEventRecord }
  | { kind: "message"; id: string; createdAt: string; message: ReportMessage };

export type ReportTimelinePage = {
  entries: TimelineEntry[];
  /** True when more, OLDER entries exist beyond what `entries` contains -- the inbox's
   * "load earlier" affordance renders only when this is true. Never a lie: computed from
   * the real full merged count, not estimated. */
  hasEarlier: boolean;
  /** The real total entry count before capping -- lets the UI honestly disclose "showing
   * the most recent 200 of 340" rather than silently truncating with no indication
   * anything was cut. */
  totalCount: number;
};

// getReportAuditActivity/listReportMessages are both existing, shared, unbounded reads
// (also used by the full report detail page, which deliberately shows "every" event/
// message with no cap -- a pre-existing design choice for that surface this pass does not
// change). Rather than changing either function's signature to add real DB-level cursor
// pagination (a bigger, riskier change than Phase 5.5's stated "no new features" scope
// calls for, and one that would also affect the report detail page's own unrelated
// unbounded rendering), this cap is applied at the merge layer: fetch the full set (as
// today), sort it, then keep only the most recent TIMELINE_ENTRY_CAP entries for display.
// This is a real cap on what the inbox actually renders, with an honest, real
// hasEarlier/totalCount -- not a fake client-side "Load more" over data that was already
// silently truncated at the query level.
const TIMELINE_ENTRY_CAP = 200;

/** `includeAuditEvents` mirrors the report detail page's own `canTriage` gate --
 * getReportAuditActivity already returns an empty array for a caller RLS would not permit
 * (see that function's own comment), but a researcher's page context should not fetch it
 * at all, matching this codebase's own "only fetch what this viewer is allowed to see"
 * convention elsewhere (e.g. the org Home page's canSeeAdminActivity gate).
 *
 * `beforeCreatedAt` implements "load earlier": omit it for the initial page (the most
 * recent TIMELINE_ENTRY_CAP entries); pass the oldest entry's createdAt from the current
 * page to fetch the next-older page. Simple, real cursor semantics over the same
 * already-fetched full set -- see this file's own header comment on why the cap lives
 * here rather than as new query-level pagination on the two underlying reads. */
export async function getReportTimeline(reportId: string, includeAuditEvents: boolean, beforeCreatedAt?: string): Promise<ReportTimelinePage> {
  const [auditEvents, messages] = await Promise.all([
    includeAuditEvents ? getReportAuditActivity(reportId) : Promise.resolve([]),
    listReportMessages(reportId),
  ]);

  const allEntries: TimelineEntry[] = [
    ...auditEvents.map((event): TimelineEntry => ({ kind: "state_change", id: `audit:${event.id}`, createdAt: event.createdAt, event })),
    ...messages.map((message): TimelineEntry => ({ kind: "message", id: `message:${message.id}`, createdAt: message.createdAt, message })),
  ];
  allEntries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const eligible = beforeCreatedAt ? allEntries.filter((entry) => entry.createdAt < beforeCreatedAt) : allEntries;
  const page = eligible.length > TIMELINE_ENTRY_CAP ? eligible.slice(eligible.length - TIMELINE_ENTRY_CAP) : eligible;

  return {
    entries: page,
    hasEarlier: page.length < eligible.length,
    totalCount: allEntries.length,
  };
}
