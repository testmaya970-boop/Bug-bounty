import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { Breadcrumbs } from "../../../components/ui/navigation";
import { Card, PermissionDenied } from "../../../components/ui/feedback";
import { SectionLabel, MetadataPair } from "../../../components/ui/security-primitives";
import { DifficultyBadge, CtfCategoryBadge } from "../../../components/ui/badge";
import { FlagSubmissionForm } from "../../../components/ctf/flag-submission-form";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { listMyCtfSolves } from "../../../services/ctf";
import { findCtfChallengeBySlug, findCtfTrackById, MOCK_CTF_CATEGORY_META } from "../../../lib/mock/ctf";

// Same small formatter the evidence/access-file panels use (kept local -- a 3-line pure
// helper isn't worth a shared export threaded through unrelated files).
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A single challenge's briefing, metadata, and flag submission -- two-column layout
 * matching the report detail page's own pattern exactly (main reading column + a sticky
 * rail holding the one primary action). `challengeId` in the URL is actually the
 * challenge's slug (see lib/mock/ctf.ts's own MockCtfChallenge.slug).
 */
export default async function CtfChallengeDetailPage({ params }: { params: Promise<{ challengeId: string }> }) {
  const { challengeId: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/ctf/${slug}` as Route);

  const challenge = findCtfChallengeBySlug(slug);

  // An unknown slug and "you don't have access" are indistinguishable to this reader --
  // same unified-render choice the reports detail page makes for its own null case.
  if (!challenge) {
    return (
      <AppShell title="CTF" user={user}>
        <PermissionDenied>This challenge does not exist.</PermissionDenied>
      </AppShell>
    );
  }

  const track = challenge.trackId ? findCtfTrackById(challenge.trackId) : undefined;
  const categoryLabel = MOCK_CTF_CATEGORY_META[challenge.categoryId].label;
  const solves = await listMyCtfSolves();
  const existingSolve = solves.find((solve) => solve.challengeId === challenge.id) ?? null;

  return (
    <AppShell title="CTF" user={user}>
      <div className="max-w-5xl space-y-6">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "CTF", href: "/ctf" }, { label: challenge.title }]} />

        <div className="border-2 border-ink p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CtfCategoryBadge categoryId={challenge.categoryId} label={categoryLabel} />
            <DifficultyBadge difficulty={challenge.difficulty} />
            <span className="font-mono text-sm font-semibold text-ink">{challenge.points} pts</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{challenge.title}</h2>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
          <div className="space-y-6">
            <Card className="p-5 sm:p-6">
              <SectionLabel>Briefing</SectionLabel>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{challenge.prompt}</p>
            </Card>

            {(challenge.embeddedData || (challenge.artifacts && challenge.artifacts.length > 0)) && (
              <Card className="p-5 sm:p-6">
                <SectionLabel>Challenge material</SectionLabel>
                <p className="mt-2 text-sm text-ink-muted">Everything you need to derive the flag is here. Apply the technique from the briefing to this material.</p>

                {challenge.artifacts && challenge.artifacts.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {challenge.artifacts.map((artifact) => (
                      <a
                        key={artifact.path}
                        href={artifact.path}
                        download={artifact.name}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted p-3 transition-colors duration-150 hover:border-action hover:bg-action/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-sm font-semibold text-ink">{artifact.name}</span>
                          <span className="block font-mono text-[11px] uppercase tracking-wide text-ink-muted">{formatBytes(artifact.size)}</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-action">Download</span>
                      </a>
                    ))}
                  </div>
                )}

                {challenge.embeddedData && (
                  <pre className="mt-4 max-h-[28rem] overflow-auto rounded-md border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed text-ink">
                    {challenge.embeddedData}
                  </pre>
                )}
              </Card>
            )}

            {challenge.hints.length > 0 && (
              <Card className="p-5 sm:p-6">
                <SectionLabel>Hints</SectionLabel>
                <div className="mt-2 space-y-2">
                  {challenge.hints.map((hint, index) => (
                    <details key={index} className="rounded-md border border-border bg-surface-muted p-3">
                      <summary className="cursor-pointer text-sm font-medium text-ink">Hint {index + 1}</summary>
                      <p className="mt-2 text-sm text-ink-muted">{hint}</p>
                    </details>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="mt-6 space-y-6 lg:sticky lg:top-24 lg:mt-0">
            <Card className="border-l-4 border-l-action p-5 sm:p-6">
              <SectionLabel>Challenge details</SectionLabel>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <MetadataPair label="Category" value={categoryLabel} />
                <MetadataPair label="Difficulty" value={challenge.difficulty} />
                <MetadataPair label="Points" value={challenge.points} />
                <MetadataPair label="Solves (preview)" value={challenge.solveCount.toLocaleString("en-US")} />
                <MetadataPair label="Est. time" value={`~${challenge.estimatedMinutes} min`} />
                {track && <MetadataPair label="Track" value={track.label} />}
              </div>
              <p className="mt-3 text-xs text-ink-muted">Mock data: the solve count is a preview figure, not a real tally of other researchers. Your own flag submission below is server-verified and real.</p>
              <div className="mt-5 border-t border-border pt-5">
                <FlagSubmissionForm challenge={challenge} initialSolve={existingSolve} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
