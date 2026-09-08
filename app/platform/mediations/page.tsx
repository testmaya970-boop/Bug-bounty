import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ResolveMediationForm } from "../../../components/platform/resolve-mediation-form";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listEscalatedMediationsForAdmin } from "../../../services/reports";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatDateTime } from "../../../lib/format-date";

const MEDIATION_REASON_LABEL: Record<string, string> = {
  disagree_with_outcome: "Disagrees with the outcome",
  disagree_with_severity: "Disagrees with the confirmed severity",
  disagree_with_bounty: "Disagrees with the bounty amount",
  unresponsive_communication: "Organization stopped responding",
  other: "Other",
};

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention
 * app/platform/needs-recovery/page.tsx already established. This is the second real
 * platform-admin queue (the first genuine expansion beyond Needs Recovery): mediations a
 * researcher escalated because the organization was unresponsive or the researcher
 * disagreed with how it was handled. Unlike Needs Recovery's deliberately opaque rows,
 * this queue DOES show real report content (title, dispute description) -- adjudicating a
 * dispute genuinely requires reading what was disputed and why; see
 * list_escalated_mediations_for_admin's own comment for why this is a narrower, but real,
 * exception to the "never report content" rule.
 */
export default async function PlatformMediationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/mediations" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const mediations = await listEscalatedMediationsForAdmin();

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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Escalated mediations</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Disputes a researcher escalated past their organization, across every organization.</p>

        {mediations.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No escalated mediations">Nothing is currently awaiting platform review.</EmptyState>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-border rounded-lg border border-border bg-surface">
            {mediations.map((mediation) => (
              <li key={mediation.id} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger">Escalated · {formatDateTime(mediation.escalatedAt ?? mediation.openedAt)}</p>
                <p className="mt-1 text-sm font-medium text-ink">{mediation.reportTitle}</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {mediation.organizationName} / {mediation.programName} · Raised by {mediation.openedByName}
                </p>
                <p className="mt-1 text-xs font-medium text-ink-muted">{MEDIATION_REASON_LABEL[mediation.reason] ?? mediation.reason}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{mediation.description}</p>
                <ResolveMediationForm mediationId={mediation.id} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
