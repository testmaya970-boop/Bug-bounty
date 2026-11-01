import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../../../components/ui/badge";
import { LocalTime } from "../../../../../components/ui/local-time";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { AnalyticsTabs } from "../../../../../components/analytics/analytics-tabs";
import { DeleteScheduleButton, ScheduleExportForm } from "../../../../../components/analytics/schedule-forms";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../../services/organization-members";
import { canViewOrganizationAnalytics } from "../../../../../services/authorization";
import { listProgramsForOrganization } from "../../../../../services/programs";
import { listExportRuns, listExportSchedules } from "../../../../../services/analytics-explorer";
import { filtersToSearch, parseAnalyticsFilters } from "../../../../../lib/analytics/filters";
import { EXPORT_TYPES } from "../../../../../lib/exports/analytics-files";
import { reportStatusLabel } from "../../../../../lib/report-status";
import type { ReportStatus } from "../../../../../types/report";

const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "Info", unrated: "Not yet rated" };

/** Weekly or monthly exports of a saved Explore view, emailed as a sign-in download link. */
export default async function AnalyticsSchedulesPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/analytics/schedules` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canViewOrganizationAnalytics(actor.role)) {
    return (
      <AppShell title="Analytics" user={user} organizationId={organizationId}>
        <PermissionDenied>Analytics are available to owners, security admins and program managers.</PermissionDenied>
      </AppShell>
    );
  }
  const filters = parseAnalyticsFilters(await searchParams);
  const [schedules, runs, programs] = await Promise.all([listExportSchedules(organizationId), listExportRuns(organizationId), listProgramsForOrganization(organizationId)]);
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const describe = (f: Record<string, string[]>) =>
    [
      f.program_ids?.length ? `Programs: ${f.program_ids.map((id) => programName.get(id) ?? "Unknown").join(", ")}` : "All programs",
      f.severities?.length ? `Severity: ${f.severities.map((s) => SEVERITY_LABEL[s] ?? s).join(", ")}` : null,
      f.statuses?.length ? `Status: ${f.statuses.map((s) => reportStatusLabel(s as ReportStatus)).join(", ")}` : null,
      f.asset_ids?.length ? `${f.asset_ids.length} asset${f.asset_ids.length === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const current = describe({ program_ids: filters.programIds, severities: filters.severities, statuses: filters.statuses, asset_ids: filters.assetIds });

  return (
    <AppShell title="Analytics" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Analytics", href: `/organizations/${organizationId}/analytics` }, { label: "Scheduled exports" }]} />
        <AnalyticsTabs organizationId={organizationId} active="schedules" />

        <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <div>
            <SectionLabel>New scheduled export</SectionLabel>
            <p className="mt-1 text-sm text-ink-muted">
              Uses these filters: <span className="text-ink">{current}</span>.{" "}
              <Link prefetch={false} href={`/organizations/${organizationId}/analytics/explore?${filtersToSearch(filters)}` as Route} className="font-medium text-action hover:text-action-hover">
                Change them in Explore
              </Link>
              . Each run covers the previous week or month. The file is built with your access at the time, kept for 90 days, and emailed to you as a link that needs you to sign in; report data is never in the email.
            </p>
          </div>
          <ScheduleExportForm organizationId={organizationId} query={filtersToSearch(filters)} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Active schedules</h2>
          {schedules.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">No scheduled exports yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {schedules.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{s.name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {EXPORT_TYPES[s.format].label}, every {s.frequency === "weekly" ? "week" : "month"} · {describe(s.filters)} · by {s.createdByName ?? "a team member"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Next run <LocalTime value={s.nextRunAt} />
                    </p>
                  </div>
                  {(s.createdBy === user.id || actor.role === "owner" || actor.role === "security_admin") && <DeleteScheduleButton organizationId={organizationId} scheduleId={s.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Recent files</h2>
          {runs.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">Files appear here after each scheduled run.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {r.scheduleName ?? "Export"} · {r.periodFrom} to {r.periodTo}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      <LocalTime value={r.createdAt} /> · {EXPORT_TYPES[r.format].label}
                      {r.byteSize ? ` · ${Math.max(1, Math.round(r.byteSize / 1024))} KB` : ""}
                    </p>
                    {r.error && <p className="mt-0.5 text-xs text-danger">{r.error}</p>}
                  </div>
                  {r.status === "ready" ? (
                    <a href={`/organizations/${organizationId}/analytics/exports/${r.id}`} download className="text-sm font-medium text-action hover:text-action-hover">
                      Download
                    </a>
                  ) : (
                    <ToneBadge tone={TONE.danger}>Failed</ToneBadge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
