import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { Card, EmptyState, PermissionDenied } from "../../../../components/ui/feedback";
import { SectionLabel, MetadataPair } from "../../../../components/ui/security-primitives";
import { DifficultyBadge, CtfCategoryBadge, Badge } from "../../../../components/ui/badge";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { getCtfEventBySlug, getCtfEventLeaderboard } from "../../../../services/ctf-events";
import { formatDateTime } from "../../../../lib/format-date";
import { ALL_CTF_CHALLENGES, MOCK_CTF_CATEGORY_META, type MockCtfChallenge } from "../../../../lib/mock/ctf";
import type { CtfEventEffectiveStatus } from "../../../../types/ctf-event";

const STATUS_COPY: Record<CtfEventEffectiveStatus, { label: string; tone: string }> = {
  active: { label: "Live now", tone: "border-success/40 bg-success/10 text-success" },
  upcoming: { label: "Upcoming", tone: "border-action/40 bg-action/10 text-action" },
  ended: { label: "Ended", tone: "border-border-strong text-ink-muted" },
  draft: { label: "Draft", tone: "border-border-strong text-ink-muted" },
};

/**
 * One event: its window/state, its own challenge subset (the same challenges as the practice
 * library, linking to the same detail+solve page), and its own REAL leaderboard
 * (get_ctf_event_leaderboard, aggregated from ctf_event_solves). A challenge solved here
 * during the window counts toward this board -- the solve mechanism is identical, only the
 * attribution differs (docs/decisions/0081).
 */
export default async function CtfEventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/ctf/events/${slug}` as Route);

  const event = await getCtfEventBySlug(slug);
  // Unknown slug and draft (not published) are indistinguishable here -- same unified render
  // the challenge detail page uses for its own null case.
  if (!event) {
    return (
      <AppShell title="CTF event" user={user}>
        <PermissionDenied>This event does not exist or has not been published.</PermissionDenied>
      </AppShell>
    );
  }

  const leaderboard = await getCtfEventLeaderboard(event.id, 100);
  const status = STATUS_COPY[event.effectiveStatus];
  const solvedCount = event.challenges.filter((c) => c.solvedInEvent).length;
  const totalPoints = event.challenges.reduce((sum, c) => sum + c.points, 0);
  const byId = new Map<string, MockCtfChallenge>(ALL_CTF_CHALLENGES.map((c) => [c.id, c]));

  return (
    <AppShell title="CTF event" user={user}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "CTF", href: "/ctf" }, { label: "Events", href: "/ctf?tab=events" }, { label: event.name }]} />

        <div className="border-2 border-ink p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${status.tone}`}>
              {event.effectiveStatus === "active" && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-success" />}
              {status.label}
            </span>
            <span className="font-mono text-sm font-semibold text-ink">{event.challenges.length} challenges</span>
            <span className="font-mono text-sm text-ink-muted">{totalPoints.toLocaleString("en-US")} pts available</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{event.name}</h2>
          {event.description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{event.description}</p>}
          <div className="mt-3 grid max-w-lg grid-cols-2 gap-4">
            <MetadataPair label={event.effectiveStatus === "upcoming" ? "Opens" : "Started"} value={formatDateTime(event.startsAt)} />
            <MetadataPair label={event.effectiveStatus === "ended" ? "Ended" : "Closes"} value={formatDateTime(event.endsAt)} />
          </div>
          {event.effectiveStatus === "upcoming" && <p className="mt-3 text-sm font-medium text-action">This event has not started yet. Its challenges open when the window begins.</p>}
          {event.effectiveStatus === "ended" && <p className="mt-3 text-sm text-ink-muted">This event has ended. Its leaderboard below is final; the challenges remain solvable for practice (no longer scored here).</p>}
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Challenges in this event</SectionLabel>
              <span className="font-mono text-xs text-ink-muted">
                {solvedCount}/{event.challenges.length} solved
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {event.challenges.map((ec) => {
                const challenge = byId.get(ec.challengeId);
                if (!challenge) return null;
                return (
                  <Link
                    key={ec.challengeId}
                    href={`/ctf/${challenge.slug}` as Route}
                    prefetch={false}
                    className={`group flex flex-col gap-2 rounded-lg border p-4 transition duration-150 hover:border-action hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${ec.solvedInEvent ? "border-success/40 bg-success/5" : "border-border bg-surface"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <CtfCategoryBadge categoryId={challenge.categoryId} label={MOCK_CTF_CATEGORY_META[challenge.categoryId].label} />
                      {ec.solvedInEvent && (
                        <Badge className="text-success" dotClassName="bg-success">
                          Solved
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-ink group-hover:text-action">{challenge.title}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                      <DifficultyBadge difficulty={challenge.difficulty} />
                      <span className="font-mono font-semibold text-ink">{ec.points} pts</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-6 lg:sticky lg:top-24 lg:mt-0">
            <Card className="p-5 sm:p-6">
              <SectionLabel>Event leaderboard</SectionLabel>
              <p className="mt-1 text-xs text-ink-muted">Real standings for this event, scored from solves captured during its window.</p>
              {leaderboard.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No solves yet">Be the first to capture a flag in this event.</EmptyState>
                </div>
              ) : (
                <ol className="mt-4 space-y-1">
                  {leaderboard.map((row) => {
                    const isMe = row.researcherId === user.id;
                    return (
                      <li key={row.researcherId} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${isMe ? "border-action/40 bg-action/5" : "border-border bg-surface"}`}>
                        <span className="w-6 shrink-0 font-mono text-xs font-semibold text-ink-muted">#{row.rank}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink">{row.publicUsername ?? row.displayName}</span>
                            {isMe && <span className="shrink-0 rounded-full bg-action/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-action">You</span>}
                          </span>
                          <span className="font-mono text-[11px] text-ink-muted">
                            {row.challengesSolved} {row.challengesSolved === 1 ? "solve" : "solves"}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-ink">{row.eventPoints.toLocaleString("en-US")}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
