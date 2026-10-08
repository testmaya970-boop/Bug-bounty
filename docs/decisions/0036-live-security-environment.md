# 0036 — Live security environment: Concept C, "Permanent Record" (implemented)

Related: [[0032-public-front-door-visual-execution]], [[0033-motion-first-front-door]],
[[0034-public-front-door-product-stage]], [[0035-unpatched-visual-identity-system]].

Concept C ("Permanent Record," built as foreground artifact density -- never an ambient
canvas/particle background) was approved and implemented. This document originally
stopped at the thesis; this section records what was actually built, per the follow-up
brief's instruction to update this document rather than create a competing one.

## Implementation record

**Exact choreography built** (`components/marketing/live-workflow-artifact.tsx`, 10
phases, ~950ms apart): two static, muted "noise" rows render immediately and never
change (`Stored XSS in report comment field` / Triaging, `Rate limit missing on password
reset` / Needs information -- the same two illustrative reports `RealProductFragment`
shows elsewhere, deliberately, for cross-section continuity). The active finding then:
report received (title + target, status New) -> severity resolves to Critical -> evidence
attaches (3 artifacts) -> triage begins (Triaging) -> information requested (Needs
information) -> response received (note appears) -> triage resumes (status flips back to
Triaging) -> decision recorded (Accepted) -> audit event created ("Audit event recorded"
line appears) -> **filed**: the active row visually quiets (opacity step-down) while a
locked, dated entry ("Authentication bypass -- locked," `31 Aug 2026 · 14:28`) appears in
a permanent "Audit record" ledger beneath it, replacing an "No entries recorded yet"
placeholder. Holds 3.2s, fades, resets to a blank cycle.

**Composition**: hero grid moved from a fixed-width product column to a `2fr/3fr` (~38/
62) split at `lg`, and the artifact's cap grew `max-w-2xl -> max-w-3xl`.

**Real components reused**: `MetadataPair`, `SectionLabel`, `SeverityBadge`,
`StatusBadge` -- no new primitives invented, exactly as audited in the thesis.

**Illustrative, disclosed**: every report title, the program name, and the locked entry's
timestamp -- all inside a panel headed "Simulated for demonstration" in real visible text.
No count, percentage, or statistic anywhere in the artifact.

**Auth**: `AuthLayout`'s identity panel gained one non-looping pulse
(`signal-pulse-once`, `animation-iteration-count: 1` via `motion-safe:animate-[...]`) on
its tagline dot -- one subtle pulse, then stops, per the brief's explicit "not another
marketing animation" instruction.

**Reduced motion**: unchanged mechanism (`usePrefersReducedMotion` defaults to the safe
baseline) -- extended to mean the fully-filed, locked audit-record end state renders
immediately, never a partial construction.

**Performance**: no canvas, no new dependency, no continuously-running loop -- the same
`setTimeout` phase-advance pattern as 0034/0035, now with 10 phases instead of 9.

**Mobile**: copy-first, then the full artifact (all three regions: noise rows, active
finding, ledger) stacks below it -- not a separate mobile-specific reduction, since two
quiet rows was already within the brief's requested 2-3 range.

**Real bugs found and fixed during verification** (not present before this slice's own
new code, confirmed live in Chromium, not by inspection):
1. `RealProductFragment`'s mono route label had no `break-all`/`min-w-0`, so its
   unbroken slash-delimited string forced horizontal overflow at 390/320px -- fixed, and
   its table was additionally switched to the same table/mobile-card responsive split
   `ReportInboxTable` already establishes (it was previously showing a cramped table
   below `sm` instead of reusing that established pattern).
2. `LiveWorkflowArtifact`'s header bar (two mono labels in a `justify-between` row) had
   no wrap allowance, overflowing at 320px -- fixed with `flex-wrap`.
3. The hero's new `2fr/3fr` grid, below the `lg` breakpoint, had no explicit
   `grid-template-columns`, so its implicit single-column track sized to its widest
   child's max-content width rather than the container's actual assigned width (a CSS
   Grid intrinsic-sizing edge case, distinct from the more commonly-known flex-basis
   `min-width:auto` issue) -- fixed with an explicit `grid-cols-[minmax(0,1fr)]` base
   definition.

## Brutal before/after score

| Dimension | Before (0035 hero) | After (0036 hero) |
|---|---|---|
| Visual identity | 6.5/10 | 7/10 |
| Product credibility | 5/10 | 7.5/10 -- multiple real rows + a permanent ledger reads as an actual workspace, not one demo card |
| Product immediacy | 5/10 | 7/10 |
| Motion quality | 6/10 | 7.5/10 -- the "filing" moment is a genuinely new, meaningful transition the prior passes lacked |
| Differentiation | 5/10 | 6.5/10 |
| Information hierarchy | 5/10 | 7/10 -- noise/active/record is now a real, visible three-tier hierarchy |
| First-5-second comprehension | 5/10 | 7/10 |
| **Overall** | **5.3/10** | **7/10** |

