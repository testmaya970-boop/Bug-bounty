import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { DownloadSimple, CalendarPlus } from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { SeverityBadge, StatusBadge, ToneBadge, TONE } from "../../../../../components/ui/badge";
import { AnalyticsTabs } from "../../../../../components/analytics/analytics-tabs";
import { ExploreFilters } from "../../../../../components/analytics/explore-filters";
import { StatTile } from "../../../../../components/charts/stat-tile";
import { ChartCard } from "../../../../../components/charts/chart-card";
import { TrendChart } from "../../../../../components/charts/trend-chart";
import { SegmentedBar } from "../../../../../components/charts/segmented-bar";
import { BarList } from "../../../../../components/charts/bar-list";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../../services/organization-members";
import { canViewOrganizationAnalytics } from "../../../../../services/authorization";
import { listCurrentUserOrganizations } from "../../../../../services/organizations";
import { listProgramsForOrganization } from "../../../../../services/programs";
import { getExploreData } from "../../../../../services/analytics-explorer";
import { parseAnalyticsFilters, filtersToSearch } from "../../../../../lib/analytics/filters";
import { computeAnalytics, SEVERITY_KEYS, type Money } from "../../../../../lib/analytics/report-metrics";
import { SEVERITY_SERIES, VIZ, compactMoney, formatHours, reportStatusSegments, weekLabel } from "../../../../../lib/viz";
import { EXPORT_TYPES, type ExportFormat } from "../../../../../lib/exports/analytics-files";
import { LocalTime } from "../../../../../components/ui/local-time";

const HEALTH_TONE = { Healthy: TONE.success, Watch: TONE.warning, "At risk": TONE.danger } as const;
const money = (m: Money[]) => (m.length ? m.map((x) => compactMoney(x.minorUnits, x.currency)).join(" + ") : "--");
const pctText = (v: number | null) => (v === null ? "--" : `${v}%`);
const TH = "px-3 py-2.5 text-left text-xs font-semibold text-ink-muted";
const TD = "px-3 py-2.5 tabular-nums text-ink";

