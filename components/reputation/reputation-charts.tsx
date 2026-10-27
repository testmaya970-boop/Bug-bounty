import React from "react";
import { BarChart, type BarChartDatum } from "../charts/bar-chart";
import { DonutChart, type DonutChartDatum } from "../charts/donut-chart";
import { SectionLabel } from "../ui/security-primitives";
import { severityTone } from "../ui/badge";
import { FACT_TYPE_LABELS } from "./reputation-summary";
import { REPUTATION_FACT_TYPE_DISPLAY_ORDER } from "../../lib/reputation-labels";
import type { ReputationFactCount } from "../../types/reputation";
import type { ReportSeverity } from "../../types/report";

import { SEVERITY_LABEL } from "../../lib/report-status";
const SEVERITY_ORDER: ReportSeverity[] = ["critical", "high", "medium", "low"];

/**
 * Two real charts over the researcher's own existing counts -- no new metric, no score,
 * no fabricated data (see docs/decisions/0045). `counts`/`severityCounts` are the exact
 * same true-total aggregates the page already fetches for its own summary/breakdown;
 * this only gives them a second, visual reading. Renders nothing for a chart whose
 * underlying counts are all zero (BarChart/DonutChart already no-op in that case), so a
 * researcher with, say, no finalized bounties yet never sees an empty chart shell.
 */
export function ReputationCharts({ counts, severityCounts }: { counts: ReputationFactCount[]; severityCounts: { severity: ReportSeverity; count: number }[] }) {
  const outcomeData: BarChartDatum[] = REPUTATION_FACT_TYPE_DISPLAY_ORDER.map((factType) => ({
    label: FACT_TYPE_LABELS[factType],
    value: counts.find((c) => c.factType === factType)?.count ?? 0,
  }));

  const severityByType = new Map(severityCounts.map((s) => [s.severity, s.count]));
  const severityData: DonutChartDatum[] = SEVERITY_ORDER.map((severity) => ({
    label: SEVERITY_LABEL[severity],
    value: severityByType.get(severity) ?? 0,
    tone: severityTone[severity],
  }));

  const hasOutcomes = outcomeData.some((d) => d.value > 0);
  const hasSeverity = severityData.some((d) => d.value > 0);
  if (!hasOutcomes && !hasSeverity) return null;

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
      {hasOutcomes && (
        <div>
          <SectionLabel>Outcomes by type</SectionLabel>
          <div className="mt-3">
            <BarChart data={outcomeData} />
          </div>
        </div>
      )}
      {hasSeverity && (
        <div>
          <SectionLabel>Confirmed severity</SectionLabel>
          <div className="mt-3">
            <DonutChart data={severityData} centerLabel="Resolved reports" />
          </div>
        </div>
      )}
    </div>
  );
}
