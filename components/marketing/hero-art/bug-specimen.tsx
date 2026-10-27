import React from "react";

/**
 * "The finding" -- a beetle drawn like a museum specimen plate, half-cropped
 * against the hero's left edge so only its right half shows (see hero-art.tsx
 * for the crop transform). Ported from .claude/skills/unpatched-hero-art/
 * reference/unpatched-hero.html per that skill's own rule: keep the SVG
 * geometry byte-identical, never redraw from scratch.
 *
 * The half-bug is drawn once (in a `translate(200 0)` group) and repeated as
 * a real, second, mirrored copy (`translate(1000 0) scale(-1 1)`) rather than
 * an SVG `<use>` reference -- the skill's reference explicitly calls this out:
 * CSS animations targeting a `<use>` element's shadow-DOM copy are unreliable
 * across browsers, so the mirrored half is written out as literal markup
 * here, matching the reference exactly.
 *
 * Callout labels (the dotted leader lines naming real vulnerability classes)
 * are drawn once, on the visible (right) half only, outside the mirrored
 * group -- they would be nonsensical mirrored text on the hidden left half.
 *
 * A Server Component: pure markup + CSS animation (via the `.draw`/`.fade`
 * classes defined in app/globals.css), no client-side JS or state, so it
 * renders on the server with no flash-in.
 */
// The callout dots below, in reading order (top to bottom).
export const SIGNAL_POINTS = [
  [560, 142],
  [571, 214],
  [680, 505],
  [752, 612],
  [556, 726],
] as const;

