import React from "react";
import Link from "next/link";
import { SectionLabel } from "../../components/ui/security-primitives";
import { EmptyState } from "../../components/ui/feedback";
import { DisclosureFeed } from "../../components/disclosures/disclosure-feed";
import { listPublicDisclosures } from "../../services/report-disclosures";

/**
 * The anonymous-readable public disclosure feed -- every entry here was individually
 * approved by the organization that ran the program, publishing only the minimal
 * snapshot request_report_disclosure's own migration comment documents (title,
 * resolution summary, severity, program/org name -- never the full report, evidence, or
 * message thread). See supabase/migrations/202609030001_report_disclosure_workflow.sql.
 */
export default async function PublicDisclosuresPage() {
  const disclosures = await listPublicDisclosures();

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Unpatched
          </Link>
          <Link href="/sign-in" className="text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <SectionLabel>Public record</SectionLabel>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Publicly disclosed reports</h1>
        <p className="mt-2 text-sm text-ink-muted">Every report here was resolved, then explicitly approved for public disclosure by the organization that ran the program.</p>

        <div className="mt-8">
          {disclosures.length === 0 ? (
            <EmptyState title="No public disclosures yet">Organizations can approve a researcher's request to publish a resolved report here.</EmptyState>
          ) : (
            <DisclosureFeed disclosures={disclosures} />
          )}
        </div>
      </main>
      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <span>Unpatched</span>
          <Link href="/sign-in" className="font-medium hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
