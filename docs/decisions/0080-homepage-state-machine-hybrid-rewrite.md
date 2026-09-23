# 0080 — Homepage structural rewrite: hybrid, not full Direction B

Status: accepted, implemented.

## The conflict this resolves

`0077-visual-identity-directions.md` proposed and recommended "Direction B: The
State Machine" as the homepage's governing visual idea, prototyped in isolation at
`components/marketing/security-record-prototype.tsx` (`/design-preview/state-record`)
— but the live homepage (`app/page.tsx`) instead runs `0056`'s competitor-inspired
reskin (pill nav, bento feature grid, warm palette), and Direction B was never
wired into it. A later external design review (brutal, unaffiliated with prior
passes) scored the live page 6/10: generic hero copy, an overused eyebrow-pill
device (5 instances), an illegible/oversized hero product screenshot, monotonous
section rhythm, and a closing CTA that just echoed the hero. Separately, real
competitor research (HackerOne, Bugcrowd, Immunefi) found none of them use
filled/colored stat cards — weight comes from numeral size, not card chrome — and
all three lean on social proof (logos, ratings, dollar amounts) this product's own
rules (`DESIGN.md`, `AGENTS.md`) forbid fabricating.

This is a real, resolved conflict between two prior directions (`0056`'s shipped
shell vs. `0077`'s recommended-but-unshipped concept), which `AGENTS.md`'s own
process says must be written down, not silently decided mid-session.

## Decision: hybrid

Keep `0056`'s shell — pill nav, vermilion/pine-teal tokens (`0078`), Plus Jakarta
Sans, rounded CTAs, FAQ. None of that was the brutal review's complaint. Replace the
page's monotonous middle with one literal, CSS-only state-machine graph section,
built from `0077` Direction B's *reasoning*, not its file — because visualizing the
real, constrained report-triage graph is this product's only legitimate
differentiator once fabricated stats/logos/testimonials are off the table.

Explicitly rejected: lifting `security-record-prototype.tsx` wholesale. That
prototype is a from-scratch page with its own nav, its own `--record-*` tokens,
GSAP timelines, and a hand-written GLSL shader background. Reusing it would reopen
exactly what `0056` fixed (a bespoke visual system disconnected from the shipped
app), and an ambient shader background is, in spirit, the same pattern `0031`–`0036`
already researched and explicitly rejected (ambient canvas/particle backgrounds).

**No disclosed-conflict step was required** for the new diagram itself: it is
principle-level inspiration (no named competitor — HackerOne, Bugcrowd, Immunefi —
uses this exact pattern), not a pixel-copy of a specific reference. It would be
required if the prototype's GLSL shader or GSAP parallax were lifted verbatim —
both are explicitly excluded from this rewrite.

## What changed in `app/page.tsx`

- **Hero:** removed a single-word color accent in the H1 (`<span
  className="text-action">record</span>`) — a generic-AI-design tell introduced by
  an earlier fix pass; the unframed `LiveWorkflowArtifact` beside the copy is the
  hero's one visual distinction, and a colored word competed with it rather than
  reinforcing it.
- **Eyebrow pills removed (5 → 0):** "What Unpatched does," "For researchers," "For
  organizations," "Why it's built this way" (an inline span using identical
  styling, not the `Eyebrow` component, but functionally the same device),
  "Questions." The signal-path strip's content-chip row is not an eyebrow and was
  kept — it carries real information (the 8 real stage names), not a section label.
  The now-fully-unused `Eyebrow` component was deleted.
- **Reflexive arrows removed:** the decorative `ArrowRight` in the third
  `FeatureCard` (replaced with `ClipboardCheck`, distinct from the second card's
  `CheckCircle2`), and both "Continue as researcher"/"Continue as organization"
  secondary-link arrows. Kept on the two primary hero CTAs and the final CTA's
  primary link, and on the signal-path strip (a real path, not decoration).
- **`StatTile`:** removed the `tone` prop and its `bg-ink`/`bg-action`/`bg-accent-2`
  filled-card variants. Competitor research showed none of HackerOne, Bugcrowd, or
  Immunefi use filled stat cards — their weight comes from numeral size and
  boldness against a plain background. New treatment: `text-6xl sm:text-7xl`
  numerals directly on the section background, no card chrome; one of the three
  numerals uses `text-action` on the digits themselves (color-on-numeral, not
  color-as-background). Content (7 stages / 1 record / 0 silent changes) is
  unchanged — real structural facts, not invented metrics.
- **New section — "Not a status field. A state machine."**: replaces the old
  standalone card wrapping `LifecycleStepper` with `SECURITY_LIFECYCLE_STAGES`,
  which showed the same six stages a second time, one screen apart, as a redundant
  linear stepper. The new `components/marketing/state-machine-diagram.tsx` renders
  a literal SVG graph of the real report-triage state machine
  (`docs/decisions/0009-report-triage-state-machine.md`): every node is a real
  `ReportStatus`, every edge a real legal transition from that doc's transition
  table, including the real `needs_information ↔ triaging` back-edge. One
  representative path (new → triaging → needs_information → triaging → accepted →
  resolved — the same path `SIGNAL_PATH` and `LiveWorkflowArtifact` already
  narrate) is lit and animates via `IntersectionObserver` + `stroke-dashoffset` when
  the section scrolls into view; the four other real terminal exits from
  `triaging` (duplicate/informative/not_applicable/rejected) are drawn as real,
  dimmer, static edges — present and honest, never hidden, since a state machine
  that genuinely branches should not be flattened into a straight line for the
  page. This is the one motion moment on the entire page.
  `prefers-reduced-motion` renders every edge already fully drawn, dot omitted, per
  the same standard `LiveWorkflowArtifact` and `LifecycleStepper` already meet.
  `SECURITY_LIFECYCLE_STAGES` (now fully unused) was deleted.
- **Final CTA:** rewritten from "Every decision on Unpatched is recorded. Nothing
  is quietly overwritten." (near-verbatim restatement of the hero H1, which is why
  it read flat) to "No edge in that graph erases a prior state." — pays off the new
  state-machine section instead of echoing the opener.

## What stays untouched

- `components/marketing/security-record-prototype.tsx` and the
  `/design-preview/state-record` route — left in place, not deleted, still isolated.
- `--record-*` tokens in `globals.css` — left as-is, scoped to the prototype only;
  the new diagram uses the app's existing semantic tokens instead.
- The authenticated `HomePage` branch of `app/page.tsx` and everything under it.
- `LifecycleStepper`, `WorkflowDiagram`, `ProgramDiscoveryPreview` — kept, still
  used in the researcher/organization split and the FAQ section.
