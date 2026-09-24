import React from "react";
import { LifecycleFunnel } from "../../charts/lifecycle-funnel";
import { VolumeTimeline } from "../../charts/volume-timeline";
import { AgingDistribution } from "../../charts/aging-distribution";
import { SeverityStatusMatrix } from "../../charts/severity-status-matrix";
import { ResolutionPerformance } from "./resolution-performance";
import { ReportStatusChart } from "../report-status-chart";
import { SectionLabel } from "../../ui/security-primitives";
import { MOCK_LIFECYCLE_FUNNEL, MOCK_RESOLUTION_PERFORMANCE, MOCK_AGING_BUCKETS, MOCK_SEVERITY_STATUS_BREAKDOWN, generateMockWeeklyVolume } from "../../../lib/mock/report-analytics";
import type { ReportStatus } from "../../../types/report";

/**
 * The Reports page's full analytics surface -- a security-operations read of a
 * researcher's own report history, not a generic SaaS dashboard. Status distribution
 * (real, from getMyReportStatusCounts, reusing the existing ReportStatusChart -- now
 * with hover interactivity added to its own SegmentedBar) leads; everything below it is
 * currently mock, clearly labeled per-section rather than with one banner, since each
 * piece has a distinct real backend it will eventually need
 * (lib/mock/report-analytics.ts documents each). Sections read top to bottom as: what
 * state is my work in right now (status + funnel) -> how has it moved over time
 * (timeline) -> how fast is it moving (resolution performance + aging) -> where is
 * anything important stuck (severity x status). See
 * docs/decisions/0064-report-analytics-upgrade.md.
 */
export function ReportsAnalytics({ statusCounts }: { statusCounts: { status: ReportStatus; count: number }[] }) {
  const weeklyVolume = generateMockWeeklyVolume();

  return (
    <div className="space-y-8">
      <ReportStatusChart counts={statusCounts} />

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Lifecycle funnel</SectionLabel>
            <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Preview</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Every report you've submitted, by how far it's moved through triage.</p>
          <div className="mt-4">
            <LifecycleFunnel stages={MOCK_LIFECYCLE_FUNNEL} />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Submission volume</SectionLabel>
            <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Preview</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">What you've submitted, and how it settled, over the past 12 weeks.</p>
          <div className="mt-4">
            <VolumeTimeline weeks={weeklyVolume} />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Preview</span>
        </div>
        <ResolutionPerformance performance={MOCK_RESOLUTION_PERFORMANCE} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Aging (open reports)</SectionLabel>
            <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Preview</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">How long your currently-open reports have been waiting.</p>
          <div className="mt-4">
            <AgingDistribution buckets={MOCK_AGING_BUCKETS} />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Severity × status</SectionLabel>
            <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Preview</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Where your most severe findings currently sit.</p>
          <div className="mt-4">
            <SeverityStatusMatrix cells={MOCK_SEVERITY_STATUS_BREAKDOWN} />
          </div>
        </div>
      </div>
    </div>
  );
}
