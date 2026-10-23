import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { StatTile } from "../charts/stat-tile";
import { ChartCard } from "../charts/chart-card";
import { TrendChart } from "../charts/trend-chart";
import { BarList } from "../charts/bar-list";
import { SegmentedBar } from "../charts/segmented-bar";
import { RangeFilter } from "../charts/range-filter";
import { VIZ, change, compactMoney, compactNumber, percent, weekLabel } from "../../lib/viz";
import type { PlatformDashboard as Data } from "../../services/dashboards";

// Program lifecycle order, so the bar reads left to right like the lifecycle itself.
const PROGRAM_STATUS = [
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "review", label: "In review" },
  { key: "draft", label: "Draft" },
  { key: "suspended", label: "Suspended" },
  { key: "closed", label: "Closed" },
];

const MONITOR = {
  ok: { label: "OK", chip: "bg-success/15 text-success", tile: "border-border bg-surface hover:border-border-strong" },
  warn: { label: "WARN", chip: "bg-warning/15 text-warning", tile: "border-warning/40 bg-warning/5 hover:border-warning" },
  alert: { label: "ALERT", chip: "bg-danger text-on-danger", tile: "border-danger/40 bg-danger/5 hover:border-danger" },
};

/**
 * The platform operator's overview: what needs a person now (launch reviews, KYC,
 * mediations, errors -- each linking to its queue), then platform health over the window:
 * report volume and validity, sign-ups on each side, payouts, and where the volume is.
 */
export function PlatformDashboard({ data, days }: { data: Data; days: number }) {
  const r = data.reports.current;
  const rp = data.reports.previous;
  const s = data.signups.current;
  const sp = data.signups.previous;
  const primary = data.payouts[0];
  const window = `last ${days === 365 ? "12 months" : `${days} days`}`;
  const reportsWeekly = data.weekly.map((w) => ({ label: weekLabel(w.week), values: { valid: w.valid, other: Math.max(0, w.reports - w.valid) } }));
  const signupsWeekly = data.weekly.map((w) => ({ label: weekLabel(w.week), values: { researchers: w.researchers, organizations: w.organization_accounts } }));
  const programSegments = PROGRAM_STATUS.map((p, i) => ({ label: p.label, value: data.programs_by_status.find((x) => x.status === p.key)?.count ?? 0, color: VIZ[i] }));
  const t = data.totals;
  const queues = [
    { label: "Launch reviews", value: t.pending_launches, href: "/platform/programs" },
    { label: "KYC to review", value: t.kyc_pending, href: "/platform/kyc" },
    { label: "Open mediations", value: t.open_mediations, href: "/platform/mediations" },
    { label: "Errors (24h)", value: t.errors_24h, href: "/platform/errors" },
  ];

  const monitors = queues.map((q) => ({ ...q, state: (q.value === 0 ? "ok" : q.href === "/platform/errors" ? "alert" : "warn") as keyof typeof MONITOR }));

  return (
    <div className="space-y-6">
      {/* Queues as monitors (Datadog-style): each has a state, never just a number -- OK when
          empty, Warn when work is waiting, Alert for errors in the last 24 hours. */}
      <section aria-labelledby="queues">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="queues" className="text-[13px] font-semibold text-ink">
            Monitors
          </h2>
          <p className="text-xs text-ink-muted">
            {(["ok", "warn", "alert"] as const).map((st) => `${monitors.filter((m) => m.state === st).length} ${MONITOR[st].label}`).join(" · ")}
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {monitors.map((q) => (
            <li key={q.label}>
              <Link
                prefetch={false}
                href={q.href as Route}
                className={`block rounded-lg border px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${MONITOR[q.state].tile}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink">{q.label}</span>
                  <span className={`rounded px-1.5 py-px text-[10px] font-bold ${MONITOR[q.state].chip}`}>{MONITOR[q.state].label}</span>
                </span>
                <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums text-ink">
                  {q.value}
                  <span className="sr-only"> -- open queue</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="platform-health" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="platform-health" className="text-lg font-semibold text-ink">
              Platform health
            </h2>
            <p className="text-sm text-ink-muted">Activity in the {window}, compared with the period before.</p>
          </div>
          <RangeFilter basePath="/platform" current={days} />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Reports submitted" value={compactNumber(r.reports)} delta={change(r.reports, rp.reports)} spark={data.weekly.map((w) => w.reports)} />
          <StatTile label="Validity rate" value={percent(r.valid, r.decided) === null ? "--" : `${percent(r.valid, r.decided)}%`} hint={r.decided ? `${r.valid} valid of ${r.decided} decided` : "Nothing decided yet"} delta={change(percent(r.valid, r.decided), percent(rp.valid, rp.decided))} />
          <StatTile label="Bounties paid" value={primary ? compactMoney(primary.paid, primary.currency) : "--"} delta={primary ? change(primary.paid, primary.paid_previous) : null} />
          <StatTile label="New researchers" value={compactNumber(s.researchers)} hint={`${compactNumber(t.researchers)} active in total`} delta={change(s.researchers, sp.researchers)} spark={data.weekly.map((w) => w.researchers)} />
          <StatTile label="New organization accounts" value={compactNumber(s.organization_accounts)} hint={`${compactNumber(t.active_organizations)} active organizations`} delta={change(s.organization_accounts, sp.organization_accounts)} spark={data.weekly.map((w) => w.organization_accounts)} />
          <StatTile label="Live programs" value={compactNumber(t.active_programs)} hint="Accepting reports now" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Report volume"
            subtitle={`Per week, valid vs everything else, ${window}`}
            empty={r.reports === 0 && "No reports in this period."}
            table={{ columns: ["Week", "Valid", "Other"], rows: reportsWeekly.map((w) => [w.label, w.values.valid, w.values.other]) }}
          >
            <TrendChart
              mode="stacked"
              ariaLabel="Weekly report volume"
              series={[
                { key: "valid", label: "Valid", color: VIZ[0] },
                { key: "other", label: "Open, duplicate or not valid", color: VIZ[1] },
              ]}
              points={reportsWeekly}
            />
          </ChartCard>

          <ChartCard
            title="Sign-ups"
            subtitle={`Confirmed accounts per week, ${window}`}
            table={{ columns: ["Week", "Researchers", "Organization accounts"], rows: signupsWeekly.map((w) => [w.label, w.values.researchers, w.values.organizations]) }}
          >
            <TrendChart
              mode="lines"
              ariaLabel="Weekly sign-ups by account type"
              series={[
                { key: "researchers", label: "Researchers", color: VIZ[0] },
                { key: "organizations", label: "Organization accounts", color: VIZ[1] },
              ]}
              points={signupsWeekly}
            />
          </ChartCard>

          <ChartCard title="Busiest organizations" subtitle={`Reports received, ${window}`} empty={data.top_organizations.length === 0 && "No reports in this period."}>
            <BarList items={data.top_organizations.map((o) => ({ label: o.name, value: o.reports, secondary: `${o.reports === 1 ? "report" : "reports"}, ${o.valid} valid` }))} />
          </ChartCard>

          <ChartCard title="Programs by status" subtitle="Every program on the platform, now" table={{ columns: ["Status", "Programs"], rows: programSegments.filter((p) => p.value > 0).map((p) => [p.label, p.value]) }}>
            <SegmentedBar data={programSegments} />
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
