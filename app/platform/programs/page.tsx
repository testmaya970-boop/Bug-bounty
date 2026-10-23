import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ProgramLaunchReviewForm } from "../../../components/platform/program-launch-review-form";
import { isPlatformAdmin, listProgramsPendingReviewForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { engagementTypeLabel } from "../../../lib/program-status";
import { LocalTime } from "../../../components/ui/local-time";
import { listProgramLaunchReadiness, type LaunchReadiness } from "../../../services/onboarding";

/** The review checklist (202610230005): what Unpatched confirms before a program goes live. */
function LaunchChecks({ r }: { r: LaunchReadiness }) {
  const checks: [string, boolean][] = [
    [`Scope: ${r.scopeEntries} in-scope target${r.scopeEntries === 1 ? "" : "s"}`, r.scopeEntries > 0],
    ["Policy published", r.policyPublished],
    ["Response targets set", r.responseTargets],
    [r.programType === "vdp" ? "Disclosure program: no bounty table needed" : "Bounty table set", r.bountyTable],
    [r.programType === "vdp" ? "Disclosure program: no funding needed" : "Balance funded", r.funded],
    ["Billing details on file", r.billingProfile],
    ["Every admin has two-factor", r.adminsMfa],
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <p className="text-xs font-medium text-ink-muted">Launch checks: {passed} of {checks.length}</p>
      <ul className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? "text-ink" : "font-medium text-danger"}>
            {ok ? "✓" : "✗"} {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention every
 * other platform-admin queue in this codebase already established (mediations,
 * needs-recovery, retests). This is the program-launch review gate's own queue: since
 * activate_program is now platform-admin-only (202609050013), an organization can no
 * longer self-certify its own program launch -- this is where a platform admin approves or
 * rejects it.
 *
 * Uses the same <AppShell> sidebar every other authenticated page does -- an earlier pass
 * gave this page (and its six siblings) their own separate header+nav-bar component
 * instead, flagged live as a real inconsistency (this app has exactly one sidebar-nav
 * system, and these pages didn't use it) and confirmed by a ponytail review as
 * unnecessary duplication: AppShell already tolerates a platform-admin user with zero
 * organizations/zero researcher participation, so a second nav primitive was never
 * needed. The Platform admin nav group (components/app-shell-client.tsx) is the real,
 * shared in-page nav across all seven platform routes now.
 */
export default async function PlatformProgramsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/programs" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const [programs, readiness] = await Promise.all([listProgramsPendingReviewForAdmin(), listProgramLaunchReadiness()]);
  const readinessById = new Map(readiness.map((r) => [r.programId, r]));

  return (
    <AppShell title="Program launch review" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Programs awaiting platform approval before they can go active, across every organization. Target: a decision within 2 business days of submission.</p>

        {programs.length === 0 ? (
          <EmptyState title="Nothing awaiting review">No program is currently waiting for a launch decision.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {programs.map((program) => (
              <li key={program.id} className="p-4">
                {(() => {
                  const r = readinessById.get(program.id);
                  const late = (r?.businessDaysWaiting ?? 0) >= 2;
                  return (
                    <p className={`text-xs font-semibold ${late ? "text-danger" : "text-warning"}`}>
                      Submitted for review · <LocalTime value={program.submittedAt} />
                      {r && <> · {r.businessDaysWaiting} business day{r.businessDaysWaiting === 1 ? "" : "s"} waiting{late ? ", past the 2-day target" : ""}</>}
                    </p>
                  );
                })()}
                <p className="mt-1 text-sm font-medium text-ink">{program.name}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{program.organizationName}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-muted">
                  <span>{engagementTypeLabel(program.engagementType)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{program.programType === "vdp" ? "Vulnerability disclosure" : "Paid bounty"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{program.visibility === "public" ? "Public" : "Private"}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {program.scopeEntryCount} scope {program.scopeEntryCount === 1 ? "entry" : "entries"}
                  </span>
                  {program.requiresKyc && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Requires KYC</span>
                    </>
                  )}
                </div>
                {program.scopeEntryCount === 0 && (
                  <p className="mt-2 text-sm font-medium text-danger">No scope entries defined -- this program has nothing in scope yet.</p>
                )}

                {program.description ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{program.description}</p>
                ) : (
                  <p className="mt-2 text-sm italic text-ink-muted">No description provided.</p>
                )}
                {readinessById.get(program.id) && <LaunchChecks r={readinessById.get(program.id)!} />}
                <ProgramLaunchReviewForm programId={program.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
