"use client";

import React, { useState } from "react";
import { cn } from "../../lib/cn";
import { severityTone } from "../ui/badge";
import { reportStatusLabel } from "../../lib/report-status";
import type { MockSeverityStatusCell } from "../../lib/mock/report-analytics";
import type { ReportSeverity, ReportStatus } from "../../types/report";

const SEVERITY_ORDER: ReportSeverity[] = ["critical", "high", "medium", "low", "none"];
const STATUS_ORDER: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];
const SEVERITY_LABEL: Record<ReportSeverity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "None" };

/**
 * Where an important finding is actually stuck -- a real matrix, severity (rows, worst
 * first) x status (columns, lifecycle order), cell shading by SEVERITY only (the
 * question this view answers is "how severe are the reports sitting in each status," not
 * a second encoding of status the segmented bar/funnel already show). A zero-count cell
 * is a hollow outline, never a filled zero -- present-but-empty reads differently from
 * absent, the same distinction docs/decisions/0046 draws for the status bar's own
 * zero-count categories.
 */
export function SeverityStatusMatrix({ cells }: { cells: MockSeverityStatusCell[] }) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const byKey = new Map(cells.map((c) => [`${c.severity}:${c.status}`, c.count]));
  const presentStatuses = STATUS_ORDER.filter((status) => cells.some((c) => c.status === status));
  const max = Math.max(1, ...cells.map((c) => c.count));

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `5.5rem repeat(${presentStatuses.length}, minmax(2.75rem, 1fr))` }}>
        <div />
        {presentStatuses.map((status) => (
          <div key={status} className="flex items-end justify-center pb-1 text-center">
            <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-ink-muted [writing-mode:vertical-rl]">{reportStatusLabel(status)}</span>
          </div>
        ))}
        {SEVERITY_ORDER.map((severity) => (
          <React.Fragment key={severity}>
            <div className="flex items-center gap-1.5 pr-2">
              <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", severityTone[severity].bg)} />
              <span className="text-xs font-medium text-ink">{SEVERITY_LABEL[severity]}</span>
            </div>
            {presentStatuses.map((status) => {
              const key = `${severity}:${status}`;
              const count = byKey.get(key) ?? 0;
              const opacity = count === 0 ? 0 : 0.35 + (count / max) * 0.65;
              return (
                <div
                  key={key}
                  onMouseEnter={() => count > 0 && setHoveredCell(key)}
                  onMouseLeave={() => setHoveredCell((current) => (current === key ? null : current))}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-sm border",
                    count === 0 ? "border-dashed border-border" : "border-transparent",
                  )}
                  style={count > 0 ? { backgroundColor: `color-mix(in srgb, var(--${severityBgVar(severity)}) ${opacity * 100}%, transparent)` } : undefined}
                >
                  {count > 0 && <span className="font-mono text-xs font-bold tabular-nums text-ink">{count}</span>}
                  {hoveredCell === key && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] shadow-lg">
                      <span className="font-semibold text-ink">{count}</span> <span className="text-ink-muted">{SEVERITY_LABEL[severity].toLowerCase()} · {reportStatusLabel(status).toLowerCase()}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function severityBgVar(severity: ReportSeverity): string {
  return severity === "none" ? "severity-none" : `severity-${severity}`;
}
