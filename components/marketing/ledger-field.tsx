import React from "react";

/**
 * The Ledger Field (SVG + CSS + GSAP + Anime.js):
 * A living, non-generic 3-plane kinetic vector instrument behind the Hero title page.
 * Contains ZERO letters, ZERO numbers, ZERO text elements, and ZERO stray background lines.
 * Every signal, scope lock, append-only ledger stratum, and notarized seal is expressed
 * purely through living geometry: volumetric light fields, counter-rotating guilloché
 * rosettes, suspended lenticular ledger capsules, four geometric iris stage beacons,
 * and an autonomous traveling vermilion signal carrier.
 */
export const ORBIT = { cx: 720, cy: 360, rx: 455, ry: 235, tilt: -3 } as const;

export function orbitPoint(thetaDeg: number): { x: number; y: number } {
  const t = (thetaDeg * Math.PI) / 180;
  const phi = (ORBIT.tilt * Math.PI) / 180;
  const ex = ORBIT.rx * Math.cos(t);
  const ey = ORBIT.ry * Math.sin(t);
  return {
    x: Math.round((ORBIT.cx + ex * Math.cos(phi) - ey * Math.sin(phi)) * 10) / 10,
    y: Math.round((ORBIT.cy + ex * Math.sin(phi) + ey * Math.cos(phi)) * 10) / 10,
  };
}

// Four spatial beacon angles positioned cleanly in the four open quadrants around the hero copy.
export const LEDGER_NODES = [
  { theta: 38, tone: "warm", petals: 6 },
  { theta: 142, tone: "ink", petals: 8 },
  { theta: 218, tone: "warm", petals: 6 },
  { theta: 322, tone: "ink", petals: 8 },
] as const;

export const EVIDENCE_NODES = LEDGER_NODES;

// Suspended append-only ledger strata: sculpted lenticular capsules & harmonic seals
const LEDGER_STRATA = [
  { cx: 355, cy: 175, rx: 56, ry: 18, rot: -16, tone: "warm", delay: "0s" },
  { cx: 1085, cy: 175, rx: 56, ry: 18, rot: 16, tone: "ink", delay: "-1.4s" },
  { cx: 310, cy: 465, rx: 64, ry: 20, rot: -8, tone: "ink", delay: "-2.8s" },
  { cx: 1130, cy: 465, rx: 64, ry: 20, rot: 8, tone: "warm", delay: "-4.2s" },
  { cx: 390, cy: 735, rx: 58, ry: 18, rot: 14, tone: "warm", delay: "-5.6s" },
  { cx: 1050, cy: 735, rx: 58, ry: 18, rot: -14, tone: "ink", delay: "-7.0s" },
] as const;

// Living harmonic rosette satellites (animated by Anime.js)
const HARMONIC_SATELLITES = [
  { cx: 485, cy: 135, r: 28, tone: "warm" },
  { cx: 955, cy: 135, r: 26, tone: "ink" },
  { cx: 495, cy: 765, r: 26, tone: "ink" },
  { cx: 945, cy: 765, r: 28, tone: "warm" },
] as const;

// Multi-depth floating luminescence motes
const FIELD_MOTES = [
  { cx: 290, cy: 145, r: 4.2, tone: "warm", delay: "0s", phase: 0 },
  { cx: 530, cy: 115, r: 3.2, tone: "ink", delay: "-1.5s", phase: 1 },
  { cx: 910, cy: 118, r: 3.6, tone: "warm", delay: "-3.0s", phase: 2 },
  { cx: 1150, cy: 155, r: 4.0, tone: "ink", delay: "-4.5s", phase: 3 },
  { cx: 255, cy: 310, r: 3.4, tone: "ink", delay: "-2.0s", phase: 4 },
  { cx: 415, cy: 295, r: 4.6, tone: "warm", delay: "-5.5s", phase: 5 },
  { cx: 1025, cy: 290, r: 4.4, tone: "ink", delay: "-7.0s", phase: 6 },
  { cx: 1185, cy: 320, r: 3.4, tone: "warm", delay: "-8.5s", phase: 7 },
  { cx: 265, cy: 595, r: 3.8, tone: "warm", delay: "-3.5s", phase: 8 },
  { cx: 425, cy: 625, r: 3.2, tone: "ink", delay: "-6.0s", phase: 9 },
  { cx: 1015, cy: 620, r: 4.2, tone: "warm", delay: "-9.5s", phase: 10 },
  { cx: 1175, cy: 590, r: 3.4, tone: "ink", delay: "-11.0s", phase: 11 },
  { cx: 335, cy: 765, r: 4.6, tone: "ink", delay: "-4.0s", phase: 12 },
  { cx: 555, cy: 790, r: 3.4, tone: "warm", delay: "-7.5s", phase: 13 },
  { cx: 885, cy: 785, r: 3.4, tone: "ink", delay: "-10.5s", phase: 14 },
  { cx: 1105, cy: 760, r: 4.4, tone: "warm", delay: "-12.0s", phase: 15 },
] as const;

