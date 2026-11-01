import React from "react";

/**
 * The hero's atmospheric layer: a faint coordinate field, two inspection orbits, a tick ring,
 * and four evidence nodes, with a red marker that travels the orbit and pauses at each node
 * (that motion lives in public-home-motion.tsx; this file only draws the static plate). It
 * sits behind the half-cropped edge art (hero-art/) and the headline, and a radial mask
 * empties its centre so nothing ever crosses behind the type.
 *
 * Server-rendered and complete without JavaScript: the marker starts parked on the first
 * node, so a reduced-motion or no-JS visitor sees a finished, still diagram. The node
 * annotations name the record's real stages, the same story the audit seal's ring tells.
 *
 * The orbit geometry is exported so the client controller moves the marker along exactly the
 * ellipse drawn here and stops on exactly these node positions.
 */
export const ORBIT = { cx: 720, cy: 450, rx: 420, ry: 205, tilt: -4 } as const;

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

// Ascending angles: the marker always travels forward around the orbit. The nodes sit in the
// two bands the hero leaves clear (below the CTAs, above the headline); the orbit's sides
// pass behind the edge art, so nothing is ever annotated on top of the bug or the seal.
export const EVIDENCE_NODES = [
  { theta: 68, label: "Received" },
  { theta: 112, label: "Scope matched" },
  { theta: 248, label: "Evidence attached" },
  { theta: 292, label: "Decision recorded" },
] as const;

const GRID_X = [120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200, 1320];
const GRID_Y = [90, 210, 330, 450, 570, 690, 810];

export function EvidenceField() {
  const start = orbitPoint(EVIDENCE_NODES[0].theta);
  return (
    <div aria-hidden="true" data-motion="evidence-field" className="evidence-field pointer-events-none absolute inset-0">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="size-full" focusable="false">
        <defs>
          <radialGradient id="evidence-field-fade" cx="50%" cy="48%" r="62%">
            <stop offset="0.28" stopColor="#000" />
            <stop offset="0.62" stopColor="#fff" />
          </radialGradient>
          <mask id="evidence-field-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
            <rect width="1440" height="900" fill="url(#evidence-field-fade)" />
          </mask>
        </defs>
        <g mask="url(#evidence-field-mask)">
          {/* Far plane: the coordinate field. */}
          <g data-depth="0.4" className="evidence-field-grid">
            {GRID_X.map((x) => (
              <line key={`x${x}`} x1={x} y1="0" x2={x} y2="900" />
            ))}
            {GRID_Y.map((y) => (
              <line key={`y${y}`} x1="0" y1={y} x2="1440" y2={y} />
            ))}
          </g>

          {/* Middle plane: inspection orbits and the slowly turning tick ring. */}
          <g data-depth="1">
            <g className="evidence-field-orbit">
              <ellipse cx={ORBIT.cx} cy={ORBIT.cy} rx={ORBIT.rx} ry={ORBIT.ry} transform={`rotate(${ORBIT.tilt} ${ORBIT.cx} ${ORBIT.cy})`} strokeDasharray="2 7" />
              <ellipse cx={ORBIT.cx} cy={ORBIT.cy} rx="380" ry="300" transform={`rotate(14 ${ORBIT.cx} ${ORBIT.cy})`} />
              <circle cx={ORBIT.cx} cy={ORBIT.cy} r="560" strokeDasharray="1 12" />
            </g>
            <circle className="evidence-field-ticks" cx={ORBIT.cx} cy={ORBIT.cy} r="300" pathLength={360} strokeDasharray="0.12 2.88" />
          </g>

          {/* Near plane: evidence nodes, their annotations, and the traveling marker. */}
          <g data-depth="1.8">
            {EVIDENCE_NODES.map((node, index) => {
              const p = orbitPoint(node.theta);
              const right = p.x >= ORBIT.cx;
              return (
                <g key={node.label} data-motion="evidence-node" data-index={index} className="evidence-field-node">
                  <circle className="evidence-field-node-dot" cx={p.x} cy={p.y} r="3" />
                  <circle className="evidence-field-node-ring" cx={p.x} cy={p.y} r="16" />
                  <path className="evidence-field-node-cross" d={`M${p.x - 26} ${p.y}h8M${p.x + 18} ${p.y}h8M${p.x} ${p.y - 26}v8M${p.x} ${p.y + 18}v8`} />
                  {/* Below-the-CTA nodes hang their label underneath, clear of the buttons. */}
                  <text className="evidence-field-node-label" x={right ? p.x + 32 : p.x - 32} y={p.y > ORBIT.cy ? p.y + 26 : p.y - 10} textAnchor={right ? "start" : "end"}>
                    {`${String(index + 1).padStart(2, "0")} ${node.label}`}
                  </text>
                </g>
              );
            })}
            <g data-motion="evidence-marker">
              <circle className="evidence-field-marker-halo" cx={start.x} cy={start.y} r="11" />
              <circle className="evidence-field-marker" cx={start.x} cy={start.y} r="4.5" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
