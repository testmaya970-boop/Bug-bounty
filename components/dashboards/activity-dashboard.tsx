import React from "react";
import { StatTile } from "../charts/stat-tile";
import { ChartCard } from "../charts/chart-card";
import { TrendChart } from "../charts/trend-chart";
import { BarList } from "../charts/bar-list";
import { RangeFilter } from "../charts/range-filter";
import { VIZ, change, compactNumber, weekLabel } from "../../lib/viz";
import { activityActionLabel } from "../../lib/organization-activity-labels";
import type { ActivityDashboard as Data } from "../../services/dashboards";

const CATEGORIES = [
  { key: "reports", label: "Reports", color: VIZ[0] },
  { key: "programs", label: "Programs & scope", color: VIZ[1] },
  { key: "team", label: "Team & access", color: VIZ[2] },
  { key: "money", label: "Bounties & payments", color: VIZ[3] },
  { key: "other", label: "Other", color: VIZ[4] },
] as const;

/**
 * Activity is the organization's audit trail, not an inbox: who did what, how much, and how
 * much of it touched access, money or scope. Notifications stays the personal inbox.
 */
export function ActivityDashboard({ data, days, organizationId }: { data: Data; days: number; organizationId: string }) {
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const window = `last ${days === 365 ? "12 months" : `${days} days`}`;
  const points = data.weekly.map((w) => ({ label: weekLabel(w.week), values: { reports: w.reports, programs: w.programs, team: w.team, money: w.money, other: w.other } }));
  const exportHref = `/organizations/${organizationId}/activity/export?range=${days}`;

  return (
    <section aria-labelledby="audit-overview" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="audit-overview" className="text-lg font-semibold text-ink">
            Audit overview
          </h2>
          <p className="text-sm text-ink-muted">Everything done in this organization in the {window}, compared with the period before.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeFilter basePath={`/organizations/${organizationId}/activity`} current={days} />
          {/* A download, not a page: a plain anchor so the browser saves the file. */}
          <a
            href={exportHref}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Actions recorded" value={compactNumber(now.actions)} delta={change(now.actions, before.actions)} spark={data.weekly.map((w) => w.reports + w.programs + w.team + w.money + w.other)} />
        <StatTile label="People who acted" value={compactNumber(now.people)} hint="Team members, researchers and system jobs" delta={change(now.people, before.people)} />
        <StatTile label="Sensitive actions" value={compactNumber(now.sensitive)} hint="Access, money, scope and visibility changes" delta={change(now.sensitive, before.sensitive)} goodWhen="down" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Activity by area"
          subtitle={`Actions per week, ${window}`}
          empty={now.actions === 0 && "Nothing was recorded in this period."}
          table={{ columns: ["Week", ...CATEGORIES.map((c) => c.label)], rows: points.map((p) => [p.label, ...CATEGORIES.map((c) => p.values[c.key])]) }}
          className="lg:col-span-2"
        >
          <TrendChart mode="stacked" ariaLabel="Weekly actions by area" series={CATEGORIES.map((c) => ({ key: c.key, label: c.label, color: c.color }))} points={points} />
        </ChartCard>

        <ChartCard title="Most frequent actions" subtitle={`${window}; sensitive ones marked`} empty={data.top_actions.length === 0 && "Nothing was recorded in this period."}>
          <BarList items={data.top_actions.map((a) => ({ label: activityActionLabel(a.action), value: a.count, secondary: a.sensitive ? "sensitive" : undefined }))} />
        </ChartCard>

        <ChartCard title="Most active people" subtitle={`Actions taken, ${window}`} empty={data.top_people.length === 0 && "Nothing was recorded in this period."}>
          <BarList items={data.top_people.map((p) => ({ label: p.name, value: p.count, secondary: p.name === "System" ? "automated" : p.is_member ? "team" : "researcher" }))} />
        </ChartCard>
      </div>
    </section>
  );
}
