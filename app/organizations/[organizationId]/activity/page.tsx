import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { AuditLogTable } from "../../../../components/organizations/audit-log-table";
import { canManageMembers } from "../../../../services/authorization";
import { AUDIT_CATEGORIES, getActorMembership, searchOrganizationAuditLog, type AuditCategory, type AuditLogFilters } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { perfTimed } from "../../../../lib/perf-trace";
import { ActivityDashboard } from "../../../../components/dashboards/activity-dashboard";
import { getOrganizationActivityDashboard } from "../../../../services/dashboards";
import { rangeDays } from "../../../../lib/viz";

/**
 * Audit log: every change made in the organization -- scope added, edited or removed, programs
 * changed, members and researchers added or removed, billing -- with who, when and exactly what
 * changed (before → after), filterable by category, text and dates. Owner / security admin only
 * (audit_logs' read policy; search_organization_audit_log checks the same). The activity charts
 * for the selected window sit below the log.
 */
export default async function OrganizationActivityPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Search> }) {
  return perfTimed("route: activity (total)", () => renderActivityPage(params, searchParams));
}

type Search = { range?: string; q?: string; category?: string; from?: string; to?: string; before?: string; beforeId?: string };
const isDate = (v?: string) => (v && /^d{4}-d{2}-d{2}$/.test(v) ? v : undefined);

async function renderActivityPage(paramsPromise: Promise<{ organizationId: string }>, searchParamsPromise: Promise<Search>) {
  const { organizationId } = await paramsPromise;
  const sp = await searchParamsPromise;
  const days = rangeDays(sp.range ?? "30");
  const filters: AuditLogFilters = {
    query: sp.q?.trim().slice(0, 100) || undefined,
    category: AUDIT_CATEGORIES.includes(sp.category as AuditCategory) ? (sp.category as AuditCategory) : undefined,
    from: isDate(sp.from),
    to: isDate(sp.to),
  };
  const before = sp.before && sp.beforeId && /^[0-9a-f-]{36}$/.test(sp.beforeId) && !Number.isNaN(Date.parse(sp.before)) ? { createdAt: sp.before, id: sp.beforeId } : undefined;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/activity` as Route);

  const actor = await perfTimed("activity: getActorMembership", () => getActorMembership(user.id, organizationId));
  if (!actor || actor.status !== "active" || !canManageMembers(actor.role)) {
    return (
      <AppShell title="Audit log" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an organization owner or security admin can view the audit log.</PermissionDenied>
      </AppShell>
    );
  }

  const [organizations, log, dashboard] = await perfTimed("activity: main batch", () =>
    Promise.all([listCurrentUserOrganizations(user.id), searchOrganizationAuditLog(organizationId, filters, before), getOrganizationActivityDashboard(organizationId, days)]),
  );
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Audit log" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization" }]} />

        <OrganizationHeader organizationName={organization?.name ?? "Organization"} organizationId={organizationId} logoVersion={await getOrganizationLogoVersion(organizationId)} />

        <div>
          <h2 id="audit-log" className="text-[15px] font-semibold text-ink">
            Every change, newest first
          </h2>
          <p className="text-[13px] text-ink-muted">Scope, programs, team, researchers, reports and billing: who changed what, and the value before and after.</p>
        </div>
        <AuditLogTable basePath={`/organizations/${organizationId}/activity`} filters={filters} entries={log.items} next={log.next} />

        <div className="border-t border-border pt-6">
          <ActivityDashboard data={dashboard} days={days} organizationId={organizationId} />
        </div>
      </div>
    </AppShell>
  );
}
