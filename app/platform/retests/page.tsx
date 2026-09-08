import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ResolveRetestForm } from "../../../components/platform/resolve-retest-form";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listEscalatedRetestsForAdmin } from "../../../services/reports";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatDateTime } from "../../../lib/format-date";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention
 * app/platform/mediations/page.tsx already established. Retests a researcher escalated
 * because the organization was unresponsive or the researcher disagreed with the
 * organization's own retest decision. Shows real report content (title, requester notes),
 * mirroring list_escalated_mediations_for_admin's own exception to the "never report
 * content" rule -- see list_escalated_retests_for_admin's own comment.
 */
export default async function PlatformRetestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/retests" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const retests = await listEscalatedRetestsForAdmin();

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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Escalated retests</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Retest requests a researcher escalated past their organization, across every organization.</p>

        {retests.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No escalated retests">Nothing is currently awaiting platform review.</EmptyState>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-border rounded-lg border border-border bg-surface">
            {retests.map((retest) => (
              <li key={retest.id} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger">Escalated · {formatDateTime(retest.escalatedAt ?? retest.requestedAt)}</p>
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
      </main>
    </div>
  );
}
