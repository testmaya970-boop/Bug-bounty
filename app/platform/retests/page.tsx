import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ResolveRetestForm } from "../../../components/platform/resolve-retest-form";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listEscalatedRetestsForAdmin } from "../../../services/reports";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { LocalTime } from "../../../components/ui/local-time";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention
 * app/platform/mediations/page.tsx already established. Retests a researcher escalated
 * because the organization was unresponsive or the researcher disagreed with the
 * organization's own retest decision. Shows real report content (title, requester notes),
 * mirroring list_escalated_mediations_for_admin's own exception to the "never report
 * content" rule -- see list_escalated_retests_for_admin's own comment. Uses <AppShell>
 * like every other authenticated page -- see app/platform/programs/page.tsx's own comment
 * for why this replaced a separate header+nav-bar component.
 */
export default async function PlatformRetestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/retests" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const retests = await listEscalatedRetestsForAdmin();

  return (
    <AppShell title="Escalated retests" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Retest requests a researcher escalated past their organization, across every organization.</p>

        {retests.length === 0 ? (
          <EmptyState title="No escalated retests">Nothing is currently awaiting platform review.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {retests.map((retest) => (
              <li key={retest.id} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger">Escalated · <LocalTime value={retest.escalatedAt ?? retest.requestedAt} /></p>
                <p className="mt-1 text-sm font-medium text-ink">{retest.reportTitle}</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {retest.organizationName} / {retest.programName} · Requested by {retest.requestedByName}
                </p>
                {retest.requesterNotes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{retest.requesterNotes}</p>}
                <ResolveRetestForm retestId={retest.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
