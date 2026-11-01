/**
 * Mock/preview data for the Reports page's analytics surface (app/reports/page.tsx).
 * Entirely fictional -- structured to mirror what a real query would return so it can be
 * swapped for a live one later without touching any component in
 * components/reports/analytics/*. Same deliberate, labeled exception to Unpatched's normal
 * "never fabricate data" rule as lib/mock/researcher-dashboard.ts -- the real status
 * distribution (getMyReportStatusCounts) and the real report list stay real; everything
 * derived here has no backing query yet.
 *
 * ONE record-level dataset, not five independent aggregates: every chart on the page
 * (dwell-time strip, trend comparison, severity x outcome, aging queue) derives from the
 * same MOCK_REPORT_RECORDS array via the helper functions below, the same way a real
 * analytics surface would query one reports table rather than maintain five
 * pre-aggregated views that can silently drift out of sync with each other.
 */

import type { ReportSeverity, ReportStatus } from "@/types/report";

/** DOMAIN.md's own report lifecycle (lib/report-status.ts's REPORT_STATUS_TRANSITIONS),
 * collapsed to the five states an operational read actually cares about -- duplicate/
 * informative/not_applicable/rejected are real, distinct statuses but identical from a
 * "where did the time go" point of view (all terminal, all reached the same way), so they
 * share the Closed bucket here exactly as they already share one badge tone in
 * components/ui/badge.tsx's own statusTone map. */
export type LifecycleState = "submitted" | "triaging" | "needs_information" | "accepted" | "closed";

export const LIFECYCLE_STATE_ORDER: LifecycleState[] = ["submitted", "triaging", "needs_information", "accepted", "closed"];
export const LIFECYCLE_STATE_LABEL: Record<LifecycleState, string> = {
  submitted: "Submitted",
  triaging: "Triaging",
  needs_information: "Needs info",
  accepted: "Accepted",
  closed: "Closed",
};

function collapseStatus(status: ReportStatus): LifecycleState {
  if (status === "new") return "submitted";
  if (status === "triaging") return "triaging";
  if (status === "needs_information") return "needs_information";
  if (status === "accepted") return "accepted";
  return "closed";
}

/** One state-log entry: when a report entered a given lifecycle state. The real primitive
 * every chart derives from -- dwell time is the gap between consecutive entries (or "now"
 * for the current, still-open state), never a separately-invented duration. */
export type StateLogEntry = { state: LifecycleState; enteredAt: string };

