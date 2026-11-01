import React from "react";
import { StatTile } from "../charts/stat-tile";
import { ChartCard } from "../charts/chart-card";
import { TrendChart } from "../charts/trend-chart";
import { BarList } from "../charts/bar-list";
import { SegmentedBar } from "../charts/segmented-bar";
import { RangeFilter } from "../charts/range-filter";
import { SEVERITY_SERIES, VIZ, change, compactMoney, compactNumber, formatHours, percent, reportStatusSegments, weekLabel } from "../../lib/viz";
import type { ResearcherDashboard as Data } from "../../services/dashboards";
import type { ReportStatus } from "../../types/report";

/**
 * The researcher's own analytics (HackerOne's hacker dashboard is the reference): KPI row,
 * then status mix, weekly submissions by outcome, severity of valid findings, reputation
 * over time, earnings and the programs they get results on. Every number comes from
 * get_my_researcher_dashboard for the selected window.
 */
export function ResearcherDashboard({ data, days }: { data: Data; days: number }) {
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const primary = data.awards[0];
  const weeks = data.weekly.map((w) => ({ label: weekLabel(w.week), values: { valid: w.valid, invalid: w.invalid, other: Math.max(0, w.submitted - w.valid - w.invalid) } }));
  const status = new Map<ReportStatus, number>(data.status.map((s) => [s.status, s.count]));
  const statusSegments = reportStatusSegments(status);
  const totalReports = data.status.reduce((sum, s) => sum + s.count, 0);
  const severity = SEVERITY_SERIES.map((s) => ({ ...s, value: data.severity.find((x) => x.severity === s.key)?.count ?? 0 }));
  const earnings = primary ? data.weekly.map((w) => ({ label: weekLabel(w.week), values: { amount: data.earnings_weekly.filter((e) => e.week === w.week && e.currency === primary.currency).reduce((sum, e) => sum + e.amount, 0) / 100 } })) : [];
  const window = `last ${days === 365 ? "12 months" : `${days} days`}`;

  return (
    <section aria-labelledby="researcher-analytics" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="researcher-analytics" className="text-lg font-semibold text-ink">
            Your performance
          </h2>
          <p className="text-sm text-ink-muted">Reports you submitted in the {window}, compared with the period before.</p>
        </div>
        <RangeFilter basePath="/reports" current={days} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Reports submitted" value={compactNumber(now.submitted)} delta={change(now.submitted, before.submitted)} spark={data.weekly.map((w) => w.submitted)} />
        <StatTile
          label="Validity rate"
          value={percent(now.valid, now.decided) === null ? "--" : `${percent(now.valid, now.decided)}%`}
          hint={now.decided ? `${now.valid} valid of ${now.decided} decided` : "No decided reports yet"}
          delta={change(percent(now.valid, now.decided), percent(before.valid, before.decided))}
        />
        <StatTile label="Bounties awarded" value={primary ? compactMoney(primary.awarded, primary.currency) : "--"} hint={primary ? `${compactMoney(primary.paid, primary.currency)} paid out` : "None yet"} delta={primary ? change(primary.awarded, primary.awarded_previous) : null} />
        <StatTile label="Reputation" value={compactNumber(data.reputation)} delta={change(data.reputation, data.reputation_previous)} spark={data.reputation_weekly.map((w) => w.score)} />
        <StatTile label="Median first response" value={formatHours(now.median_hours_to_first_response)} hint="From submission to first triage action" delta={change(now.median_hours_to_first_response, before.median_hours_to_first_response)} goodWhen="down" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Status of all your reports"
          subtitle={`${totalReports} report${totalReports === 1 ? "" : "s"}, all time`}
          empty={totalReports === 0 && "You haven't submitted a report yet."}
          table={{ columns: ["Status", "Reports"], rows: statusSegments.filter((s) => s.value > 0).map((s) => [s.label, s.value]) }}
        >
          <SegmentedBar data={statusSegments} />
        </ChartCard>

        <ChartCard
          title="Severity of valid findings"
          subtitle={`Accepted and resolved, ${window}`}
          empty={now.valid === 0 && "No valid findings in this period yet."}
          table={{ columns: ["Severity", "Findings"], rows: severity.filter((s) => s.value > 0).map((s) => [s.label, s.value]) }}
        >
          <SegmentedBar data={severity.map((s) => ({ label: s.label, value: s.value, color: s.color }))} />
        </ChartCard>

        <ChartCard
          title="Reputation over time"
          subtitle={`Running total, ${window}`}
          table={{ columns: ["Week", "Reputation"], rows: data.reputation_weekly.map((w) => [weekLabel(w.week), w.score]) }}
        >
          <TrendChart mode="lines" ariaLabel="Reputation over time" series={[{ key: "score", label: "Reputation", color: VIZ[0] }]} points={data.reputation_weekly.map((w) => ({ label: weekLabel(w.week), values: { score: w.score } }))} />
        </ChartCard>

        <ChartCard
          title="Submissions by outcome"
          subtitle={`Per week, ${window}`}
          empty={now.submitted === 0 && "No reports in this period."}
          table={{ columns: ["Week", "Valid", "Not valid", "Other / open"], rows: weeks.map((w) => [w.label, w.values.valid, w.values.invalid, w.values.other]) }}
        >
          <TrendChart
            mode="stacked"
            ariaLabel="Weekly submissions by outcome"
            series={[
              { key: "valid", label: "Valid", color: VIZ[0] },
              { key: "invalid", label: "Not valid", color: VIZ[1] },
              { key: "other", label: "Other / still open", color: VIZ[2] },
            ]}
            points={weeks}
          />
        </ChartCard>

        <ChartCard
          title="Bounty earnings"
          subtitle={primary ? `${primary.currency} awarded per week, ${window}` : `Per week, ${window}`}
          empty={!primary && "No bounties awarded yet."}
          table={primary ? { columns: ["Week", `Awarded (${primary.currency})`], rows: earnings.filter((e) => e.values.amount > 0).map((e) => [e.label, e.values.amount.toLocaleString("en-US")]) } : undefined}
        >
          {primary && <TrendChart mode="stacked" ariaLabel="Bounty earnings per week" format={`money:${primary.currency}`} series={[{ key: "amount", label: "Awarded", color: VIZ[0] }]} points={earnings} />}
        </ChartCard>

        <ChartCard title="Where you find valid bugs" subtitle={`Valid reports per program, ${window}`} empty={data.programs.length === 0 && "No reports in this period."}>
          <BarList items={data.programs.map((p) => ({ label: p.name, value: p.valid, secondary: `of ${p.submitted}` }))} />
        </ChartCard>
      </div>
    </section>
  );
}
