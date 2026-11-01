# 0033 — Public front door: motion-first rebuild

Related: [[0031-public-front-door-visual-thesis]], [[0032-public-front-door-visual-execution]].

## Context

0032 delivered a static, densely-laid-out homepage. Feedback on it was decisive: it still
read as a document describing a product, not as a product itself. The directive for this
slice was explicit -- borrow HackerOne's *principle* (the product should feel alive before
the visitor reads about it), not its layout, colors, or copy, and rebuild the experience
around real Unpatched UI in motion rather than static information blocks. The previous
composition was allowed to be, and was, completely replaced.

## What changed

- `components/marketing/hero-artifact.tsx` and `security-lifecycle.tsx` were deleted --
  fully superseded, not kept alongside their replacements.
- `components/marketing/live-workflow-artifact.tsx` (new): the hero's product object now
  constructs itself in front of the visitor -- Program, Scope, Report, Severity resolving
  to Critical, Evidence, Triage, Decision, then an audit line -- holds, fades, and loops.
- `components/marketing/lifecycle-stepper.tsx` (new): a real, independently clickable
  button group driving the "How it works" section and two compact researcher/organization
  sequences, autoplaying with pause-on-hover/focus.
- `components/marketing/motion.ts` (new): `usePrefersReducedMotion`, shared by both.
- `components/marketing/program-discovery-preview.tsx`: reduced from a bordered
  empty-state table to a single line -- a feature that doesn't exist yet no longer gets a
  major section.
- `app/page.tsx`: the "How it works" section now renders `LifecycleStepper`; the
  researcher/organization columns each gained a compact `LifecycleStepper` above their
  existing descriptive `WorkflowDiagram` list; the program discovery section shrank to a
  one-line note.
- `tests/unit/marketing-ui.test.tsx`: rewritten for the new components.

`WorkflowDiagram` (the philosophy section and the two audience columns' descriptive
lists) is unchanged -- still real, not superseded by the new interactive pieces.

## Motion system

Four primitives, all CSS transitions driven by React state -- no animation library; none
is a dependency of this project and section 14 of the brief asked that one not be added
unless genuinely required.

- **Entry**: opacity + `translateY(6px)`, 500ms ease-out. Composited properties only, so
  no layout ever shifts as the hero constructs itself -- the panel is a fixed height from
  the first frame.
- **Progression**: a phase counter (`LiveWorkflowArtifact`) or active-index (
  `LifecycleStepper`) advancing on a `setTimeout`/`setInterval` chain, each transition
  carrying real semantic meaning (a badge's status value actually changes; nothing floats
  or fades "because websites do that").
- **Interaction**: hover or focus anywhere in a `LifecycleStepper` pauses its autoplay;
  moving away resumes it. Every stage is a real `<button>`, independently clickable and
  keyboard-activatable -- reachable without ever relying on the autoplay firing.
- **Reset**: `LiveWorkflowArtifact` holds at its complete state for 2.2s, fades out over
  350ms, then restarts from phase zero.

Deliberately **not** built: scroll-jacking. It was considered for the "How it works"
interaction and rejected -- it is fragile across input devices and routinely breaks
keyboard and screen-reader navigation, which this page cannot afford to break. A real
button group with autoplay delivers the "alive" quality without that risk.

`LifecycleStepper` renders plain buttons with `aria-pressed`, not `role="tab"`/`role=
"tabpanel"`. The ARIA tab pattern implies roving-tabindex arrow-key navigation this
component does not implement; claiming that role without it would be a worse
accessibility defect than not claiming it.

## Accessibility and reduced motion

`usePrefersReducedMotion` defaults to `true` until the real media query resolves on the
client, so a server-rendered or pre-hydration paint never shows motion a reduced-motion
visitor didn't ask for.

- `LiveWorkflowArtifact` under reduced motion renders its fully-revealed final state
  immediately and never cycles.
- `LifecycleStepper` under reduced motion never autoplays -- it simply stays on whichever
  stage is active until the visitor clicks another one. Every stage's content is always
  present in the DOM (`aria-hidden` toggles which one is exposed to assistive tech; none
  is ever removed), so a click always reaches all of it regardless of motion preference.
- The panel-switch crossfade (300ms opacity) is kept even under reduced motion: it is a
  direct response to a discrete user click, not ambient/looping motion, which is the
  category `prefers-reduced-motion` targets.

All of the above was verified live in Chromium, not inferred from source: the hero
artifact's rendered text was captured at multiple points in time and confirmed to
actually change; a `reducedMotion: "reduce"` browser context was used to confirm the
static baseline and the absence of autoplay; keyboard-only activation (`Tab` + `Enter`)
was confirmed to toggle a stage.

## Color

No new palette shipped. Four options were weighed (warm neutral / cool technical neutral
/ dark-first / high-contrast neutral + teal) and a full repaint was rejected because the
color tokens are shared with the entire authenticated product -- changing them here would
ripple far outside this page's blast radius, and the actual feedback this slice responds
to was about motion and product-identity density, not hue. The existing token pair
(`ink`/`canvas`, always opposite by construction -- see 0032) continues to carry the dark
inverted bands from the previous pass; teal (`action`) is now exclusively the color of
"active/progressing" state in the two new interactive components, never decorative.

## Real data boundary

Every animated artifact is labelled "Simulated for demonstration" in real, visible page
text on the hero panel, and the program discovery note still discloses the invite-only
truth in plain language. No researcher count, bounty total, response time, or fabricated
statistic was added. The word "live" was deliberately kept out of all visible copy
("Unpatched workflow," not "live Unpatched workflow") specifically so the motion reads as
"this product feels alive" rather than as a factual claim about real production activity.

## Authorization boundary

No RLS policy, RPC, migration, report lifecycle, program lifecycle, payment path,
notification path, platform-operations surface, or authentication logic was touched.
Only `app/page.tsx`'s anonymous branch and `components/marketing/*` changed.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (994/994) and `npm run build` all pass.
Live Chromium verification (not code inspection) confirmed: no console/hydration errors
against a clean dev build; the hero artifact's text genuinely changes across multiple
timed reads and reaches the fully-revealed state; the lifecycle stepper's active panel
(tracked via each panel's `aria-hidden` attribute, not gross page text) changes on click;
autoplay correctly pauses while focused/hovered and resumes once the visitor's mouse and
keyboard focus leave the widget; keyboard-only activation works; the reduced-motion
context shows the static baseline with no autoplay while clicks still work; zero
horizontal overflow at 1440/1280/1024/768/390/320px.

One dev-session artifact was diagnosed during this slice and is not a product defect:
running `next build` while `next dev` was still serving the same `.next` directory
corrupted the dev server's chunk cache (404s / wrong MIME types on `main-app.js`),
which silently prevented all client-side hydration and made every interactive component
inert. The fix was stopping the dev server before building, not a code change -- recorded
here so a future session doesn't re-diagnose the same false lead.