Not a 9. The composition is still a headline-and-panel hero at the macro level (the
brief's own "remove the wordmark" test would likely get "a security/vulnerability
platform" now, which is the goal -- but "category-defining" implies a visual bar this
pass narrows the gap to without closing it). The honest remaining gap: section-to-section
continuity (brief's §10/§12) is still just chapter rhythm, not a genuinely reinforced
single narrative -- deferred as scoped, not solved.

## 1. Live competitor research (this pass)

Fetched, this pass, specifically checking markup for `<canvas>`, animated `<svg>`, `<video>`,
animation-library script references (Framer Motion/GSAP/Three.js/Lottie/particles.js),
and CSS class names suggesting particle/topology/network backgrounds:

| Site | Canvas/particle/topology background found? | Actual hero mechanism |
|---|---|---|
| HackerOne | **No** | Typography + whitespace; one embedded Wistia video, a discrete player, not an ambient background |
| Immunefi | **No** | Solid background; message-weight typography ("92% of Web3's critical vulnerabilities...") |
| Bugcrowd (0034 research) | **No** | Rating badge + customer logos |
| Intigriti (0034 research) | **No** | Static researcher-profile image gallery |
| YesWeHack (0034 research) | **No** | Static background images, no video/canvas |
| Linear | **No** | A single large **static image** of the real product UI (issue tracker panels), served from Cloudflare, no animation library |
| Cursor | **No** | A single large **static image** of the real product UI (task list) layered over a solid brand background |
| Vercel | **No** | Static product-UI screenshots (customer case studies: Notion, Zapier, Mintlify) |
| Attio | **No** | Static product-UI screenshots throughout, dense navigation, no background effects |

**This is the load-bearing finding, and it runs counter to this slice's opening premise.**
Zero of the nine sites checked across this and the prior research pass use an ambient
canvas/SVG/particle background system. What separates Linear/Cursor/Attio's perceived
maturity from a generic SaaS page is not environmental animation -- it is **a single,
large, highly detailed, real product-UI view**, usually static. The premise in section 2
of this task ("the environment itself does not feel alive... build a signal field
background") is not what any researched reference site actually does. Building one
anyway would mean inventing a mechanism these companies themselves have not validated,
and -- worse -- an ambient particle/topology background is precisely the kind of visual
the brief's own section 7 calls a cliché ("if it could be used on a crypto landing page
... it is not sufficiently specific"). A canvas signal-field, however tastefully
restrained, risks being exactly that.

## 2. Current Unpatched weaknesses (0035 screenshots)

Confirmed from the actual shipped screenshots, not assumption: the environment (`bg-ink`
flat fields) is genuinely inert between animated components -- true, and worth fixing.
But the fix the research supports is **increasing the density and realism of the
foreground product artifact itself** (more of it, more real-looking, closer to
Linear/Cursor's single-detailed-screenshot mechanism), not adding a background layer
behind it.

## 3. Three concepts, evaluated against the research

**A. Signal field** (ambient canvas background, nodes/signals travelling behind the
product). Evidence-risk: **high** -- no reference site does this; real risk of landing in
the generic-particle-effect category section 7 explicitly forbids. Feasibility-risk:
canvas/SVG scene management, 60fps target, offscreen pausing -- real engineering surface
for a payoff the research doesn't support.

**B. Security telemetry** (restrained event traces appearing/resolving). Lower risk if
built as foreground density (real event rows near the artifact) rather than true ambient
background.

**C. Permanent record** (an ephemeral signal becomes a locked audit entry). Lowest risk,
most evidence-aligned: this is closest to what `LiveWorkflowArtifact` already does
(a report's fields populate, then lock in), and extending it toward a denser,
multi-row, real-inbox-like foreground artifact is structurally the same move
Linear/Cursor/Attio make (one large, detailed, real interface view as the hero).

## 4. Selected concept: C, modified -- "Permanent Record," built as foreground density, not ambient background

Not literally "add a canvas layer." Instead: the hero artifact grows from showing one
report's fields in isolation to showing **several report rows at once** -- most muted/
quiet (representing the noise: other, lower-priority reports sitting in the inbox), one
visibly active and progressing through its lifecycle (the existing choreography), which
on completion **files into a compact, permanent, already-decided list** beneath it (the
audit record), while the periphery keeps a couple of faint, static rows to suggest an
inbox that has other real activity in it -- all real Unpatched data shapes
(`ReportInboxTable`'s exact row/badge grammar, already reused in `RealProductFragment`),
never an invented visualization. This directly satisfies "noise -> signal -> record" as a
literal, honest visual mechanism, using only real product primitives, and it is the same
underlying move (one large, dense, real-feeling interface) that demonstrably works for
Linear/Cursor/Attio -- not an unproven background technique.

## 5. Why this is Unpatched-specific

Every element is a real Unpatched noun (program, scope, report, evidence, triage,
decision, audit) rendered through real badge/table components already used elsewhere in
this project. Remove the wordmark and what remains is: several report rows with severity/
status badges, one actively changing state, one list of decided/audited entries. That is
unambiguously "a vulnerability/security-operations product," not a generic dark SaaS
hero -- the section 25 test this slice must pass.

## 6. Background architecture

No canvas, no SVG scene graph, no new rendering technology. The hero band's background
stays the flat `bg-ink` field from 0034/0035; what's proposed as "environment" is
entirely the foreground artifact's own increased density (more rows, more real content),
built with the same React state + CSS transition primitives already proven safe and
performant in `LiveWorkflowArtifact`/`LifecycleStepper`.

## 7. Animation choreography (proposed, not yet built)

Extends the existing 9-phase hero sequence: 2-3 muted rows render immediately and stay
static throughout (the "noise"); the existing active-report choreography plays as before
(phase 0-8); on completion, instead of only holding then fading the whole panel, the
completed report's row visibly compresses/moves into a new "Audit record" list beneath
the active area (a real, if modest, causal transition -- signal becomes permanent record
in front of the visitor) before the full-panel hold/fade/reset. Section transitions
(scroll-based continuity between sections) from the brief's section 12-13 are **not**
recommended: implementing genuine scroll-linked narrative continuity without
scroll-jacking is a materially larger engineering undertaking (`IntersectionObserver`-
driven state per section, careful reduced-motion and performance work) than this
research found justified by any reference site, none of which use scroll-driven
environmental storytelling either. Recommend deferring that specific idea unless a future
pass wants to scope it as its own slice.

## 8. Product integration

Reuses `MetadataPair`/`SeverityBadge`/`StatusBadge`/`ProgramStatusBadge` (already-proven
components) plus the same row grammar `RealProductFragment` already established for the
"real product" section -- no new primitives invented.

## 9. Section continuity

Recommend against forcing literal visual continuity (a signal "flowing" from section to
section) for the reason in §7 -- not evidence-backed, meaningfully higher engineering
risk. The chapter rhythm and `SignalLine` motif from 0034/0035 already provide a
consistent, lower-risk throughline.

## 10. Color

Unchanged: dark field / white product surface / teal signal, exactly as 0035 established
and disciplined.

## 11. Typography

Unchanged from 0034/0035 -- not implicated by this pass's findings.

## 12. Auth integration

The brief's ask (a small static signal field in the auth identity panel, one subtle
pulse, then stop) is compatible with the "permanent record" concept and low-risk: the
existing static `WorkflowDiagram` in the auth panel could gain one modest, single,
non-looping pulse on mount (respecting reduced motion trivially by simply not adding the
one-shot animation class). Recommend keeping this small and deferring detail to the
implementation pass.

## 13. Mobile

The denser multi-row artifact needs a real mobile plan, not a shrunk copy: recommend
showing only the active row plus one muted row (not three) below `lg`, consistent with
0034/0035's existing "intentional mobile composition" precedent.

## 14. Reduced motion

Unchanged mechanism: the reduced-motion baseline already renders the fully-revealed
state; extending it to include the "filed into the audit list" end-state is a direct,
low-risk extension of the existing `usePrefersReducedMotion` pattern.

## 15. Performance

Adding 2-3 static muted rows is negligible DOM/paint cost. No canvas/WebGL, no new
dependency, no continuous rendering loop -- explicitly avoided per §1's finding.

## 16. Rejected

**Ambient canvas/SVG signal-field background** (Concept A, literal) -- not supported by
any of the nine sites researched across this and the prior pass, and risks landing in
the generic-particle-effect category the brief itself forbids. **Scroll-driven section
continuity / signal "flowing" between sections** -- real engineering surface, not
evidence-backed by any reference site, recommended as its own future slice if wanted, not
folded into this one. **Security telemetry as ambient background** (Concept B, literal)
-- same objection as Concept A; recommended only as foreground density, which is what
selected Concept C already provides.

## Recommendation

Proceed with Concept C as described in §4, built as foreground artifact density, not a
background environment layer. This is a smaller, safer, more evidence-aligned change than
the brief's literal ask, and I'm flagging that divergence explicitly rather than building
an ambient background system the research doesn't support. Awaiting review before any
implementation.
