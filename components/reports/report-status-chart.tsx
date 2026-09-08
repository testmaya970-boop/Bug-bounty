import React from "react";
import { SegmentedBar, type SegmentedBarDatum } from "../charts/segmented-bar";
import { SectionLabel } from "../ui/security-primitives";
import { statusTone } from "../ui/badge";
import { reportStatusLabel } from "../../lib/report-status";
import type { ReportStatus } from "../../types/report";

// Read order roughly matches the lifecycle itself, not "best to worst" -- new work first,
// terminal outcomes last, mirroring REPORT_STATUS_TRANSITIONS' own progression rather
// than an invented priority ranking.
const STATUS_ORDER: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];

/**
 * The researcher's own current work mix -- every status a report can be in right now,
 * not only terminal outcomes (that is the reputation ledger's own, narrower job -- see
 * docs/decisions/0045). A single proportional pipeline bar (see
 * components/charts/segmented-bar.tsx and docs/decisions/0046), not nine
 * independently-scaled bars: nine real categories that together make up one whole, read
 * as one shape first, then a dense legend for the exact counts. Colors come straight from
 * `statusTone[status]`, the exact literal tone components/ui/badge.tsx's own StatusBadge
 * dot uses -- never derived at runtime from the text color.
 */
export function ReportStatusChart({ counts }: { counts: { status: ReportStatus; count: number }[] }) {
  const byStatus = new Map(counts.map((c) => [c.status, c.count]));
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const data: SegmentedBarDatum[] = STATUS_ORDER.map((status) => ({
    label: reportStatusLabel(status),
    value: byStatus.get(status) ?? 0,
    tone: statusTone[status],
  }));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>Your reports by status</SectionLabel>
        <span className="font-mono text-xs text-ink-muted">
          {total} report{total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3">
        <SegmentedBar data={data} />
      </div>
    </div>
  );
}
