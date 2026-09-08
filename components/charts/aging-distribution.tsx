import React from "react";
import type { MockAgingBucket } from "../../lib/mock/report-analytics";

// A validated single-hue amber ordinal ramp (light->dark reads as "fresh->aging"),
// distinct from the categorical/status tones -- validated via the dataviz skill's
// validator (--ordinal, dark surface #0f1111): monotone lightness, all adjacent gaps
// >= 0.06 L, light end clears 2:1 contrast. Never reuse this ramp for a categorical
// (identity) encoding -- its whole point is that order carries meaning here.
const AGING_RAMP = ["#f5cf8f", "#e8ac4e", "#d48c1a", "#96691f", "#6b4a1a"];

/**
 * How many currently-open reports sit in each age bucket -- an ordinal bar chart (bucket
 * order carries real meaning: older is worse), never a status-colored bar, since "age" is
 * not itself a status. The oldest bucket gets the darkest step, reinforcing "further
 * along this ramp is worse to look at" without relying on the label alone.
 */
export function AgingDistribution({ buckets }: { buckets: MockAgingBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div role="img" aria-label={buckets.map((b) => `${b.label}: ${b.count} open reports`).join(", ")}>
      <div className="space-y-2.5">
        {buckets.map((bucket, index) => (
          <div key={bucket.key} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-ink-muted">{bucket.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-surface-muted">
              <div
                className="h-full rounded-sm motion-safe:transition-[width] motion-safe:duration-200"
                style={{ width: `${Math.max((bucket.count / max) * 100, bucket.count > 0 ? 6 : 0)}%`, backgroundColor: AGING_RAMP[index] ?? AGING_RAMP[AGING_RAMP.length - 1] }}
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-ink">{bucket.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