export type MockReportRecord = {
  id: string;
  title: string;
  severity: ReportSeverity;
  currentStatus: ReportStatus;
  stateLog: StateLogEntry[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n: number, from: Date): string {
  return new Date(from.getTime() - n * DAY_MS).toISOString();
}

/**
 * 22 individual report records with a real per-state timestamp log -- enough for a
 * strip-plot distribution to show real shape (not just 3-4 dots), and enough closed
 * records to compute a meaningful "this period vs. last period" trend. NOW is fixed
 * (not Date.now()) so the dataset -- and every derived chart -- renders identically on
 * every load. Three records are deliberately stuck well past their state's typical
 * dwell time (the outliers the dwell-time strip and aging queue both need to be honest
 * about something to flag).
 */
export const MOCK_ANALYTICS_NOW = new Date("2026-09-04T12:00:00Z");

export const MOCK_REPORT_RECORDS: MockReportRecord[] = [
  // -- Currently open, healthy pace --
  { id: "r1", title: "Reflected XSS in search results", severity: "medium", currentStatus: "triaging", stateLog: [{ state: "submitted", enteredAt: daysAgo(2, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(1, MOCK_ANALYTICS_NOW) }] },
  { id: "r2", title: "Missing rate limit on password reset", severity: "medium", currentStatus: "needs_information", stateLog: [{ state: "submitted", enteredAt: daysAgo(6, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(5, MOCK_ANALYTICS_NOW) }, { state: "needs_information", enteredAt: daysAgo(3, MOCK_ANALYTICS_NOW) }] },
  { id: "r3", title: "IDOR on invoice download endpoint", severity: "high", currentStatus: "accepted", stateLog: [{ state: "submitted", enteredAt: daysAgo(9, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(8, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(5, MOCK_ANALYTICS_NOW) }] },
  // -- Currently open, STUCK (the real outliers) --
  { id: "r4", title: "Auth bypass via JWT alg confusion", severity: "critical", currentStatus: "needs_information", stateLog: [{ state: "submitted", enteredAt: daysAgo(41, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(40, MOCK_ANALYTICS_NOW) }, { state: "needs_information", enteredAt: daysAgo(34, MOCK_ANALYTICS_NOW) }] },
  { id: "r5", title: "SSRF via webhook URL validation", severity: "high", currentStatus: "triaging", stateLog: [{ state: "submitted", enteredAt: daysAgo(19, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(18, MOCK_ANALYTICS_NOW) }] },
  { id: "r6", title: "Privilege escalation via role param", severity: "high", currentStatus: "new", stateLog: [{ state: "submitted", enteredAt: daysAgo(12, MOCK_ANALYTICS_NOW) }] },
  // -- Closed, this period (last 30 days) --
  { id: "r7", title: "Stored XSS in comment field", severity: "high", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(28, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(27, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(25, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(18, MOCK_ANALYTICS_NOW) }] },
  { id: "r8", title: "SQL injection in filter parameter", severity: "critical", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(25, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(24, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(22, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(14, MOCK_ANALYTICS_NOW) }] },
  { id: "r9", title: "Weak session token entropy", severity: "low", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(23, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(22, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(21, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(15, MOCK_ANALYTICS_NOW) }] },
  { id: "r10", title: "CSRF on payment settings form", severity: "medium", currentStatus: "not_applicable", stateLog: [{ state: "submitted", enteredAt: daysAgo(20, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(19, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(17, MOCK_ANALYTICS_NOW) }] },
  { id: "r11", title: "Rate limiting bypass on login", severity: "medium", currentStatus: "duplicate", stateLog: [{ state: "submitted", enteredAt: daysAgo(17, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(16, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(15, MOCK_ANALYTICS_NOW) }] },
  { id: "r12", title: "Directory listing exposed on /assets", severity: "none", currentStatus: "rejected", stateLog: [{ state: "submitted", enteredAt: daysAgo(16, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(15, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(14, MOCK_ANALYTICS_NOW) }] },
  { id: "r13", title: "Insecure deep link handling", severity: "medium", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(15, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(14, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(13, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(8, MOCK_ANALYTICS_NOW) }] },
  { id: "r14", title: "Missing security headers", severity: "low", currentStatus: "informative", stateLog: [{ state: "submitted", enteredAt: daysAgo(14, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(13, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(12, MOCK_ANALYTICS_NOW) }] },
  { id: "r15", title: "Open redirect on logout flow", severity: "low", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(11, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(10, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(9, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(6, MOCK_ANALYTICS_NOW) }] },
  // -- Closed, PREVIOUS period (30-60 days ago) -- the trend/baseline comparison arm
  { id: "p1", title: "XXE in file import", severity: "high", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(58, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(56, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(52, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(38, MOCK_ANALYTICS_NOW) }] },
  { id: "p2", title: "Broken access control on admin API", severity: "critical", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(55, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(52, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(46, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(35, MOCK_ANALYTICS_NOW) }] },
  { id: "p3", title: "Clickjacking on account settings", severity: "low", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(52, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(50, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(47, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(40, MOCK_ANALYTICS_NOW) }] },
  { id: "p4", title: "Mass assignment on profile update", severity: "medium", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(49, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(46, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(41, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(30, MOCK_ANALYTICS_NOW) }] },
  { id: "p5", title: "Timing attack on username enumeration", severity: "low", currentStatus: "not_applicable", stateLog: [{ state: "submitted", enteredAt: daysAgo(47, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(45, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(41, MOCK_ANALYTICS_NOW) }] },
  { id: "p6", title: "Insecure direct object reference on export", severity: "high", currentStatus: "resolved", stateLog: [{ state: "submitted", enteredAt: daysAgo(44, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(41, MOCK_ANALYTICS_NOW) }, { state: "accepted", enteredAt: daysAgo(35, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(31, MOCK_ANALYTICS_NOW) }] },
  { id: "p7", title: "Verbose error messages leak stack trace", severity: "none", currentStatus: "informative", stateLog: [{ state: "submitted", enteredAt: daysAgo(41, MOCK_ANALYTICS_NOW) }, { state: "triaging", enteredAt: daysAgo(39, MOCK_ANALYTICS_NOW) }, { state: "closed", enteredAt: daysAgo(37, MOCK_ANALYTICS_NOW) }] },
];

/** Median of a sorted-in-place copy -- never mutates the input, never an average (a
 * single slow report should never move this the way it would a mean). Returns null for
 * an empty set rather than 0, which would misrepresent "no data" as "zero days." */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function dwellDaysInState(record: MockReportRecord, state: LifecycleState, now: Date): number | null {
  const index = record.stateLog.findIndex((entry) => entry.state === state);
  if (index === -1) return null;
  const enteredAt = new Date(record.stateLog[index].enteredAt).getTime();
  const nextEntry = record.stateLog[index + 1];
  const exitedAt = nextEntry ? new Date(nextEntry.enteredAt).getTime() : now.getTime();
  return (exitedAt - enteredAt) / DAY_MS;
}

/** One tick per report that has ever occupied this state, real dwell duration in days --
 * the strip-plot's actual data, not a pre-aggregated summary. A report still IN this
 * state (no next log entry) has an open-ended dwell measured to `now` and is flagged
 * `ongoing`, since "12 days and counting" is a different fact than "took 12 days." */
export type DwellTick = { reportId: string; title: string; days: number; ongoing: boolean };

export function computeStateDwellTicks(state: LifecycleState, records: MockReportRecord[] = MOCK_REPORT_RECORDS, now: Date = MOCK_ANALYTICS_NOW): DwellTick[] {
  const ticks: DwellTick[] = [];
  for (const record of records) {
    const index = record.stateLog.findIndex((entry) => entry.state === state);
    if (index === -1) continue;
    const days = dwellDaysInState(record, state, now);
    if (days === null) continue;
    const ongoing = index === record.stateLog.length - 1 && collapseStatus(record.currentStatus) === state;
    ticks.push({ reportId: record.id, title: record.title, days, ongoing });
  }
  return ticks;
}

export type StateDwellSummary = { state: LifecycleState; ticks: DwellTick[]; median: number | null; currentlyHere: number };

/** The lifecycle centerpiece's real data: every state's full dwell-time distribution
 * (not just its median) plus how many reports are sitting there right now. */
export function computeLifecycleDwellSummaries(records: MockReportRecord[] = MOCK_REPORT_RECORDS, now: Date = MOCK_ANALYTICS_NOW): StateDwellSummary[] {
  return LIFECYCLE_STATE_ORDER.map((state) => {
    const ticks = computeStateDwellTicks(state, records, now);
    return { state, ticks, median: median(ticks.map((t) => t.days)), currentlyHere: ticks.filter((t) => t.ongoing).length };
  });
}

/** This-period-vs-last-period comparison -- the trend the health strip and the
 * annotation both need. "This period" = closed in the last 30 days; "previous period" =
 * closed 30-60 days ago. Compares count closed and median total time-to-close, the two
 * numbers that answer "are we getting faster or slower," never a single blended score. */
export type PeriodComparison = {
  thisPeriodClosedCount: number;
  previousPeriodClosedCount: number;
  thisPeriodMedianDaysToClose: number | null;
  previousPeriodMedianDaysToClose: number | null;
};

function totalDaysToClose(record: MockReportRecord): number | null {
  const submitted = record.stateLog.find((e) => e.state === "submitted");
  const closed = record.stateLog.find((e) => e.state === "closed");
  if (!submitted || !closed) return null;
  return (new Date(closed.enteredAt).getTime() - new Date(submitted.enteredAt).getTime()) / DAY_MS;
}

export function computePeriodComparison(records: MockReportRecord[] = MOCK_REPORT_RECORDS, now: Date = MOCK_ANALYTICS_NOW): PeriodComparison {
  const thisPeriodStart = now.getTime() - 30 * DAY_MS;
  const previousPeriodStart = now.getTime() - 60 * DAY_MS;

  const closedRecords = records.filter((r) => r.stateLog.some((e) => e.state === "closed"));
  const thisPeriod = closedRecords.filter((r) => new Date(r.stateLog.find((e) => e.state === "closed")!.enteredAt).getTime() >= thisPeriodStart);
  const previousPeriod = closedRecords.filter((r) => {
    const closedAt = new Date(r.stateLog.find((e) => e.state === "closed")!.enteredAt).getTime();
    return closedAt >= previousPeriodStart && closedAt < thisPeriodStart;
  });

  return {
    thisPeriodClosedCount: thisPeriod.length,
    previousPeriodClosedCount: previousPeriod.length,
    thisPeriodMedianDaysToClose: median(thisPeriod.map(totalDaysToClose).filter((d): d is number => d !== null)),
    previousPeriodMedianDaysToClose: median(previousPeriod.map(totalDaysToClose).filter((d): d is number => d !== null)),
  };
}

/** Every currently-open report bucketed by age since its LAST state transition (not
 * since submission) -- a report that just moved into "Needs info" yesterday is not
 * "aging" even if it was submitted 40 days ago; a report that has sat untouched for 40
 * days is. Each bucket carries its real member records (not just a count) so the aging
 * queue can cross-filter the severity x outcome matrix below it, per this feature's own
 * linked-views design. */
export type AgingBucketKey = "0-7" | "8-30" | "31-60" | "60+";
export type AgingBucket = { key: AgingBucketKey; label: string; records: MockReportRecord[] };

export function computeAgingBuckets(records: MockReportRecord[] = MOCK_REPORT_RECORDS, now: Date = MOCK_ANALYTICS_NOW): AgingBucket[] {
  const open = records.filter((r) => collapseStatus(r.currentStatus) !== "closed");
  const buckets: Record<AgingBucketKey, MockReportRecord[]> = { "0-7": [], "8-30": [], "31-60": [], "60+": [] };
  for (const record of open) {
    const lastEntry = record.stateLog[record.stateLog.length - 1];
    const daysSince = (now.getTime() - new Date(lastEntry.enteredAt).getTime()) / DAY_MS;
    if (daysSince <= 7) buckets["0-7"].push(record);
    else if (daysSince <= 30) buckets["8-30"].push(record);
    else if (daysSince <= 60) buckets["31-60"].push(record);
    else buckets["60+"].push(record);
  }
  return [
    { key: "0-7", label: "0–7 days", records: buckets["0-7"] },
    { key: "8-30", label: "8–30 days", records: buckets["8-30"] },
    { key: "31-60", label: "31–60 days", records: buckets["31-60"] },
    { key: "60+", label: "60+ days", records: buckets["60+"] },
  ];
}

/** Severity x current status -- where risk is actually concentrated. Zero-count cells
 * are simply absent, never a fabricated placeholder. */
export type SeverityStatusCell = { severity: ReportSeverity; status: ReportStatus; count: number; records: MockReportRecord[] };

export function computeSeverityStatusCells(records: MockReportRecord[] = MOCK_REPORT_RECORDS): SeverityStatusCell[] {
  const byKey = new Map<string, SeverityStatusCell>();
  for (const record of records) {
    const key = `${record.severity}:${record.currentStatus}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.records.push(record);
    } else {
      byKey.set(key, { severity: record.severity, status: record.currentStatus, count: 1, records: [record] });
    }
  }
  return [...byKey.values()];
}

export type MockSeverityStatusCell = SeverityStatusCell;

export const MOCK_SEVERITY_STATUS_BREAKDOWN: SeverityStatusCell[] = computeSeverityStatusCells();

/** Aging bucket reduced to a count for the bar chart -- `computeAgingBuckets`'s own
 * `records` stay available to callers that need to cross-filter, but the chart itself
 * only ever renders the count. */
export type MockAgingBucket = { key: AgingBucketKey; label: string; count: number };

export const MOCK_AGING_BUCKETS: MockAgingBucket[] = computeAgingBuckets().map((b) => ({ key: b.key, label: b.label, count: b.records.length }));

/** Submitted -> Triaged -> Needs info -> Accepted -> Closed, as a real funnel: each
 * stage's count is every report that has EVER reached that lifecycle state (not just
 * those currently sitting there), so the funnel narrows monotonically the way a real
 * conversion funnel does. `statuses` records which real ReportStatus values collapse
 * into this stage, per collapseStatus above. */
export type MockFunnelStage = { key: LifecycleState; label: string; count: number; statuses: ReportStatus[] };

const FUNNEL_STAGE_STATUSES: Record<LifecycleState, ReportStatus[]> = {
  submitted: ["new"],
  triaging: ["triaging"],
  needs_information: ["needs_information"],
  accepted: ["accepted"],
  closed: ["resolved", "duplicate", "informative", "not_applicable", "rejected"],
};

export function computeLifecycleFunnel(records: MockReportRecord[] = MOCK_REPORT_RECORDS): MockFunnelStage[] {
  return LIFECYCLE_STATE_ORDER.map((state) => ({
    key: state,
    label: LIFECYCLE_STATE_LABEL[state],
    count: records.filter((r) => r.stateLog.some((entry) => entry.state === state)).length,
    statuses: FUNNEL_STAGE_STATUSES[state],
  }));
}

export const MOCK_LIFECYCLE_FUNNEL: MockFunnelStage[] = computeLifecycleFunnel();

/** Resolution performance -- three real numbers derived from the same record set, not a
 * separately-invented summary. Median time-to-triage is the submitted->triaging dwell
 * (computeStateDwellTicks's own "submitted" ticks); median time-to-resolution is the
 * full submitted->closed span (totalDaysToClose, closed records only). "Aging" reuses
 * computeAgingBuckets' 31-60/60+ buckets -- the same threshold the aging chart itself
 * flags, never a second invented cutoff. */
export type MockResolutionPerformance = {
  medianTimeToTriageHours: number;
  medianTimeToResolutionDays: number;
  openReportsCount: number;
  agingReportsCount: number;
};

export function computeResolutionPerformance(records: MockReportRecord[] = MOCK_REPORT_RECORDS, now: Date = MOCK_ANALYTICS_NOW): MockResolutionPerformance {
  const triageDwellDays = computeStateDwellTicks("submitted", records, now)
    .filter((t) => !t.ongoing)
    .map((t) => t.days);
  const closedRecords = records.filter((r) => collapseStatus(r.currentStatus) === "closed");
  const resolutionDays = closedRecords.map(totalDaysToClose).filter((d): d is number => d !== null);
  const agingBuckets = computeAgingBuckets(records, now);
  const agingReportsCount = agingBuckets.filter((b) => b.key === "31-60" || b.key === "60+").reduce((sum, b) => sum + b.records.length, 0);

  return {
    medianTimeToTriageHours: Math.round((median(triageDwellDays) ?? 0) * 24),
    medianTimeToResolutionDays: Math.round((median(resolutionDays) ?? 0) * 10) / 10,
    openReportsCount: records.filter((r) => collapseStatus(r.currentStatus) !== "closed").length,
    agingReportsCount,
  };
}

export const MOCK_RESOLUTION_PERFORMANCE: MockResolutionPerformance = computeResolutionPerformance();

/** One stacked-bar column per week -- new submissions, currently-in-progress transitions,
 * resolved closures, and other closures, all in the 12 weeks up to MOCK_ANALYTICS_NOW.
 * "New" counts by submission week; "resolved"/"otherClosed" count by closure week;
 * "inProgress" counts reports that transitioned into triaging/needs_information/accepted
 * that week -- each report contributes to a column by WHEN an event happened to it, never
 * by where it currently sits, so the same report can appear in multiple weeks/series. */
export type MockWeeklyVolume = { weekStart: string; new: number; inProgress: number; resolved: number; otherClosed: number };

const WEEK_MS = 7 * DAY_MS;

function weekStartIso(timestampMs: number, now: Date): string {
  const weeksAgo = Math.floor((now.getTime() - timestampMs) / WEEK_MS);
  return new Date(now.getTime() - (weeksAgo + 1) * WEEK_MS).toISOString().slice(0, 10);
}

export function generateMockWeeklyVolume(records: MockReportRecord[] = MOCK_REPORT_RECORDS, now: Date = MOCK_ANALYTICS_NOW, weekCount = 12): MockWeeklyVolume[] {
  const weeks: MockWeeklyVolume[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    weeks.push({ weekStart: new Date(now.getTime() - (i + 1) * WEEK_MS).toISOString().slice(0, 10), new: 0, inProgress: 0, resolved: 0, otherClosed: 0 });
  }
  const byWeekStart = new Map(weeks.map((w) => [w.weekStart, w]));

  for (const record of records) {
    for (const entry of record.stateLog) {
      const entryMs = new Date(entry.enteredAt).getTime();
      if (entryMs < now.getTime() - weekCount * WEEK_MS) continue;
      const week = byWeekStart.get(weekStartIso(entryMs, now));
      if (!week) continue;
      if (entry.state === "submitted") week.new += 1;
      else if (entry.state === "triaging" || entry.state === "needs_information" || entry.state === "accepted") week.inProgress += 1;
      else if (entry.state === "closed") {
        if (record.currentStatus === "resolved") week.resolved += 1;
        else week.otherClosed += 1;
      }
    }
  }

  return weeks;
}
