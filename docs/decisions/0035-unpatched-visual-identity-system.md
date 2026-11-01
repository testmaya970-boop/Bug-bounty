# 0035 — Unpatched visual identity system

Related: [[0031-public-front-door-visual-thesis]], [[0032-public-front-door-visual-execution]],
[[0033-motion-first-front-door]], [[0034-public-front-door-product-stage]].

## 1. Competitor research (this pass's new question)

0034 already live-fetched HackerOne/Bugcrowd/Intigriti/YesWeHack/Immunefi and found their
"alive" feeling comes from real video/logos/ratings/individual profiles/aggregate stats --
categories Unpatched cannot use. This pass asked a different question of that same data
plus new research into 2025-2026 product design broadly, searched live: **why does a
visitor perceive a product as mature and recognizable, independent of what the product
demonstrates?**

FACT (from this pass's live search): 2026 SaaS design has split into two dominant,
opposite aesthetics -- **techno-futurist** (dark mode, bento grids, the product itself as
the hero, exemplified by Linear/Cursor/Attio putting a live product view directly in the
hero) and **editorial** (cream, serif, whitespace). INFERENCE: Unpatched's prior slices
(0032's serif-led pass, 0034's dark-hero-but-still-cautious pass) sat *between* these two
committed aesthetics rather than fully inside either one -- which is itself a plausible,
concrete reason it reads as "tasteful" rather than "category-defining": it never fully
commits to the techno-futurist register its own dark-hero direction was already reaching
toward.

FACT: the same research names "the product is the demo" as the specific mechanism
separating Linear/Cursor/Attio's hero energy from a generic hero -- a live, real interface
view in the hero, not an illustration of one. Unpatched's 0034 hero already does this in
substance (a real component-built artifact, not an illustration) but the research also
names *recognizability* as a distinct, separate axis from product demonstration: a
repeated, consistent graphic device is what makes a visual language "brand," not just
"good design." Unpatched has never had one of these across the whole site.

## 2. Brutal audit of the 0034 screenshots

Scored 1-10 against the actual shipped screenshots (1440px and 390px), not the previous
implementation report's self-assessment.

| Dimension | Score | Why |
|---|---|---|
| Visual identity | 4/10 | Real tokens, real components -- but no single recognizable graphic device repeats across sections; each section is "a heading + a different component," not one system. |
| Product presence | 6/10 | The hero artifact and real-product fragment are genuinely real and reasonably prominent -- the strongest dimension. |
| First-viewport impact | 5/10 | The dark hero is a real improvement over 0033, but the composition is still headline-left/card-right with a lot of plain dark space around both -- no secondary visual anchor. |
| Motion | 4/10 | Each animated piece (hero, stepper, mini-sequences) is internally coherent, but they visibly run on independent clocks with no shared visual thread connecting them -- reads as several cycling widgets, not one system. |
| Typography | 6/10 | The bold-sans/Fraunces split is a real, deliberate contrast now, reasonably executed. |
| Color | 5/10 | Dark/white/teal is present and correct in principle, but teal is under-used as "the signal color" -- it appears mainly on buttons, not as a consistent marker of "this is active/moving" anywhere else. |
| Composition | 5/10 | Competent, safe. Not distinctive. |
| Density/hierarchy | 6/10 | The chapter rhythm and density shifts work. |
| Trust | 4/10 | Correctly has no fabricated proof; the real-product fragment is the main real trust signal. |
| Researcher appeal | 5/10 | Functional, clear, unremarkable. |
| Organization appeal | 5/10 | Same. |
| **Auth experience** | **2/10** | A plain centered form on flat canvas, zero product identity, zero visual continuity with the homepage -- the single worst-scoring surface in the product, confirmed directly from `components/auth/auth-layout.tsx`. |
| **Overall** | **4.5/10** | Real, honest progress since 0033, but not yet category-defining, and the auth handoff actively undermines what the homepage built. |

**The three concrete, biggest reasons**, as required:

1. **No repeated graphic signature.** Every section is well-composed in isolation, but
   nothing visually recurs across sections the way a brand mark does -- there is no
   "if you saw this fragment alone, you'd know it was Unpatched" object.
2. **The animated pieces don't read as one system.** The hero, the lifecycle stepper, and
   the two mini-sequences are each real and each correct, but they run on independent
   timers with no shared visual thread -- the page feels like several small demos, not
   one operating system.
3. **The auth pages are a discontinuity, not a handoff.** A visitor who just watched a
   dark, teal-signal, product-forward homepage lands on a plain beige form with no
   identity at all one click later. This is the single most damaging gap found this pass.

## 3. Visual signatures considered

**A. Signal line** -- a thin, consistently-styled teal rule with a traveling pulse,
recurring in the same visual position across every dark section (and, restrained, in the
auth identity panel). **B. Event stream** -- REPORT CREATED -> EVIDENCE ATTACHED -> ...
scrolling as a log. **C. State transformation** -- one report object visibly mutating as
it moves through the system (already substantially what `LiveWorkflowArtifact` does
internally).

**Selected: A, Signal line** -- combined with keeping C as the *internal* mechanism of the
hero artifact (it already works and satisfies the brief's "state transformation" idea at
the artifact level), but adopting the **signal line** as the page's one cross-section
*graphic* signature, because it is the only candidate that directly answers "no repeated
graphic signature" (finding #1 above): the same thin teal rule with a pulsing point
recurs, unmistakably, in the hero, the lifecycle section, the real-product section, the
final CTA, and (restrained, non-animated) the auth identity panel. Event stream (B) was
rejected as a second, competing motion language on top of an already-real one.

**Honest scope decision on "one coherent event" (brief section 7):** the hero's own
internal choreography is already one coherent 9-phase event (0034) and needed no
restructuring. What was *not* done -- and is stated here rather than silently skipped --
is forcing the hero, the lifecycle stepper, and the mini-sequences onto one shared global
clock. The stepper must support a visitor's manual click overriding its position at any
time; a rigid shared clock is fundamentally incompatible with that and would make the
component worse, not more "coherent." The signal line is the answer to "one system" that
doesn't sacrifice the stepper's interactivity: one recognizable graphic device instead of
one recognizable timer.

## 4. Color / environment system

No new tokens. The relationship the brief asks for -- dark field + white product surface
+ teal signal -- already exists in the token system (`bg-ink` fields, `bg-surface` cards,
`action` teal); what changes is *discipline*: teal is now reserved exclusively for the
signal line and any other "this is actively progressing" indicator, never used as a
generic accent elsewhere on the marketing page.

## 5. Typography

Unchanged from 0034 (bold sans for hero/dark-chapter headlines, Fraunces demoted to a
light-chapter accent) -- the audit found this pairing already working; the identified
problems this pass were identity and motion-cohesion, not typography.

## 6. Hero composition

The artifact's max-width grows from `36rem` to `42rem` (and its grid column track to
match) -- genuinely larger, closer to equal weight with the headline, per the brief's
"the object should feel substantial enough that the visitor immediately understands
'this is software.'" The signal line now occupies the hero's left gutter as the first
instance of the page's new recurring graphic.

