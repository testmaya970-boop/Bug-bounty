import React from "react";
import type { SubmissionStanding, SubmissionTier } from "../../services/submission-signal";
import { Alert } from "../ui/feedback";
import { LocalTime } from "../ui/local-time";

const TIER: Record<SubmissionTier, { label: string; hint: string }> = {
  new: { label: "New researcher", hint: "Your first 3 closed reports set your standing." },
  standard: { label: "Standard", hint: "Three valid reports and a signal of +0.50 or better makes you trusted." },
  trusted: { label: "Trusted", hint: "Your reports are mostly valid, so your daily limit is the highest." },
  limited: { label: "Limited", hint: "Most of your recent reports were closed as not applicable or rejected." },
};

/** Shown above the report form: how many reports are left today and why, before the
 * researcher writes one the database would refuse (202610210001). */
export function SubmissionStandingPanel({ standing }: { standing: SubmissionStanding }) {
  if (standing.restrictedUntil) {
    return (
      <Alert tone="danger" title="Your report submissions are paused">
        {standing.restrictionReason} You can submit again on <LocalTime value={standing.restrictedUntil} />.
      </Alert>
    );
  }
  const left = Math.max(standing.dailyCap - standing.usedToday, 0);
  const tier = TIER[standing.tier];
  const signal = `${standing.signal > 0 ? "+" : ""}${standing.signal.toFixed(2)}`;
  return (
    <section aria-label="Submission standing" className="grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-ink">
          <span className="font-semibold">{left === 0 ? "No reports left today" : `${left} of ${standing.dailyCap} reports left today`}</span>
          <span className="text-ink-muted"> · {tier.label}</span>
        </p>
        <div className="flex gap-1" role="meter" aria-valuemin={0} aria-valuemax={standing.dailyCap} aria-valuenow={standing.usedToday} aria-label="Reports used in the last 24 hours">
          {standing.dailyCap <= 30
            ? Array.from({ length: standing.dailyCap }, (_, i) => <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-full ${i < standing.usedToday ? "bg-ink" : "bg-border"}`} />)
            : <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"><span className="block h-full bg-ink" style={{ width: `${Math.min((standing.usedToday / standing.dailyCap) * 100, 100)}%` }} /></span>}
        </div>
        <p className="text-xs text-ink-muted">{tier.hint} Counted over the last 24 hours, across every program.</p>
      </div>
      {standing.closedCount > 0 && (
        <dl className="flex gap-5 text-right sm:block sm:space-y-1">
          <div>
            <dt className="text-xs text-ink-muted">Signal</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums text-ink">{signal}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Valid / closed</dt>
            <dd className="font-mono text-sm tabular-nums text-ink">
              {standing.validCount} / {standing.closedCount}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
