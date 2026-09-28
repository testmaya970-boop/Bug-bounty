import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "../../../components/ui/feedback";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

/** Collaboration is real and shipped (see docs/decisions/0064-report-collaboration-scope.md,
 * components/reports/report-collaborators.tsx) -- but it's scoped to one report at a
 * time, added by the submitting researcher from that report's own detail page, not a
 * standalone settings concept (there is no persistent "team" object to configure here).
 * This page used to render NotApplicableSettings, which became factually wrong the moment
 * collaboration shipped; it now correctly points at where the real feature actually
 * lives instead of denying it exists. */
export default async function CollaborationSettingsPage() {
  await requireResearcherSettings();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Collaboration</h1>
        <p className="mt-1 text-sm text-ink-muted">Co-researching a report with another researcher.</p>
      </div>
      <EmptyState title="Added per report, not here">
        Collaboration isn't a setting you configure in advance — add a collaborator directly from any of your own reports (while it's still new or in triage) to split the eventual bounty. Open a report from{" "}
        <Link prefetch={false} href={"/reports" as Route} className="font-medium text-action underline underline-offset-2">
          your reports
        </Link>{" "}
        to add one.
      </EmptyState>
    </div>
  );
}
