import React from "react";
import { SectionLabel } from "../ui/security-primitives";
import type { MockCtfTrack } from "../../lib/mock/ctf";

/** A horizontal scroller of curated challenge sequences (HackTheBox's own "Tracks"
 * concept, adapted -- an ordered on-ramp through a handful of challenges building one
 * skill, independent of category filtering). Static/informational for this slice -- each
 * track names its challenge count, not yet a clickable filtered view. */
export function CtfTracksStrip({ tracks }: { tracks: MockCtfTrack[] }) {
  if (tracks.length === 0) return null;
  return (
    <div>
      <SectionLabel>Tracks</SectionLabel>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {tracks.map((track) => (
          <div key={track.id} className="w-64 shrink-0 rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">{track.label}</p>
            <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{track.description}</p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-ink-muted">{track.challengeIds.length} challenges</p>
          </div>
        ))}
      </div>
    </div>
  );
}