export function BugSpecimen({ signal = false }: { signal?: boolean }) {
  return (
    <svg className="hero-art hero-art-bug" viewBox="0 0 1000 830" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g className="hero-art-lines">
        <g transform="translate(200 0)">
          <g className="hero-art-draw" style={{ "--d": ".1s" } as React.CSSProperties}>
            {/* head + eye */}
            <path pathLength={1} d="M300 94C334 92 356 114 358 142C358 166 352 184 340 194L300 196" />
            <ellipse pathLength={1} cx="343" cy="150" rx="9" ry="15" transform="rotate(-10 343 150)" />
            {/* mandible */}
            <path pathLength={1} d="M346 108C394 92 396 40 336 6C350 40 344 70 320 90" />
            <path pathLength={1} d="M338 100C376 88 378 52 338 22" />
            {/* antenna + club */}
            <path pathLength={1} d="M352 124C392 128 420 110 442 74" />
            <path pathLength={1} d="M442 74L452 58M442 74L460 66M442 74L463 82" />
            {/* pronotum */}
            <path pathLength={1} d="M300 200C352 198 396 218 406 252C412 280 388 302 342 308L300 310" />
            <path pathLength={1} d="M326 232C360 230 382 248 386 272" />
            {/* elytra outline + scutellum */}
            <path pathLength={1} d="M300 314C400 308 470 362 478 462C486 582 430 692 300 762" />
            <path pathLength={1} d="M300 314L318 326L300 340" />
          </g>
          <g className="hero-art-draw" style={{ "--d": ".8s" } as React.CSSProperties}>
            {/* striae */}
            <path pathLength={1} d="M340 340C352 470 344 640 300 750" />
            <path pathLength={1} d="M385 334C410 470 388 620 316 730" />
            <path pathLength={1} d="M414 360C450 486 424 600 336 716" />
            <path pathLength={1} d="M448 420C466 500 446 596 352 692" />
            {/* punctures on pronotum */}
            <circle pathLength={1} cx="352" cy="258" r="1.8" />
            <circle pathLength={1} cx="371" cy="270" r="1.8" />
            <circle pathLength={1} cx="341" cy="284" r="1.8" />
            <circle pathLength={1} cx="364" cy="291" r="1.8" />
          </g>
          <g className="hero-art-draw" style={{ "--d": "1.2s" } as React.CSSProperties}>
            {/* front leg */}
            <path pathLength={1} d="M402 246L448 226L496 246L526 296" />
            <path pathLength={1} d="M509 268l9-6" />
            <circle pathLength={1} cx="448" cy="226" r="3.5" />
            <circle pathLength={1} cx="496" cy="246" r="3.5" />
            <circle pathLength={1} className="hero-art-pin" cx="526" cy="296" r="5.5" />
            {/* middle leg */}
            <path pathLength={1} d="M452 386L520 350L556 414L548 476" />
            <path pathLength={1} d="M552 441l9-4" />
            <circle pathLength={1} cx="520" cy="350" r="3.5" />
            <circle pathLength={1} cx="556" cy="414" r="3.5" />
            <circle pathLength={1} className="hero-art-pin" cx="548" cy="476" r="5.5" />
            {/* hind leg */}
            <path pathLength={1} d="M476 520L540 544L552 612L520 684" />
            <path pathLength={1} d="M546 578l9-4" />
            <circle pathLength={1} cx="540" cy="544" r="3.5" />
            <circle pathLength={1} cx="552" cy="612" r="3.5" />
            <circle pathLength={1} className="hero-art-pin" cx="520" cy="684" r="5.5" />
          </g>
        </g>

        <g transform="translate(1000 0) scale(-1 1)">
          <g transform="translate(200 0)">
            <g className="hero-art-draw" style={{ "--d": ".1s" } as React.CSSProperties}>
              <path pathLength={1} d="M300 94C334 92 356 114 358 142C358 166 352 184 340 194L300 196" />
              <ellipse pathLength={1} cx="343" cy="150" rx="9" ry="15" transform="rotate(-10 343 150)" />
              <path pathLength={1} d="M346 108C394 92 396 40 336 6C350 40 344 70 320 90" />
              <path pathLength={1} d="M338 100C376 88 378 52 338 22" />
              <path pathLength={1} d="M352 124C392 128 420 110 442 74" />
              <path pathLength={1} d="M442 74L452 58M442 74L460 66M442 74L463 82" />
              <path pathLength={1} d="M300 200C352 198 396 218 406 252C412 280 388 302 342 308L300 310" />
              <path pathLength={1} d="M326 232C360 230 382 248 386 272" />
              <path pathLength={1} d="M300 314C400 308 470 362 478 462C486 582 430 692 300 762" />
              <path pathLength={1} d="M300 314L318 326L300 340" />
            </g>
            <g className="hero-art-draw" style={{ "--d": ".8s" } as React.CSSProperties}>
              <path pathLength={1} d="M340 340C352 470 344 640 300 750" />
              <path pathLength={1} d="M385 334C410 470 388 620 316 730" />
              <path pathLength={1} d="M414 360C450 486 424 600 336 716" />
              <path pathLength={1} d="M448 420C466 500 446 596 352 692" />
              <circle pathLength={1} cx="352" cy="258" r="1.8" />
              <circle pathLength={1} cx="371" cy="270" r="1.8" />
              <circle pathLength={1} cx="341" cy="284" r="1.8" />
              <circle pathLength={1} cx="364" cy="291" r="1.8" />
            </g>
            <g className="hero-art-draw" style={{ "--d": "1.2s" } as React.CSSProperties}>
              <path pathLength={1} d="M402 246L448 226L496 246L526 296" />
              <path pathLength={1} d="M509 268l9-6" />
              <circle pathLength={1} cx="448" cy="226" r="3.5" />
              <circle pathLength={1} cx="496" cy="246" r="3.5" />
              <circle pathLength={1} className="hero-art-pin" cx="526" cy="296" r="5.5" />
              <path pathLength={1} d="M452 386L520 350L556 414L548 476" />
              <path pathLength={1} d="M552 441l9-4" />
              <circle pathLength={1} cx="520" cy="350" r="3.5" />
              <circle pathLength={1} cx="556" cy="414" r="3.5" />
              <circle pathLength={1} className="hero-art-pin" cx="548" cy="476" r="5.5" />
              <path pathLength={1} d="M476 520L540 544L552 612L520 684" />
              <path pathLength={1} d="M546 578l9-4" />
              <circle pathLength={1} cx="540" cy="544" r="3.5" />
              <circle pathLength={1} cx="552" cy="612" r="3.5" />
              <circle pathLength={1} className="hero-art-pin" cx="520" cy="684" r="5.5" />
            </g>
          </g>
        </g>
      </g>
      <g className="hero-art-fade">
        <g className="hero-art-labels">
          <circle className="hero-art-dot" cx="560" cy="142" r="2.6" />
          <path className="hero-art-ldr" d="M560 142H780" />
          <text x="790" y="146.5">
            Unvalidated input
          </text>
          <circle className="hero-art-dot" cx="571" cy="214" r="2.6" />
          <path className="hero-art-ldr" d="M571 214H780" />
          <text x="790" y="218.5">
            Broken access control
          </text>
          <circle className="hero-art-dot" cx="680" cy="505" r="2.6" />
          <path className="hero-art-ldr" d="M680 505H780" />
          <text x="790" y="509.5">
            Session token exposed
          </text>
          <circle className="hero-art-dot" cx="752" cy="612" r="2.6" />
          <path className="hero-art-ldr" d="M752 612H780" />
          <text x="790" y="616.5">
            Outdated dependency
          </text>
          <circle className="hero-art-dot" cx="556" cy="726" r="2.6" />
          <path className="hero-art-ldr" d="M556 726H780" />
          <text x="790" y="730.5">
            Severity 8.1, high
          </text>
        </g>
      </g>
      {signal && (
        // Chapter one only: a red signal that visits each inspection point in turn and lights
        // its leader line, scrubbed by scroll from public-home-motion.tsx. Parked hidden on the
        // first point so a reduced-motion visitor sees the plain plate.
        <g data-motion="bug-signal" opacity={0}>
          <g className="hero-art-labels">
            {SIGNAL_POINTS.map(([cx, cy]) => (
              <path key={`${cx}-${cy}`} className="bug-signal-ldr" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1} d={`M${cx} ${cy}H780`} />
            ))}
          </g>
          <circle className="bug-signal-halo" cx={SIGNAL_POINTS[0][0]} cy={SIGNAL_POINTS[0][1]} r="11" />
          <circle className="bug-signal-marker" cx={SIGNAL_POINTS[0][0]} cy={SIGNAL_POINTS[0][1]} r="5" />
        </g>
      )}
    </svg>
  );
}