export function LedgerField() {
  const start = orbitPoint(LEDGER_NODES[0].theta);

  return (
    <div
      aria-hidden="true"
      data-motion="evidence-field"
      data-ledger-field=""
      className="ledger-field evidence-field pointer-events-none absolute inset-0"
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="ledger-field-svg size-full"
        focusable="false"
      >
        <defs>
          {/* Strong central optical clarity mask so the hero headline, copy & CTAs sit in a pristine quiet zone */}
          <radialGradient id="ledger-field-fade" cx="50%" cy="45%" r="62%">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="34%" stopColor="#000000" />
            <stop offset="58%" stopColor="#b8b8b8" />
            <stop offset="76%" stopColor="#ffffff" />
          </radialGradient>

          <radialGradient id="ledger-aura-warm" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--action)" stopOpacity="0.18" />
            <stop offset="55%" stopColor="var(--action)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--action)" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="ledger-aura-ink" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.09" />
            <stop offset="60%" stopColor="var(--ink)" stopOpacity="0.025" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
          </radialGradient>

          <mask id="ledger-field-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
            <rect width="1440" height="900" fill="url(#ledger-field-fade)" />
          </mask>
        </defs>

        <g mask="url(#ledger-field-mask)">
          {/* ==========================================================================
              PLANE 1 — FAR (`data-motion-level="far"`, `data-depth="0.45"`):
              Volumetric Light Blooms & Harmonic Satellite Rosettes
             ========================================================================== */}
          <g data-motion-level="far" data-depth="0.45" className="ledger-plane-far">
            <circle
              className="ledger-aura evidence-aura evidence-aura-a"
              cx="380"
              cy="220"
              r="310"
              fill="url(#ledger-aura-warm)"
            />
            <circle
              className="ledger-aura evidence-aura evidence-aura-b"
              cx="1060"
              cy="680"
              r="340"
              fill="url(#ledger-aura-ink)"
            />
            <circle
              className="ledger-aura evidence-aura evidence-aura-c"
              cx="1050"
              cy="210"
              r="260"
              fill="url(#ledger-aura-warm)"
            />
            <circle
              className="ledger-aura evidence-aura evidence-aura-b"
              cx="390"
              cy="690"
              r="280"
              fill="url(#ledger-aura-ink)"
            />

            {/* Harmonic Satellite Rosettes (pure spirograph geometry, zero lines) */}
            <g className="ledger-satellite-group">
              {HARMONIC_SATELLITES.map((sat, idx) => {
                const ry = Math.round(sat.r * 0.42 * 10) / 10;
                return (
                  <g
                    key={idx}
                    data-anime="ledger-satellite"
                    transform={`translate(${sat.cx} ${sat.cy})`}
                    className={
                      sat.tone === "warm"
                        ? "ledger-satellite ledger-satellite-warm"
                        : "ledger-satellite ledger-satellite-ink"
                    }
                  >
                    <ellipse cx="0" cy="0" rx={sat.r} ry={ry} transform="rotate(30)" className="ledger-satellite-petal" />
                    <ellipse cx="0" cy="0" rx={sat.r} ry={ry} transform="rotate(-30)" className="ledger-satellite-petal" />
                    <ellipse cx="0" cy="0" rx={sat.r} ry={ry} transform="rotate(90)" className="ledger-satellite-petal" />
                    <circle cx="0" cy="0" r="3" className="ledger-satellite-core" />
                  </g>
                );
              })}
            </g>
          </g>

          {/* ==========================================================================
              PLANE 2 — MID (`data-motion-level="mid"`, `data-depth="1.0"`):
              Suspended Append-Only Ledger Strata Capsules & Luminescent Depth Motes
             ========================================================================== */}
          <g data-motion-level="mid" data-depth="1" className="ledger-plane-mid">
            {/* Suspended Append-Only Ledger Strata (sculpted geometric capsules & harmonic seals) */}
            <g className="ledger-strata-group">
              {LEDGER_STRATA.map((stratum, idx) => {
                const innerRx = Math.round(stratum.rx * 0.66 * 10) / 10;
                const innerRy = Math.round(stratum.ry * 0.62 * 10) / 10;
                const nodeCx = Math.round(stratum.rx * 0.42 * 10) / 10;
                return (
                  <g
                    key={idx}
                    data-anime="ledger-stratum"
                    data-stratum-index={idx}
                    transform={`translate(${stratum.cx} ${stratum.cy}) rotate(${stratum.rot})`}
                    style={{ "--stratum-delay": stratum.delay } as React.CSSProperties}
                    className={
                      stratum.tone === "warm"
                        ? "ledger-stratum ledger-stratum-warm"
                        : "ledger-stratum ledger-stratum-ink"
                    }
                  >
                    <ellipse
                      cx="0"
                      cy="0"
                      rx={stratum.rx}
                      ry={stratum.ry}
                      pathLength={1}
                      className="ledger-stratum-outer"
                    />
                    <ellipse
                      cx="0"
                      cy="0"
                      rx={innerRx}
                      ry={innerRy}
                      pathLength={1}
                      className="ledger-stratum-inner"
                    />
                    <circle cx={-nodeCx} cy="0" r="2.6" className="ledger-stratum-node" />
                    <circle cx="0" cy="0" r="3.4" className="ledger-stratum-core" />
                    <circle cx={nodeCx} cy="0" r="2.6" className="ledger-stratum-node" />
                  </g>
                );
              })}
            </g>

            {/* Floating Luminescent Depth Motes */}
            <g className="ledger-motes-group">
              {FIELD_MOTES.map((mote, idx) => (
                <circle
                  key={idx}
                  data-anime="ledger-mote"
                  data-mote-phase={mote.phase}
                  cx={mote.cx}
                  cy={mote.cy}
                  r={mote.r}
                  style={{ "--mote-delay": mote.delay } as React.CSSProperties}
                  className={
                    mote.tone === "warm"
                      ? "ledger-mote evidence-mote evidence-mote-warm"
                      : "ledger-mote evidence-mote evidence-mote-ink"
                  }
                />
              ))}
            </g>
          </g>

          {/* ==========================================================================
              PLANE 3 — NEAR (`data-motion-level="near"`, `data-depth="1.75"`):
              Four Geometric Iris Stage Beacons & Autonomous Traveling Signal Core
              (ZERO letters, ZERO numbers, ZERO text elements)
             ========================================================================== */}
          <g data-motion-level="near" data-depth="1.75" className="ledger-plane-near">
            {LEDGER_NODES.map((node, index) => {
              const p = orbitPoint(node.theta);
              return (
                <g
                  key={node.theta}
                  data-motion="evidence-node"
                  data-ledger-node={index}
                  data-index={index}
                  className="ledger-node evidence-field-node"
                >
                  {/* Expanding radial shockwave when visited */}
                  <circle
                    className="ledger-node-pulse evidence-field-node-pulse"
                    cx={p.x}
                    cy={p.y}
                    r="24"
                  />
                  {/* Outer breathing harmonic ring */}
                  <circle
                    data-anime="ledger-node-ring"
                    className="ledger-node-ring"
                    cx={p.x}
                    cy={p.y}
                    r="16"
                    pathLength={1}
                  />
                  {/* Counter-rotating geometric iris diamond */}
                  <polygon
                    data-anime="ledger-node-iris"
                    className="ledger-node-iris"
                    points={`${p.x},${p.y - 10} ${p.x + 10},${p.y} ${p.x},${p.y + 10} ${p.x - 10},${p.y}`}
                  />
                  {/* Orbiting micro-satellite */}
                  <circle
                    className="ledger-node-satellite"
                    cx={p.x + 12}
                    cy={p.y - 12}
                    r="2.2"
                  />
                  {/* Central precision lock core */}
                  <circle
                    className="ledger-node-dot evidence-field-node-dot"
                    cx={p.x}
                    cy={p.y}
                    r="4.2"
                  />
                </g>
              );
            })}

            {/* Live Traveling Vermilion Signal Carrier */}
            <g data-motion="evidence-marker" className="ledger-signal-carrier">
              <circle
                className="ledger-marker-halo-outer evidence-field-marker-halo"
                cx={start.x}
                cy={start.y}
                r="20"
              />
              <circle
                className="ledger-marker-halo-inner"
                cx={start.x}
                cy={start.y}
                r="11"
              />
              <circle
                className="ledger-marker-core evidence-field-marker"
                cx={start.x}
                cy={start.y}
                r="5.2"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
