import React from "react";
import { SectionLabel } from "../ui/security-primitives";
import { severityTone } from "../ui/badge";
import type { CvssMetrics, ReportSeverity } from "../../types/report";

/** FIRST.org's own published CVSS v3.1 qualitative severity rating scale, reused
 * verbatim -- see docs/decisions/0069. Returns the same lowercase ReportSeverity keys
 * severityTone (components/ui/badge.tsx) already uses, so the score's color reuses the
 * existing severity color system directly -- never a second, parallel mapping. */
function qualitativeRating(score: number): ReportSeverity {
  if (score === 0) return "none";
  if (score < 4) return "low";
  if (score < 7) return "medium";
  if (score < 9) return "high";
  return "critical";
}

const QUALITATIVE_LABEL: Record<ReportSeverity, string> = { none: "None", low: "Low", medium: "Medium", high: "High", critical: "Critical" };

const ATTACK_VECTOR_LABEL: Record<CvssMetrics["attackVector"], string> = { network: "Network", adjacent: "Adjacent network", local: "Local", physical: "Physical" };
const ATTACK_COMPLEXITY_LABEL: Record<CvssMetrics["attackComplexity"], string> = { low: "Low", high: "High" };
const PRIVILEGES_REQUIRED_LABEL: Record<CvssMetrics["privilegesRequired"], string> = { none: "None", low: "Low", high: "High" };
const USER_INTERACTION_LABEL: Record<CvssMetrics["userInteraction"], string> = { none: "None", required: "Required" };
const SCOPE_LABEL: Record<CvssMetrics["scope"], string> = { unchanged: "Unchanged", changed: "Changed" };
const IMPACT_LABEL: Record<CvssMetrics["confidentialityImpact"], string> = { none: "None", low: "Low", high: "High" };

/**
 * A read-only CVSS v3.1 summary for the researcher's own report -- docs/decisions/0069.
 * The score and every metric here were already computed and stored by the organization
 * during triage (supabase/migrations/202609030006_cvss_severity_scoring.sql); this
 * component adds no new data, no new RPC, and no researcher-side input -- it only
 * renders what `getReport()` already returns and no component previously displayed to
 * anyone outside the org's own triage rail. Renders nothing at all when a report has no
 * CVSS metrics attached (the common case, since CVSS is optional) -- never an "not yet
 * assessed" placeholder.
 */
export function CvssSummary({ metrics, baseScore }: { metrics: CvssMetrics; baseScore: number }) {
  return (
    <div className="border-t border-border pt-5">
      <SectionLabel>CVSS v3.1 base score</SectionLabel>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className={`font-mono text-2xl font-semibold tabular-nums ${severityTone[qualitativeRating(baseScore)].text}`}>{baseScore.toFixed(1)}</span>
        <span className="text-sm font-medium text-ink-muted">{QUALITATIVE_LABEL[qualitativeRating(baseScore)]}</span>
      </p>
      <p className="mt-1 text-xs text-ink-muted">The standardized justification the organization attached when it confirmed this report&apos;s severity.</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-muted">Attack vector</dt>
          <dd className="mt-0.5 text-ink">{ATTACK_VECTOR_LABEL[metrics.attackVector]}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-muted">Attack complexity</dt>
          <dd className="mt-0.5 text-ink">{ATTACK_COMPLEXITY_LABEL[metrics.attackComplexity]}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-muted">Privileges required</dt>
          <dd className="mt-0.5 text-ink">{PRIVILEGES_REQUIRED_LABEL[metrics.privilegesRequired]}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-muted">User interaction</dt>
          <dd className="mt-0.5 text-ink">{USER_INTERACTION_LABEL[metrics.userInteraction]}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-muted">Scope</dt>
          <dd className="mt-0.5 text-ink">{SCOPE_LABEL[metrics.scope]}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-ink-muted">Impact (C / I / A)</dt>
          <dd className="mt-0.5 text-ink">
            {IMPACT_LABEL[metrics.confidentialityImpact]} / {IMPACT_LABEL[metrics.integrityImpact]} / {IMPACT_LABEL[metrics.availabilityImpact]}
          </dd>
        </div>
      </dl>
    </div>
  );
}
