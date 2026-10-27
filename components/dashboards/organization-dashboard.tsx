import React from "react";
import { StatTile } from "../charts/stat-tile";
import { ChartCard } from "../charts/chart-card";
import { TrendChart } from "../charts/trend-chart";
import { BarList } from "../charts/bar-list";
import { SegmentedBar } from "../charts/segmented-bar";
import { RangeFilter } from "../charts/range-filter";
import { SEVERITY_SERIES, VIZ, change, compactMoney, compactNumber, formatHours, percent, reportStatusSegments, weekLabel } from "../../lib/viz";
import type { OrganizationDashboard as Data } from "../../services/dashboards";
import type { ReportStatus, ReportWeaknessType } from "../../types/report";
import { weaknessTypeLabel } from "../../lib/report-weakness-labels";

// The taxonomy's own labels: the old local map keyed by "xss"/"sqli"/"rce" never matched the
// stored values ("cross_site_scripting", ...), so most categories fell through to a fallback.
const weaknessLabel = (w: string) => weaknessTypeLabel(w as ReportWeaknessType) ?? w.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Organization analytics (HackerOne program analytics as the reference): KPI row, inflow by
 * severity, how fast the team triages, the status mix, which weaknesses and assets keep
 * producing valid findings, and who finds them. One RPC (get_organization_dashboard) for
 * the window; `statusCounts` is the existing all-time breakdown the page already loads.
 */
export function OrganizationDashboard({ data, days, organizationId, statusCounts }: { data: Data; days: number; organizationId: string; statusCounts: Map<ReportStatus, number> }) {
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const primary = data.awards[0];
  const window = `last ${days === 365 ? "12 months" : `${days} days`}`;
  const severitySeries = SEVERITY_SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color }));
  const inflow = data.weekly.map((w) => ({ label: weekLabel(w.week), values: { critical: w.critical, high: w.high, medium: w.medium, low: w.low, none: w.none, unrated: w.unrated } }));
  const triage = data.weekly.filter((w) => w.median_hours_to_triage !== null).map((w) => ({ label: weekLabel(w.week), values: { hours: w.median_hours_to_triage ?? 0 } }));
  const statusSegments = reportStatusSegments(statusCounts);
  const totalReports = statusSegments.reduce((sum, s) => sum + s.value, 0);

  return (
    <section aria-labelledby="org-dashboard" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="org-dashboard" className="text-lg font-semibold text-ink">
            Security overview
          </h2>
          <p className="text-sm text-ink-muted">Reports received in the {window}, compared with the period before.</p>
        </div>
        <RangeFilter basePath={`/organizations/${organizationId}/analytics`} current={days} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Reports received" value={compactNumber(now.received)} delta={change(now.received, before.received)} spark={data.weekly.map((w) => w.critical + w.high + w.medium + w.low + w.none + w.unrated)} />
        <StatTile
          label="Validity rate"
          value={percent(now.valid, now.decided) === null ? "--" : `${percent(now.valid, now.decided)}%`}
          hint={now.decided ? `${now.valid} valid of ${now.decided} decided` : "Nothing decided yet"}
          delta={change(percent(now.valid, now.decided), percent(before.valid, before.decided))}
        />
        <StatTile label="Open backlog" value={compactNumber(data.open_backlog)} hint="New, triaging, needs info or accepted" />
        <StatTile label="Median time to triage" value={formatHours(now.median_hours_to_triage)} delta={change(now.median_hours_to_triage, before.median_hours_to_triage)} goodWhen="down" spark={data.weekly.map((w) => w.median_hours_to_triage ?? 0)} />
        <StatTile label="Median time to close" value={now.median_days_to_resolution === null ? "--" : `${now.median_days_to_resolution}d`} delta={change(now.median_days_to_resolution, before.median_days_to_resolution)} goodWhen="down" />
        <StatTile label="Bounties awarded" value={primary ? compactMoney(primary.awarded, primary.currency) : "--"} hint={`${now.researchers} researcher${now.researchers === 1 ? "" : "s"} reported`} delta={primary ? change(primary.awarded, primary.awarded_previous) : null} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Report inflow by severity"
          subtitle={`Per week by confirmed severity, ${window}`}
          empty={now.received === 0 && "No reports received in this period."}
          table={{ columns: ["Week", ...severitySeries.map((s) => s.label)], rows: inflow.map((w) => [w.label, ...severitySeries.map((s) => w.values[s.key as keyof typeof w.values])]) }}
          className="lg:col-span-2"
        >
          <TrendChart mode="stacked" ariaLabel="Weekly report inflow by severity" series={severitySeries} points={inflow} />
        </ChartCard>

        <ChartCard
          title="Time to triage"
          subtitle={`Median hours from submission to first triage action, by week submitted`}
          empty={triage.length === 0 && "No triaged reports in this period."}
          table={{ columns: ["Week", "Median"], rows: triage.map((t) => [t.label, formatHours(t.values.hours)]) }}
        >
          <TrendChart mode="lines" ariaLabel="Median time to triage per week" format="hours" series={[{ key: "hours", label: "Median time to triage", color: VIZ[0] }]} points={triage} />
        </ChartCard>

        <ChartCard
          title="Status of all reports"
          subtitle={`${totalReports} report${totalReports === 1 ? "" : "s"}, all time`}
          table={{ columns: ["Status", "Reports"], rows: statusSegments.filter((s) => s.value > 0).map((s) => [s.label, s.value]) }}
        >
          <SegmentedBar data={statusSegments} />
        </ChartCard>

        <ChartCard title="Top vulnerability categories" subtitle={`Valid findings by vulnerability category, ${window}`} empty={data.weaknesses.length === 0 && "No valid findings in this period."}>
          <BarList items={data.weaknesses.map((w) => ({ label: weaknessLabel(w.weakness), value: w.count }))} />
        </ChartCard>

        <ChartCard title="Most-reported assets" subtitle={`Reports per asset, ${window}`} empty={data.assets.length === 0 && "No reports in this period."}>
          <BarList items={data.assets.map((a) => ({ label: a.target, value: a.count, secondary: `${a.count === 1 ? "report" : "reports"}, ${a.valid} valid` }))} />
        </ChartCard>

        <ChartCard title="Top researchers" subtitle={`Valid findings, ${window}`} empty={data.researchers.length === 0 && "No researchers reported in this period."} className="lg:col-span-2">
          <BarList items={data.researchers.map((r) => ({ label: r.name, value: r.valid, secondary: `of ${r.submitted}` }))} />
        </ChartCard>
      </div>
    </section>
  );
}
