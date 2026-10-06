import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { SeverityBadge } from "../../../components/ui/badge";
import { LocalTime } from "../../../components/ui/local-time";
import { getPublicDisclosure } from "../../../services/report-disclosures";

/** One published disclosure: exactly the approved write-up, the severity at approval and the
 * program -- never the report itself. Not found until it is public (a scheduled coordinated
 * disclosure 404s until its date), and again once unpublished. */
export default async function PublicDisclosurePage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(reportId)) notFound();
  const disclosure = await getPublicDisclosure(reportId);
  if (!disclosure) notFound();

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link prefetch={false} href="/disclosures" className="text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            ← All disclosures
          </Link>
          <Link prefetch={false} href="/sign-in" className="text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
        <div>
          <SectionLabel>{disclosure.organizationName}</SectionLabel>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{disclosure.publishedTitle ?? "Untitled report"}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            {disclosure.confirmedSeverity && <SeverityBadge severity={disclosure.confirmedSeverity} />}
            <span>{disclosure.programName}</span>
            {disclosure.publishedAt && (
              <span>
                Disclosed <LocalTime value={disclosure.publishedAt} dateOnly />
              </span>
            )}
            {disclosure.researcherUsername && (
              <Link prefetch={false} href={`/researchers/${disclosure.researcherUsername}`} className="font-medium text-action hover:underline">
                @{disclosure.researcherUsername}
              </Link>
            )}
          </div>
        </div>
        {disclosure.publishedSummary ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{disclosure.publishedSummary}</p>
        ) : (
          <p className="text-sm text-ink-muted">The organization published this report without a write-up.</p>
        )}
      </main>
    </div>
  );
}
