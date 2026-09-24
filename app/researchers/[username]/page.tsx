import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { BadgeGrid } from "../../../components/researchers/badge-grid";
import { getPublicResearcherProfile, getResearcherBadges } from "../../../services/reputation";
import { focusAreaLabel, securityFocusLabel } from "../../../lib/researcher-identity-labels";

/**
 * The real, genuinely public (unauthenticated) researcher profile -- docs/decisions/0065
 * formally supersedes 0038/0039/0049's prior "no public profile/directory" rejection.
 * Structured the same way app/disclosures/page.tsx already is: a standalone shell (own
 * header/footer), no AppShell chrome, no auth gate. A username with no matching
 * researcher and one who exists but never set a public_username render the identical
 * "not found" page -- never distinguishing the two, which would leak the latter fact.
 * Only fields already decided public in 0065 appear here: display name, biography,
 * stated focus areas, and the real reputation score -- personal details, KYC, payout, and
 * external handles are never read by this page at all (the service layer itself does not
 * expose them here).
 */
export default async function PublicResearcherProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getPublicResearcherProfile(username);
  if (!profile) notFound();

  const badges = await getResearcherBadges(profile.researcherId);

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link prefetch={false} href="/" className="text-lg font-bold tracking-tight">
            Unpatched
          </Link>
          <Link prefetch={false} href="/sign-in" className="text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <SectionLabel>Researcher profile</SectionLabel>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{profile.displayName}</h1>
        <p className="mt-1 font-mono text-sm text-ink-muted">@{profile.publicUsername}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Reputation score</SectionLabel>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{profile.score.toLocaleString("en-US")}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Resolved reports</SectionLabel>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{profile.resolvedCount.toLocaleString("en-US")}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <SectionLabel>Bounties earned</SectionLabel>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{profile.bountyFinalizedCount.toLocaleString("en-US")}</p>
          </div>
        </div>

        <BadgeGrid badges={badges} />

        {profile.biography && (
          <div className="mt-8 border-t border-border pt-6">
            <SectionLabel>About</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{profile.biography}</p>
          </div>
        )}

        {(profile.hackingInterests.length > 0 || profile.securityFocus.length > 0) && (
          <div className="mt-8 border-t border-border pt-6">
            <SectionLabel>Focus areas</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.hackingInterests.map((area) => (
                <span key={area} className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-muted">
                  {focusAreaLabel(area)}
                </span>
              ))}
              {profile.securityFocus.map((focus) => (
                <span key={focus} className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-muted">
                  {securityFocusLabel(focus)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 border-t border-border pt-6 text-xs text-ink-muted">
          <p>
            The reputation score is computed from organization-confirmed report outcomes: resolved reports and finalized bounties count positively, rejected reports count negatively. Duplicate,
            informative, and not-applicable outcomes are never counted either way.{" "}
            <Link prefetch={false} href={"/researchers" as const} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              View the full leaderboard →
            </Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <span>Unpatched</span>
          <Link prefetch={false} href="/sign-in" className="font-medium hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