function Table({ caption, columns, children, empty }: { caption: string; columns: { label: string; numeric?: boolean }[]; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">{caption}</h3>
      {empty ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">Nothing matches these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col" className={`${TH} ${c.numeric ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">{children}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Explore & export: every KPI and table recomputed for the chosen workspace, dates, programs,
 * severities, statuses and assets -- the same numbers the CSV, Excel and PDF exports carry.
 */
export default async function AnalyticsExplorePage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/analytics/explore` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canViewOrganizationAnalytics(actor.role)) {
    return (
      <AppShell title="Analytics" user={user} organizationId={organizationId}>
        <PermissionDenied>Analytics are available to owners, security admins and program managers.</PermissionDenied>
      </AppShell>
    );
  }

  const filters = parseAnalyticsFilters(await searchParams);
  const [organizations, programs, data] = await Promise.all([listCurrentUserOrganizations(user.id), listProgramsForOrganization(organizationId), getExploreData(organizationId, filters)]);
  const analytics = computeAnalytics(data.facts, data.scopeAssets, filters);
  const k = analytics.kpis;
  const basePath = `/organizations/${organizationId}/analytics/explore`;
  const query = filtersToSearch(filters);
  const severitySeries = SEVERITY_SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color }));
  const inflow = analytics.weekly.map((w) => ({ label: weekLabel(`${w.weekStart}T00:00:00Z`), values: Object.fromEntries(SEVERITY_KEYS.map((s) => [s, w[s]])) as Record<string, number> }));
  const mtta = analytics.weekly.filter((w) => w.mttaHours !== null).map((w) => ({ label: weekLabel(`${w.weekStart}T00:00:00Z`), values: { hours: w.mttaHours! } }));
  const statusSegments = reportStatusSegments(analytics.byStatus);

  return (
    <AppShell title="Analytics" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Analytics", href: `/organizations/${organizationId}/analytics` }, { label: "Explore & export" }]} />
        <AnalyticsTabs organizationId={organizationId} active="explore" />

        <ExploreFilters
          basePath={basePath}
          filters={filters}
          organizationId={organizationId}
          workspaces={organizations.filter((o) => canViewOrganizationAnalytics(o.role)).map((o) => ({ value: o.id, label: o.name }))}
          programs={programs.map((p) => ({ value: p.id, label: p.name }))}
          assets={data.assetOptions.map((a) => ({ value: a.assetId, label: a.assetLabel }))}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{k.total}</span> report{k.total === 1 ? "" : "s"} match.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink-muted">Export this view</span>
            {(Object.keys(EXPORT_TYPES) as ExportFormat[]).map((format) => (
              <a
                key={format}
                href={`/organizations/${organizationId}/analytics/explore/export?${query}&format=${format}`}
                download
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <DownloadSimple aria-hidden="true" className="size-4" />
                {EXPORT_TYPES[format].label}
              </a>
            ))}
            <Link
              prefetch={false}
              href={`/organizations/${organizationId}/analytics/schedules?${query}` as Route}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <CalendarPlus aria-hidden="true" className="size-4" />
              Schedule it
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Reports" value={String(k.total)} hint={`${k.valid} valid${k.validRate === null ? "" : `, ${k.validRate}% of closed`}`} spark={analytics.weekly.map((w) => w.total)} />
          <StatTile label="Open critical or high" value={String(k.criticalHighOpen)} hint={`${k.open} open in total`} />
          <StatTile label="MTTA" value={formatHours(k.mttaHours)} hint="Median time to first response" spark={analytics.weekly.map((w) => w.mttaHours ?? 0)} />
          <StatTile label="MTTR" value={k.mttrDays === null ? "--" : `${Math.round(k.mttrDays * 10) / 10}d`} hint="Median time to resolve" />
          <StatTile label="SLA compliance" value={pctText(k.slaCompliance)} hint={`${k.slaMet} checkpoints met, ${k.slaBreached} missed`} />
          <StatTile label="Bounties paid" value={money(k.paid)} hint={k.awarded.length ? `Awarded ${money(k.awarded)}` : "No awards in this period"} />
          <StatTile label="Asset coverage" value={pctText(k.assetCoverage)} hint={`${k.assetsCovered} of ${k.assetsInScope} in-scope assets reported on`} />
          <StatTile label="Researchers" value={String(k.researchers)} hint={`Median time to triage ${formatHours(k.medianTriageHours)}`} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Severity trend"
            subtitle="Reports per week by confirmed severity"
            empty={k.total === 0 && "No reports match these filters."}
            table={{ columns: ["Week", ...severitySeries.map((s) => s.label)], rows: inflow.map((w) => [w.label, ...severitySeries.map((s) => w.values[s.key])]) }}
            className="lg:col-span-2"
          >
            <TrendChart mode="stacked" ariaLabel="Reports per week by severity" series={severitySeries} points={inflow} />
          </ChartCard>
          <ChartCard title="MTTA by week" subtitle="Median hours from submission to first response, by week submitted" empty={mtta.length === 0 && "No responses yet in this period."} table={{ columns: ["Week", "MTTA"], rows: mtta.map((m) => [m.label, formatHours(m.values.hours)]) }}>
            <TrendChart mode="lines" format="hours" ariaLabel="Median time to first response per week" series={[{ key: "hours", label: "MTTA", color: VIZ[0] }]} points={mtta} />
          </ChartCard>
          <ChartCard title="Where reports stand" subtitle="Current status of the matching reports" empty={k.total === 0 && "No reports match these filters."} table={{ columns: ["Status", "Reports"], rows: statusSegments.filter((s) => s.value > 0).map((s) => [s.label, s.value]) }}>
            <SegmentedBar data={statusSegments} />
            <div className="mt-5">
              <BarList items={SEVERITY_SERIES.map((s) => ({ label: s.label, value: analytics.bySeverity[s.key] }))} />
            </div>
          </ChartCard>
        </div>

        <Table
          caption="Program health"
          empty={analytics.programs.length === 0}
          columns={[{ label: "Program" }, { label: "Health" }, { label: "Reports", numeric: true }, { label: "Open", numeric: true }, { label: "Crit/High open", numeric: true }, { label: "Open 30d+", numeric: true }, { label: "SLA", numeric: true }, { label: "MTTA", numeric: true }, { label: "Paid", numeric: true }]}
        >
          {analytics.programs.map((p) => (
            <tr key={p.programId}>
              <td className={`${TD} font-medium`}>{p.programName}</td>
              <td className={TD}>
                <ToneBadge tone={HEALTH_TONE[p.healthLabel]}>
                  {p.healthScore} · {p.healthLabel}
                </ToneBadge>
              </td>
              <td className={`${TD} text-right`}>{p.total}</td>
              <td className={`${TD} text-right`}>{p.open}</td>
              <td className={`${TD} text-right ${p.criticalHighOpen ? "font-semibold text-danger" : ""}`}>{p.criticalHighOpen}</td>
              <td className={`${TD} text-right ${p.agingOver30Days ? "font-semibold text-warning" : ""}`}>{p.agingOver30Days}</td>
              <td className={`${TD} text-right`}>{pctText(p.slaCompliance)}</td>
              <td className={`${TD} text-right`}>{formatHours(p.mttaHours)}</td>
              <td className={`${TD} text-right`}>{money(p.paid)}</td>
            </tr>
          ))}
        </Table>
        <p className="-mt-4 text-xs text-ink-muted">Health is out of 100: missed SLA checkpoints cost up to 40 points, open reports older than 30 days up to 30, and open critical or high reports up to 30.</p>

        <Table
          caption="Researcher performance"
          empty={analytics.researchers.length === 0}
          columns={[{ label: "Researcher" }, { label: "Reports", numeric: true }, { label: "Valid", numeric: true }, { label: "Validity", numeric: true }, { label: "Critical", numeric: true }, { label: "High", numeric: true }, { label: "Avg CVSS", numeric: true }, { label: "Paid", numeric: true }, { label: "Last report" }]}
        >
          {analytics.researchers.slice(0, 50).map((r) => (
            <tr key={r.researcherId}>
              <td className={`${TD} font-medium`}>
                <Link prefetch={false} href={`/organizations/${organizationId}/researchers/${r.researcherId}` as Route} className="hover:text-action">
                  {r.researcherName}
                </Link>
              </td>
              <td className={`${TD} text-right`}>{r.total}</td>
              <td className={`${TD} text-right`}>{r.valid}</td>
              <td className={`${TD} text-right`}>{pctText(r.validRate)}</td>
              <td className={`${TD} text-right`}>{r.critical}</td>
              <td className={`${TD} text-right`}>{r.high}</td>
              <td className={`${TD} text-right`}>{r.averageCvss ?? "--"}</td>
              <td className={`${TD} text-right`}>{money(r.paid)}</td>
              <td className={`${TD} text-ink-muted`}>
                <LocalTime value={r.lastSubmittedAt} />
              </td>
            </tr>
          ))}
        </Table>

        <Table
          caption={`Asset coverage: ${k.assetsCovered} of ${k.assetsInScope} in-scope assets have a report in this period`}
          empty={analytics.assets.length === 0}
          columns={[{ label: "Asset" }, { label: "Type" }, { label: "Scope" }, { label: "Reports", numeric: true }, { label: "Valid", numeric: true }, { label: "Open", numeric: true }]}
        >
          {analytics.assets.slice(0, 100).map((a) => (
            <tr key={a.assetId}>
              <td className={`${TD} max-w-80 truncate font-mono text-xs`}>{a.assetLabel}</td>
              <td className={`${TD} text-ink-muted`}>{a.assetType.replace(/_/g, " ")}</td>
              <td className={TD}>{a.inScope ? a.reports > 0 ? <ToneBadge tone={TONE.success}>Covered</ToneBadge> : <ToneBadge tone={TONE.warning}>No reports</ToneBadge> : <ToneBadge tone={TONE.muted}>Not in scope</ToneBadge>}</td>
              <td className={`${TD} text-right`}>{a.reports}</td>
              <td className={`${TD} text-right`}>{a.valid}</td>
              <td className={`${TD} text-right`}>{a.open}</td>
            </tr>
          ))}
        </Table>

        <Table
          caption={`Reports (latest ${Math.min(25, data.facts.length)} of ${data.facts.length}; the exports include every one)`}
          empty={data.facts.length === 0}
          columns={[{ label: "Report" }, { label: "Program" }, { label: "Severity" }, { label: "Status" }, { label: "Submitted" }, { label: "First response", numeric: true }]}
        >
          {data.facts.slice(0, 25).map((f) => (
            <tr key={f.reportId}>
              <td className={`${TD} max-w-80`}>
                <Link prefetch={false} href={`/organizations/${organizationId}/programs/${f.programId}/reports/${f.reportId}` as Route} className="line-clamp-1 font-medium hover:text-action">
                  {f.title}
                </Link>
              </td>
              <td className={`${TD} text-ink-muted`}>{f.programName}</td>
              <td className={TD}>{f.severity ? <SeverityBadge severity={f.severity} /> : <span className="text-xs text-ink-muted">Not rated</span>}</td>
              <td className={TD}>
                <StatusBadge status={f.status} />
              </td>
              <td className={`${TD} text-ink-muted`}>
                <LocalTime value={f.submittedAt} />
              </td>
              <td className={`${TD} text-right`}>{f.firstResponseAt ? formatHours((new Date(f.firstResponseAt).getTime() - new Date(f.submittedAt).getTime()) / 3_600_000) : "--"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </AppShell>
  );
}
