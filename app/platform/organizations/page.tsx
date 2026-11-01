import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ReinstateOrganizationForm, SuspendOrganizationForm } from "../../../components/platform/organization-suspension-form";
import { isPlatformAdmin, listSuspendedOrganizationsForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { LocalTime } from "../../../components/ui/local-time";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention every
 * other platform-admin queue in this codebase already established. Organization-status
 * control: see supabase/migrations/202609050016_organization_status_control.sql and
 * 202609050017_organization_operability_gate.sql. A single platform admin can suspend or
 * reinstate an organization -- 202609050017's own comment discloses this as a real,
 * disclosed limitation (no dual control yet, the single highest blast-radius item on
 * 0026's own list), not a silent assumption of safety. Uses <AppShell> like every other
 * authenticated page -- see app/platform/programs/page.tsx's own comment for why this
 * replaced a separate header+nav-bar component.
 */
export default async function PlatformOrganizationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/organizations" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const suspended = await listSuspendedOrganizationsForAdmin();

  return (
    <AppShell title="Organization status" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Suspend or reinstate an organization's ability to create programs, invite members, and submit programs for review.</p>

        <SuspendOrganizationForm />

        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-ink-muted">Currently suspended</h2>
          {suspended.length === 0 ? (
            <EmptyState title="No suspended organizations">No organization is currently suspended.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {suspended.map((organization) => (
                <li key={organization.id} className="p-4">
                  <p className="text-xs font-semibold text-danger">Suspended · <LocalTime value={organization.suspendedAt} /></p>
                  <p className="mt-1 text-sm font-medium text-ink">{organization.name}</p>
                  <ReinstateOrganizationForm organizationId={organization.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
