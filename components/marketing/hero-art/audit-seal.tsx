import React from "react";

/**
 * "The decision" -- a notary-style audit seal, half-cropped against the
 * hero's right edge so only its left half shows (see hero-art.tsx for the
 * crop transform). Ported from .claude/skills/unpatched-hero-art/reference/
 * unpatched-hero.html per that skill's own rule: keep the SVG geometry
 * byte-identical, never redraw from scratch.
 *
 * The ring text (RECEIVED / TRIAGED / DECIDED / RECORDED) is the real
 * Unpatched report lifecycle, not placeholder copy -- kept verbatim from the
 * reference. The `id`s on the four `<path>`s the ring text rides
 * (`hero-art-seal-q1..q4`) are prefixed to avoid colliding with any other
 * inline SVG `id` elsewhere on the page, since this component may render
 * more than once in theory and raw `id="q1"` from the reference would not be
 * safely reusable.
 *
 * A Server Component: pure markup + CSS animation (the `.hero-art-draw`/
 * `.hero-art-fade`/`.hero-art-stamp-wrap` classes in app/globals.css), no
 * client-side JS or state, so it renders on the server with no flash-in.
 */
export function AuditSeal() {
  return (
    <svg className="hero-art hero-art-seal" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <path id="hero-art-seal-q1" d="M400 744A344 344 0 0 0 744 400" />
        <path id="hero-art-seal-q2" d="M56 400A344 344 0 0 0 400 744" />
        <path id="hero-art-seal-q3" d="M78 400A322 322 0 0 1 400 78" />
        <path id="hero-art-seal-q4" d="M400 78A322 322 0 0 1 722 400" />
      </defs>
      <g className="hero-art-lines">
        <g className="hero-art-draw" style={{ "--d": ".5s" } as React.CSSProperties}>
          <circle pathLength={1} cx="400" cy="400" r="384" />
          <circle pathLength={1} cx="400" cy="400" r="352" />
          <circle pathLength={1} cx="400" cy="400" r="306" />
          <circle pathLength={1} cx="400" cy="400" r="262" />
        </g>
        <g className="hero-art-draw" style={{ "--d": "1.1s" } as React.CSSProperties}>
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(15 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(30 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(45 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(60 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(75 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(90 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(105 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(120 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(135 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(150 400 400)" />
          <ellipse pathLength={1} cx="400" cy="400" rx="250" ry="68" transform="rotate(165 400 400)" />
          <circle pathLength={1} cx="400" cy="400" r="120" />
        </g>
        <g className="hero-art-fade">
          {/* perforated edge, minute ticks, stitching, quarter marks */}
          <circle cx="400" cy="400" r="392" strokeWidth={3.2} strokeDasharray="0.1 9" />
          <circle cx="400" cy="400" r="298" pathLength={120} strokeWidth={8} strokeLinecap="butt" strokeDasharray="0.14 0.86" />
          <circle cx="400" cy="400" r="104" strokeWidth={2} strokeDasharray="9 7" strokeLinecap="butt" />
          <circle className="hero-art-mk" cx="728" cy="400" r="5" />
          <circle className="hero-art-mk" cx="400" cy="728" r="5" />
          <circle className="hero-art-mk" cx="72" cy="400" r="5" />
          <circle className="hero-art-mk" cx="400" cy="72" r="5" />
        </g>
      </g>
      <g className="hero-art-fade">
        <text className="hero-art-ring-text" textAnchor="middle">
          <textPath href="#hero-art-seal-q1" startOffset="50%">
            RECEIVED
          </textPath>
        </text>
        <text className="hero-art-ring-text" textAnchor="middle">
          <textPath href="#hero-art-seal-q2" startOffset="50%">
            TRIAGED
          </textPath>
        </text>
        <text className="hero-art-ring-text" textAnchor="middle">
          <textPath href="#hero-art-seal-q3" startOffset="50%">
            DECIDED
          </textPath>
        </text>
        <text className="hero-art-ring-text" textAnchor="middle">
          <textPath href="#hero-art-seal-q4" startOffset="50%">
            RECORDED
          </textPath>
        </text>
      </g>
      <g className="hero-art-stamp-wrap">
        <circle className="hero-art-stamp" cx="400" cy="400" r="92" />
        <circle className="hero-art-stamp-ring" cx="400" cy="400" r="70" />
      </g>
    </svg>
  );
}
