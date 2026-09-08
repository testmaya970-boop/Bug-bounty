import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ReinstateOrganizationForm, SuspendOrganizationForm } from "../../../components/platform/organization-suspension-form";
import { isPlatformAdmin, listSuspendedOrganizationsForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatDateTime } from "../../../lib/format-date";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention every
 * other platform-admin queue in this codebase already established. Organization-status
 * control: see supabase/migrations/202609050016_organization_status_control.sql and
 * 202609050017_organization_operability_gate.sql. A single platform admin can suspend or
 * reinstate an organization -- 202609050017's own comment discloses this as a real,
 * disclosed limitation (no dual control yet, the single highest blast-radius item on
 * 0026's own list), not a silent assumption of safety.
 */
export default async function PlatformOrganizationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/organizations" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const suspended = await listSuspendedOrganizationsForAdmin();

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Unpatched</span>
          <span className="border-l border-border-strong pl-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Platform operations</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SectionLabel>Platform operations</SectionLabel>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Organization status</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Suspend or reinstate an organization's ability to create programs, invite members, and submit programs for review.</p>

        <div className="mt-8">
          <SuspendOrganizationForm />
        </div>

        <div className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Currently suspended</h2>
          {suspended.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="No suspended organizations">No organization is currently suspended.</EmptyState>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
              {suspended.map((organization) => (
                <li key={organization.id} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-danger">Suspended · {formatDateTime(organization.suspendedAt)}</p>
                  <p className="mt-1 text-sm font-medium text-ink">{organization.name}</p>
                  <ReinstateOrganizationForm organizationId={organization.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
