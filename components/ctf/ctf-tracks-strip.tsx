import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { CheckCircle, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { SectionLabel } from "../ui/security-primitives";
import type { MockCtfChallenge, MockCtfTrack } from "../../lib/mock/ctf";

/** Curated challenge sequences: an ordered on-ramp through a few challenges that build one
 * skill. Each track lists its challenges as links straight into play, marks the ones already
 * solved, and points at the next unsolved one. Laid out as an equal-width grid that spans the
 * same width as the stats row above it, so cards never leave a ragged gap or clip their text. */
export function CtfTracksStrip({
  tracks,
  challenges,
  solvedChallengeIds,
}: {
  tracks: MockCtfTrack[];
  challenges: MockCtfChallenge[];
  solvedChallengeIds: Set<string>;
}) {
  if (tracks.length === 0) return null;
  const byId = new Map(challenges.map((c) => [c.id, c]));
  return (
    <section>
      <SectionLabel>Tracks</SectionLabel>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((track) => {
          const items = track.challengeIds
            .map((id) => byId.get(id))
            .filter((c): c is MockCtfChallenge => Boolean(c));
          const solved = items.filter((c) =>
            solvedChallengeIds.has(c.id),
          ).length;
          const next = items.find((c) => !solvedChallengeIds.has(c.id));
          return (
            <li
              key={track.id}
              className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold text-ink">
                  {track.label}
                </p>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ink-muted tabular-nums">
                  {solved}/{items.length} solved
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">{track.description}</p>
              <ol className="mt-3 space-y-1.5">
                {items.map((challenge, index) => {
                  const done = solvedChallengeIds.has(challenge.id);
                  return (
                    <li key={challenge.id}>
                      <Link
                        prefetch={false}
                        href={`/ctf/${challenge.id}` as Route}
                        className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {done ? (
                          <CheckCircle
                            aria-label="Solved"
                            weight="fill"
                            className="size-4 shrink-0 text-success"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="grid size-4 shrink-0 place-items-center rounded-full border border-border-strong font-mono text-[10px] text-ink-muted"
                          >
                            {index + 1}
                          </span>
                        )}
                        <span
                          className={`min-w-0 flex-1 truncate ${done ? "text-ink-muted" : "text-ink"}`}
                        >
                          {challenge.title}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-muted tabular-nums">
                          {challenge.points} pts
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-auto pt-3">
                {next ? (
                  <Link
                    prefetch={false}
                    href={`/ctf/${next.id}` as Route}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-action hover:text-action-hover"
                  >
                    {solved === 0 ? "Start the track" : "Continue the track"}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                ) : (
                  <p className="text-xs font-semibold text-success">
                    Track complete
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
