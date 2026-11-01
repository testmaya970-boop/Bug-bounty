import React from "react";

/**
 * The homepage's background environment, one instance per section, always the section's
 * first child and always behind its content (`-z-10` inside a section marked `isolate`).
 * Purely decorative: aria-hidden, pointer-events none, no layout of its own (absolute,
 * clipped to the section).
 *
 * Three shared layers, so the whole page reads as one place (public-home-motion.tsx drives
 * them; globals.css `.atmo*` styles them):
 *   - shadow: soft raking bands, like an inspection lamp's light falling through blinds. One
 *     page-wide scroll value moves every section's bands, so the light travels continuously
 *     from hero to footer instead of resetting per section; each also drifts slowly on its own.
 *   - thread: a fine evidence line down the left gutter. Every section draws its own segment
 *     between "top center" and "bottom center", so segments meet at section boundaries and the
 *     red signal at its tip tracks the reader's position. It begins at chapter one (the hero's
 *     own evidence orbit plays that part above the fold) and comes to rest in a node at the close.
 *   - figure: one background idea per section (ruler, lifecycle rail, a guide and a crossing path, orbital
 *     rings), each tied to that section's own scroll progress.
 *
 * Without JavaScript, or with reduced motion, every layer renders finished and still: the
 * thread fully drawn, rings at rest, no signal dot.
 */
export type AtmosphereVariant = "hero" | "evidence" | "lifecycle" | "workflows" | "record" | "quiet" | "close" | "rest";

// The thread's meander (x at evenly spaced y stops, in a 0..80 wide, 0..1000 tall box). Every
// segment starts and ends at x=40 so neighbouring sections join without a kink.
const THREAD: Partial<Record<AtmosphereVariant, { from: number; to: number; xs: number[] }>> = {
  evidence: { from: 0, to: 1000, xs: [40, 62, 30, 52, 40] },
  lifecycle: { from: 0, to: 1000, xs: [40, 20, 40, 60, 40] },
  workflows: { from: 0, to: 1000, xs: [40, 58, 24, 56, 40] },
  record: { from: 0, to: 1000, xs: [40, 24, 64, 30, 40] },
  quiet: { from: 0, to: 1000, xs: [40, 50, 40] },
  close: { from: 0, to: 520, xs: [40, 32, 40] },
};

function threadPath({ from, to, xs }: { from: number; to: number; xs: number[] }) {
  const step = (to - from) / (xs.length - 1);
  let d = `M${xs[0]} ${from}`;
  for (let i = 1; i < xs.length; i++) {
    const y0 = from + step * (i - 1);
    const y1 = from + step * i;
    d += ` C${xs[i - 1]} ${y0 + step / 2} ${xs[i]} ${y1 - step / 2} ${xs[i]} ${y1}`;
  }
  return d;
}

export function Atmosphere({ variant }: { variant: AtmosphereVariant }) {
  const thread = THREAD[variant];
  return (
    <div aria-hidden="true" data-atmo={variant} className="atmo pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div data-atmo-layer="shadow" className="atmo-shadow">
        <div className="atmo-shadow-drift" />
      </div>

      {variant === "evidence" && (
        // A measurement rule along the right edge, moving at its own depth.
        <div data-atmo-layer="ruler" className="atmo-ruler" />
      )}

      {variant === "lifecycle" && (
        <div data-atmo-layer="rail" className="atmo-rail">
          {/* A gauge on the right edge (beside the pinned diagram, never through it): six stage
              marks, the walked path's six stops, passed one by one as the chapter scrolls,
              with a light travelling down beside it. */}
          <div className="atmo-rail-light" data-atmo-part="light" />
          <div className="atmo-rail-track">
            <div className="atmo-rail-line" />
            <div className="atmo-rail-progress" data-atmo-part="progress" />
            {[0, 1, 2, 3, 4, 5].map((stage) => (
              <span key={stage} className="atmo-rail-stage" data-atmo-part="stage" style={{ top: `${stage * 20}%` }} />
            ))}
          </div>
        </div>
      )}

      {variant === "workflows" && (
        <>
          <div data-atmo-layer="guide-right" className="atmo-guide atmo-guide-right" />
          {/* The thread is the left path's guide; the right one gets its own, and a path
              crosses between them at a different depth. */}
          <svg data-atmo-layer="cross" className="atmo-cross" viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
            <path pathLength={1} d="M250 80 C250 380 750 420 750 620 S250 820 250 960" />
          </svg>
        </>
      )}

      {variant === "record" && (
        <div className="atmo-rings">
          {[
            { r: 300, dash: "1 7", speed: "a" },
            { r: 390, dash: "0.6 14", speed: "b" },
            { r: 480, dash: "40 10 2 10", speed: "c" },
          ].map((ring) => (
            <svg
              key={ring.r}
              data-atmo-layer="ring"
              data-ring={ring.speed}
              className="atmo-ring"
              viewBox={`${-ring.r - 20} ${-ring.r - 20} ${ring.r * 2 + 40} ${ring.r * 2 + 40}`}
              style={{ width: ring.r * 2 + 40, height: ring.r * 2 + 40 }}
              focusable="false"
            >
              <circle r={ring.r} strokeDasharray={ring.dash} />
            </svg>
          ))}
          <div data-atmo-part="glow" className="atmo-ring-glow" />
        </div>
      )}

      {thread && (
        <div data-atmo-layer="thread" className="atmo-thread">
          <svg viewBox="0 0 80 1000" preserveAspectRatio="none" focusable="false">
            <path className="atmo-thread-base" d={threadPath(thread)} />
            <path className="atmo-thread-ink" data-atmo-part="thread-ink" pathLength={1} d={threadPath(thread)} />
          </svg>
          <span data-atmo-part="signal" className="atmo-thread-signal" />
          {variant === "close" && <span data-atmo-part="rest" className="atmo-thread-rest" />}
        </div>
      )}
    </div>
  );
}
