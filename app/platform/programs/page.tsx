import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ProgramLaunchReviewForm } from "../../../components/platform/program-launch-review-form";
import { isPlatformAdmin, listProgramsPendingReviewForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatDateTime } from "../../../lib/format-date";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention every
 * other platform-admin queue in this codebase already established (mediations,
 * needs-recovery, retests). This is the program-launch review gate's own queue: since
 * activate_program is now platform-admin-only (202609050013), an organization can no
 * longer self-certify its own program launch -- this is where a platform admin approves or
 * rejects it.
 */
export default async function PlatformProgramsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/programs" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const programs = await listProgramsPendingReviewForAdmin();

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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Program launch review</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Programs awaiting platform approval before they can go active, across every organization.</p>

        {programs.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="Nothing awaiting review">No program is currently waiting for a launch decision.</EmptyState>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-border rounded-lg border border-border bg-surface">
            {programs.map((program) => (
              <li key={program.id} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning">Submitted for review · {formatDateTime(program.submittedAt)}</p>
                <p className="mt-1 text-sm font-medium text-ink">{program.name}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{program.organizationName}</p>
                {program.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{program.description}</p>}
                <ProgramLaunchReviewForm programId={program.id} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
