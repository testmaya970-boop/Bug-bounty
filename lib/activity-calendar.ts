import type { ReportSummary } from "../types/report";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Real submission-activity calendar -- buckets the researcher's own real reports
 * (ReferenceStrip's activityWeeks prop) by their real submittedAt date into the same
 * 14-week x 7-day shape lib/mock/researcher-dashboard's generateMockActivityWeeks()
 * fabricated. Week 0 is the oldest of the 14 weeks, day 0 of each week is 7 days before
 * day 6; `now` is injectable for deterministic tests, defaulting to the real current time. */
export function computeReportActivityWeeks(reports: Pick<ReportSummary, "submittedAt">[], now: Date = new Date()): number[][] {
  const weeks: number[][] = Array.from({ length: 14 }, () => new Array(7).fill(0));
  const nowMs = now.getTime();
  const rangeStartMs = nowMs - 14 * WEEK_MS;

  for (const report of reports) {
    const submittedMs = new Date(report.submittedAt).getTime();
    if (Number.isNaN(submittedMs) || submittedMs < rangeStartMs || submittedMs > nowMs) continue;
    const weekIndex = Math.min(13, Math.floor((submittedMs - rangeStartMs) / WEEK_MS));
    const dayIndex = Math.min(6, Math.floor((submittedMs - (rangeStartMs + weekIndex * WEEK_MS)) / DAY_MS));
    weeks[weekIndex][dayIndex] += 1;
  }

  return weeks;
}
