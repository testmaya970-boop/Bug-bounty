# 0057 — Bold, animated reskin authorized app-wide; DESIGN.md/AGENTS.md rewritten

Related: [[0033-motion-first-front-door]], [[0035-unpatched-visual-identity-system]],
[[0043-researcher-visual-identity-pass]], [[0056-public-homepage-visual-reskin-override]],
[[0058-dashboard-command-center-recomposition]], [[0059-sidebar-nav-restructure-and-dedup-fix]],
[[0060-security-ops-typography-system]].

## The request and why this is a documents-level decision, not another one-off

[[0056]] recorded one deliberate, disclosed, **page-scoped** override of
`DESIGN.md`'s anti-copying rule — reskinning only the public homepage after
a Jasper.ai screenshot — and explicitly said it "does not reopen the rule
... for any other screen." The user has now, on separate explicit
instruction, said the whole app "looks generic," "too simple for a bug
bounty program," and is missing the small animations/visual richness a
reference site (Jasper.ai) has — and asked directly that `AGENTS.md` and
`DESIGN.md` themselves be rewritten, not that another single page be
reskinned under the old rule.

Per `AGENTS.md`'s own authority order (current task requirements sit above
`AGENTS.md`/`DESIGN.md` themselves) and its conflict-handling rule ("stop,
identify the conflict, document a resolution — never silently choose a
behavior"), this doc is that documented resolution. It supersedes 0056's
"does not reopen the rule elsewhere" boundary **explicitly and by name**:
this is the disclosed reopening, app-wide, that 0056 anticipated might
someday happen and declined to pre-authorize on its own.

## Decisions made

Confirmed directly with the user before any doc or code changed:

1. **Scope is the whole app.** Both the public marketing surface and the
   authenticated security-operations product (dashboard, report triage,
   programs, reputation, notifications, settings) get the bolder, more
   animated direction — not marketing-only.
2. **Density does not change.** Triage/table/inbox screens keep their
   current information density and type scale. "Bolder" means richer
   motion and visual treatment around the existing layout, never bigger
   rows or more whitespace trading away scan speed.
3. **Motion timing is unified, not tiered.** The public homepage's slower,
   more dramatic reveal timing (entrance/reveal up to ~600ms, staggered)
   is now the standard everywhere, including the authenticated product —
   chosen over keeping operational screens on a separate, snappier budget,
   for one visually consistent app rather than two motion languages.
4. **Pre-existing doc-integrity gap fixed alongside this work.** Three
   dangling decision-doc citations in code comments (a bare "0057", and
   "0062"/"0063") pointed at numbers that were never written. [[0058]],
   [[0059]], and [[0060]] now exist to record what that code already does;
   this doc claims the `0057` slot itself going forward, and the citing
   comments are corrected to their real numbers.

## What changed in the governing documents

**`DESIGN.md`** — content rewritten, structure (10 sections) kept:

- Visual theme (§1) moves from "calm, precise, observant" to a confident,
  high-contrast, premium security-console thesis, while keeping the
  non-negotiables that never depended on minimalism: sensitive state stays
  legible, empty states self-explain, triage hierarchy stays scannable.
- Color palette (§2) is corrected to the *actual* `app/globals.css` values
  (dark-primary, `.light` opt-out) — it had been documenting a stale
  light-primary/teal palette independent of this task. The anti-copying
  rule is **loosened, not deleted**: a named commercial product is
  legitimate inspiration when a task explicitly directs it (as Jasper.ai
  was here and in 0056); literal verbatim reuse of another brand's exact
  palette, iconography, or layout stays prohibited — extract the
  underlying pattern and rebuild it in Unpatched's own tokens, exactly as
  0056 already modeled.
- Typography (§3) keeps the operational type scale exactly as documented
  (per decision 2 above) while permitting much larger display sizes for
  hero/marketing moments.
- Depth and interaction (§6) gains a real, specific motion vocabulary:
  three new keyframes (`hero-reveal`, `glow-pulse`, `shimmer`) alongside
  the four that already existed, a unified timing budget (functional
  micro-interactions 120–200ms; entrance/reveal 200–600ms with stagger,
  applied everywhere per decision 3), and an expanded, explicit role for
  `framer-motion` beyond its current single use in
  `components/app-shell-client.tsx`. The reduced-motion contract — every
  pattern resolves to the final, fully-visible state under
  `prefers-reduced-motion: reduce`, never a slowed version — is restated
  unchanged; it is not up for negotiation under this bolder direction.
- "Do and do not" (§7) narrows "no generic cyber decoration" to literal
  clichés (matrix rain, stock hacker imagery, fake terminal typewriter
  effects) rather than prohibiting boldness itself. Every other rule —
  no fabricated metrics, auditable irreversible actions, no authorization
  logic in presentation components, deliberate-token-or-flag-the-gap,
  extract-don't-copy — is unchanged.
- "Reference-informed methodology"/"Reference Research" is updated to
  match the loosened §2 rule; the VoltAgent/obra-superpowers structural
  *process* methodology stays adopted exactly as before (it was never
  about brand).

**`AGENTS.md`** — "Research sources" gains a split between **standing
references** (the existing GitHub list, no per-use justification) and
**task-directed commercial references** (a live commercial product is
legitimate only when a specific task explicitly names it or the user
explicitly directs it, documented in a decision doc when it happens — never
pre-authorized in bulk). "Authority and conflict handling" keeps its
ordering and conflict rule unchanged — it is the exact mechanism that
produced both 0056 and this doc — with one added line: a request to
rewrite these documents is itself resolved through this same order, which
is why this rewrite is legitimate process, not a violation of it. "Working
method" and "Product integrity" are unchanged; nothing here loosens the
"never fabricate metrics" rule.

## Rollout

Applied in phases, tracked as they land (see the working plan for the
authoritative phase list at execution time):

- **Phase A** — motion primitives: three new keyframes in
  `app/globals.css`; `usePrefersReducedMotion` generalized from
  `components/marketing/motion.ts` to a shared `lib/motion.ts`.
- **Phase B** — shared component library (badges, feedback/skeleton
  primitives, buttons) gets the new states once, at the source every
  screen inherits from.
- **Phase C** — authenticated product, in priority order: dashboard,
  report inbox, programs, reputation, notifications, settings.
- **Phase D** — public pages beyond the homepage, unified onto the app's
  standard Space Grotesk/Inter system rather than propagating 0056's
  page-scoped font further.
- **Phase E** — a consistency pass re-running `DESIGN.md`'s own
  light/dark, compact/comfortable, populated/empty pressure-test across
  every touched screen.

## Verification

Per phase: `npm run typecheck`, `npm run lint`, `npm test`. Rendered checks
in both themes at 320/390/768/1440px, with `prefers-reduced-motion: reduce`
simulated on every screen touching a new keyframe or `framer-motion`
addition, confirming the final static state (never a slowed animation).
`npm run build` run once at the end of the full rollout.