## 7. Motion choreography

Unchanged internally (0034's 9-phase hero, the stepper's autoplay-with-pause). Added: the
signal line's traveling pulse, `motion-safe:`-gated (a pure-CSS animation, not JS), so it
already respects `prefers-reduced-motion` for free without a `usePrefersReducedMotion`
hook -- under reduced motion the line renders as a static rule with a static point, never
hidden, never animated.

## 8. Public/auth relationship

`AuthLayout` is rebuilt as a two-column composition: a dark identity panel (left, desktop)
carrying the wordmark, a short restrained *static* signal sequence (no autoplay -- the
brief is explicit that auth must stay calm), and context-specific copy; the actual form
(right, unchanged behavior) stays exactly as calm and usable as before. On mobile the
identity panel collapses to a short top band, not a stacked copy of the desktop layout --
an intentional mobile composition, not a collapsed desktop one.

## 9. Researcher experience / 10. Organization experience

The identity panel's copy and mini-sequence are parameterized by a new `variant` prop
(`"researcher" | "organization" | "default"`) on `AuthLayout`, so
`/researchers/sign-up` shows "Find vulnerabilities. Submit evidence. Track decisions,"
and `/organizations/sign-up` shows "Define scope. Run programs. Triage findings. Record
decisions" -- distinct, but visually one system with `/sign-in`/`/forgot-password`/
`/reset-password`'s neutral default variant.

## 11. Product UI reuse

No new product primitives invented. The auth identity panel reuses `WorkflowDiagram` in
its existing `inverted` tone, the same component already proven in the philosophy section
history and the homepage's dark chapters.

## 12. Accessibility

The signal line conveys no information by itself (it is `aria-hidden`, purely
atmospheric); nothing on the auth pages depends on it. All existing keyboard/focus/
reduced-motion behavior from prior slices is unchanged; the auth form markup itself is
untouched, only its surrounding chrome.

## 13. Responsive behavior

Verified at all six required breakpoints (below). The auth split collapses to a short
top identity band on mobile rather than stacking the full desktop panel.

## 14. Performance

The signal line is pure CSS (`motion-safe:animate-[...]`), zero JS, zero new dependency.

## 15. Explicitly rejected

Event-stream as the primary signature (competing motion language). A single shared
animation clock across hero/stepper/mini-sequences (breaks stepper interactivity).
Restyling the auth *form* itself (out of scope -- behavior and the form's own markup are
unchanged; only `AuthLayout`'s surrounding chrome changed). Any new color token. Any
change to authentication semantics, password policy, rate limiting, or redirect security.
