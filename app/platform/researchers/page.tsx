import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ReinstateResearcherForm, SuspendResearcherForm } from "../../../components/platform/researcher-suspension-form";
import { isPlatformAdmin, listSuspendedResearchersForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatDateTime } from "../../../lib/format-date";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention every
 * other platform-admin queue in this codebase already established. Cross-program,
 * platform-wide researcher suspension: see supabase/migrations/
 * 202609050014_researcher_platform_suspension.sql. A single platform admin can suspend or
 * reinstate a researcher -- that migration's own comment discloses this as a real,
 * disclosed limitation (no dual control yet), not a silent assumption of safety. Uses
 * <AppShell> like every other authenticated page -- see app/platform/programs/page.tsx's
 * own comment for why this replaced a separate header+nav-bar component.
 */
export default async function PlatformResearchersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/researchers" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const suspended = await listSuspendedResearchersForAdmin();

  return (
    <AppShell title="Researcher suspension" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Suspend or reinstate a researcher's account platform-wide, across every organization and program.</p>

        <SuspendResearcherForm />

        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Currently suspended</h2>
          {suspended.length === 0 ? (
            <EmptyState title="No suspended researchers">No researcher is currently suspended platform-wide.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {suspended.map((researcher) => (
                <li key={researcher.id} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-danger">Suspended · {formatDateTime(researcher.suspendedAt)}</p>
                  <p className="mt-1 text-sm font-medium text-ink">{researcher.displayName}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    @{researcher.username} · {researcher.email}
                  </p>
                  <ReinstateResearcherForm userId={researcher.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
