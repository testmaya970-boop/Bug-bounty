# Unpatched Design System

This is the visual source of truth for Unpatched, an original security research and vulnerability-management platform. It is for product interfaces, not marketing experiments. When requirements conflict, prioritize comprehension, trustworthy handling of sensitive information, and accessibility.

## 1. Visual theme and atmosphere

Unpatched is a warm, confident, premium security-research platform: a cream canvas, a green/orange semantic accent pair, and soft depth on every surface — not a generic SaaS starter template, and not the colder dark-primary "security console" the app used before. Per [[docs/decisions/0062-unified-warm-theme]], the public homepage's own warm palette (originally scoped to that one page under [[docs/decisions/0056-public-homepage-visual-reskin-override]]) is now `app/globals.css`'s actual `:root` theme, applied identically across the public homepage, the authenticated dashboard, and every other screen. `.dark` remains a real, supported opt-in (a deep warm-charcoal variant of the same green/orange hue family, never a different accent color) rather than the default.

Every shared surface — `Card`, `Panel`, dialogs, dropdowns, the app shell chrome — uses a light, mostly-opaque "soft glass" treatment (a subtle backdrop blur plus a thin border, `.glass-surface`/`.glass-surface-raised` in `app/globals.css`) so the ambient background tints read faintly through panels without ever looking murky or heavy. This is a restrained echo of glass, not a dark smoked-glass cockpit aesthetic — keep blur short and fills mostly opaque on this light theme.

Boldness amplifies comprehension; it never replaces it. These constraints hold regardless of visual direction:

- Make sensitive state visible with clear labels, never by color or motion alone.
- Empty states still explain the absence, the eligibility/permission constraint if relevant, and the next valid action.
- Triage hierarchy stays scannable — a bolder shell around a dense table is welcome; sparsifying the table itself to "feel bold" is not (see Section 5).
- Avoid literal security-theater cliché: no matrix-rain effects, no stock hacker-hoodie imagery, no fake terminal-typewriter text reveals. Confident and premium is the goal, not costume.

## 2. Color palette and semantic roles

Use semantic tokens. The values below are Unpatched's actual current `app/globals.css` values — light (warm cream, green/orange accents) is the primary theme; `.dark` is an explicit opt-in class using a deep warm-charcoal variant of the same hue family.

```css
:root {
  color-scheme: light;
  --canvas: #f6f3ea; --surface: #ffffff; --surface-muted: #eef0e3; --surface-raised: #ffffff; --surface-hover: #e7ead9;
  --ink: #161c14; --ink-muted: #5b6355;
  --border: #e2ded0; --border-strong: #c9c3ae;
  --action: #3f6b3a; --action-hover: #325930; --on-action: #ffffff; --focus: #e0592a;
  --accent-2: #e0592a; --on-accent-2: #ffffff;
  --info: #2f6fb0; --success: #3f6b3a; --warning: #b5760f; --danger: #c1401f; --on-danger: #ffffff;
  --severity-critical: #c1401f; --severity-high: #b5760f; --severity-medium: #8a7a1f; --severity-low: #2f6fb0; --severity-none: #5b6355;
  --glass-border: rgba(22, 28, 20, 0.08); --glass-border-strong: rgba(31, 244, 7, 0.35);
  --glow-action: rgba(63, 107, 58, 0.22); --glow-accent-2: rgba(224, 89, 42, 0.22);
}
.dark {
  color-scheme: dark;
  --canvas: #14170f; --surface: #1b1f16; --surface-muted: #21261a; --surface-raised: #21261a; --surface-hover: #272c1f;
  --ink: #f1f0e6; --ink-muted: #a3a894;
  --border: #313626; --border-strong: #3c4230;
  --action: #7bbf6f; --action-hover: #93d187; --on-action: #0c1408; --focus: #f0895f;
  --accent-2: #f0895f; --on-accent-2: #200a02;
  --info: #7db8f0; --success: #7bbf6f; --warning: #e3b45c; --danger: #f0806b; --on-danger: #240402;
  --severity-critical: #f0806b; --severity-high: #e3b45c; --severity-medium: #7bbf6f; --severity-low: #7db8f0; --severity-none: #a3a894;
  --glass-border: rgba(241, 240, 230, 0.1); --glass-border-strong: rgba(123, 191, 111, 0.35);
  --glow-action: rgba(123, 191, 111, 0.28); --glow-accent-2: rgba(240, 137, 95, 0.24);
}
```

`--surface-hover` is a distinct third elevation step (between `--surface`/`--surface-muted` and `--surface-raised`) used for row/card hover states across dense tables and lists.

`--accent-2` is the secondary accent (warm orange in light theme, warm coral in dark theme) used for a page's secondary CTA, a secondary glow/highlight, or wherever two distinct accent hues need to read as different without introducing a third color. `--glass-border`/`--glass-border-strong` and `--glow-action`/`--glow-accent-2` back the shared soft-glass surface treatment and hover/press glow micro-interactions (Section 6) — every glow is a `color-mix`/`rgba` derived from the theme's own action/accent-2 hue, never a hardcoded hex, so both themes stay in sync automatically.

`--on-action`/`--on-danger`/`--on-accent-2` exist so `Button` and any other fill-plus-text component never hardcodes `text-white`/`text-ink` on a colored fill — each theme picks its own correct, WCAG-AA-passing foreground. Never hardcode a foreground color on a `bg-action`/`bg-danger`/`bg-accent-2` fill — always route through the matching `--on-*` token so a future palette change can't silently reintroduce a contrast failure.

Use the neutral surface plus the green action color for normal interaction, and orange (`--accent-2`) for a secondary highlight. Reserve danger and severity colors for their explicit meanings. Never use red merely to make a screen feel "security themed." Ensure text and essential controls meet WCAG AA contrast in both themes. When introducing a new token, add a one-line rationale next to it in this section — why it exists and what it must never be used for — instead of adding an undocumented value.

**External visual references.** Unpatched may draw deliberate inspiration from a named commercial product's layout, rhythm, or interaction pattern when the current task explicitly directs it or the user explicitly names it as a reference (see `AGENTS.md`'s Research sources) — [[docs/decisions/0056-public-homepage-visual-reskin-override]] is one example. This is a loosening of the prior blanket rule, not its removal: literal, verbatim reuse of another brand's exact palette, iconography, or pixel layout is still prohibited. Extract the underlying pattern and rebuild it with Unpatched's own tokens and components — the method 0056 already used — rather than copying markup or CSS because it looks "close enough."

## 3. Typography and content rules

Space Grotesk (display/heading weight) and Inter (UI/body text) are the app's default type system, loaded once at the root (`app/layout.tsx`; see [[docs/decisions/0060-security-ops-typography-system.md]]). The public homepage's `PublicHome` carries a deliberate, disclosed, page-scoped exception (Plus Jakarta Sans, per 0056) unless a later decision unifies it — check `app/page.tsx` before assuming which font a given screen uses. Use a monospace stack only for domains, URLs, CVSS vectors, identifiers, payloads, and reproduction code.

- **Operational type scale is unchanged and does not shrink or grow for boldness.** Page title: 24–32px, semibold. Section title: 16–20px, semibold. Labels: 12–14px, medium. Base text: 14–16px with 1.45–1.6 line height. Do not shrink important data below 12px. Triage/table/form density is a working-tool constraint, not a place to "look bolder" by growing type — see Section 5.
- **Hero and marketing moments may use a much larger display scale** (48–96px+) as a deliberate visual-weight device — the public homepage's hero headline is the reference example.
- Prefer sentence case. Write direct, neutral copy: "Report submitted", not "Awesome! Your report is live!"
- Keep report content verbatim and preserve code whitespace. Truncate only with an explicit control and no hidden security-relevant details.

**Copy style: write like a mature product, not marketing prose.** Short, direct sentences. Concrete nouns and verbs. No rhetorical flourishes, no filler explanations, no sentence that exists to sound clever rather than to say something. No em dashes — restructure into two sentences or use a period, colon, or comma instead. When a sentence is doing two jobs (stating a fact, then contrasting it against something else), split it: state the fact plainly, then state the contrast plainly.

- Bad: "Real report — nothing here is ranked, weighted, or gamified, unlike the leaderboard above."
- Better: "Reports reflect real security outcomes. They are not ranked or gamified."
- Best when space is limited: "Reports reflect security outcomes, not rankings."

This applies to every string a user reads: headings, body copy, empty states, errors, button labels, tooltips, and code comments that exist to justify UI copy choices should model the same discipline in what they quote.

## 4. Components and states

Build reusable components from semantic variants, not one-off color classes.

- **Buttons:** one primary action per local decision area; secondary actions are outline or quiet. Destructive actions require clear confirmation when irreversible. Press/hover states may use real motion (scale, shadow-shift) per Section 6's timing budget, always with a `focus-visible` equivalent.
- **Status and severity badges:** compact text labels plus icons where useful; every badge has a non-color text value. Separate report status from severity. A badge marking a state that just changed may use the `glow-pulse` accent (Section 6) as a bounded, finite embellishment — it decorates an already-legible text/color signal, it never carries meaning alone.
- **Tables/inboxes:** lead with the item identity and actionable state. Support keyboard navigation, sorting that is visibly indicated, empty/loading/error states, and responsive row-to-card transformation. Row hover/focus may use a lift or shadow-shift transition; this must not change row height or trigger layout reflow.
- **Loading states:** a shimmer skeleton (Section 6) is preferred over a flat gray placeholder, gated by `motion-safe:` exactly like any other motion — replaced entirely by a static skeleton under reduced motion, never a slowed shimmer.
- **Stat and number displays:** may animate on mount (count-up, reveal) **only once the real value is known.** Never animate a placeholder, a zero, or a mock number without the same visible fixture-marking `AGENTS.md`'s product-integrity rules already require for any other fabricated-looking data. An unresolved value shows its real loading state, not an animated guess.
- **Forms:** labels stay visible; helper text appears before errors; validate close to the field; preserve entered values after server errors. Explain scope and authorization requirements before submission.
- **Activity timelines:** chronological, actor-attributed, and scannable. Do not visually equate automated events with human comments.
- **Attachments:** display name, type, size, scan state, and authorization-aware download affordance. Never imply an upload or download succeeded until the server confirms it.
- **Sensitive views:** use permission-aware empty/error states. Never reveal that a private report, program, or asset exists to an unauthorized viewer.
- **Role and status badges:** an organization role renders as a neutral text badge — role is a label, not a state, so it carries no color. Member status (active/suspended/removed) and pending-invitation state use the same semantic-color-plus-text-value pattern as report status badges.
- **Consequential confirm dialogs:** any action with a real, non-trivial consequence (invite, role change, suspend, remove) is a two-step dialog — collect input first, then show a calculated impact summary (computed from the same rules the server enforces, never generic copy) before the confirm button. Never mutate instantly from a dropdown or a single click.

## 5. Layout and density

Use a 4px spacing base and a practical scale: 4, 8, 12, 16, 24, 32, 48, 64. Prefer 12-column desktop and 4-column mobile grids.

- Desktop application shell: persistent navigation, contextual page header, and one primary work area. Add a secondary details rail only when it prevents losing important context.
- Report detail: title/status/severity at the top; description and reproduction as the main reading column; metadata, watchers, and related items in the rail.
- Keep actions adjacent to the records they affect. Do not scatter critical actions across distant menus.
- Use compact density for triage/inbox work and comfortable density for reading policy or report narrative. Do not mix density styles in one view.
- **Bold visual treatment must not increase density cost.** A triage table gets richer hover/loading/reveal motion under Section 6, not bigger rows, wider gutters, or fewer visible items per screen. If a bolder version of a screen feels like it needs more room, that is a signal the treatment belongs in styling/motion, not in the layout grid.

## 6. Depth and interaction

Hierarchy comes mainly from surface, border, spacing, and type; motion is now a first-class fourth signal, used deliberately rather than decoratively. Use soft shadows for floating elements (menus, dialogs, popovers) and for the new hover-lift/press states in Section 4.

- All interactive elements have hover, focus-visible, disabled, and pending states.
- Focus rings use `--focus`, are at least 2px, and are never removed. A bolder hover treatment (glow, scale, lift) must have an equivalent `focus-visible` state — a mouse-only hover effect is an accessibility regression, not a bold one.
- Every interactive/motion micro-interaction respects `prefers-reduced-motion`. This is non-negotiable and unchanged by the bolder direction: a pattern gated by `motion-safe:` (or `usePrefersReducedMotion()` from `lib/motion.ts`) must resolve to its final, fully-visible state under reduced motion — never a slowed-down or stripped-down version of the same animation. Never rely on hover for critical information or primary controls.

**Motion vocabulary** (defined in `app/globals.css`, exposed as Tailwind `--animate-*` utilities via `@theme inline`):

| Keyframe | Role | Never used for |
|---|---|---|
| `enter-rise` | Something a user did just changed (a new row, a staged item, a loaded notification). Never on a page that merely finished loading. | Ambient/looping motion, first-paint reveals. |
| `enter-fade` | Same family as `enter-rise`, opacity-only variant. | Same as above. |
| `hero-reveal` | A staggered entrance for a hero/marketing section or a major screen's first-paint reveal (e.g. the dashboard's command row) — once per real mount. | Every re-render; a screen that has already painted once this session. |
| `glow-pulse` | A bounded, finite accent-color pulse marking a "needs attention" moment (a new-critical badge appearing, a fresh notification) — always paired with the existing non-color text signal. | Carrying meaning alone; anything that loops indefinitely. |
| `shimmer` | Loading-skeleton shimmer. | Anything that isn't a loading placeholder; never slowed under reduced motion — replaced by a static skeleton instead. |
| `signal-travel` | The public marketing page's own recurring graphic signature (a traveling pulse on a decorative line). | Anywhere outside marketing pages that use that specific device. |
| `signal-pulse-once` | A one-shot mount pulse ("I am entering the same system I just saw") — `animation-iteration-count: 1`, never loops. | A repeating/ambient effect. |
| `drift` | The one ambient, infinitely-looping motion in the app (docs/decisions/0062): a very slow (22s) transform-only drift of the app shell's body-level background gradient, applied to one fixed decorative element behind all content. | Anything foreground; any other element; a shorter/faster loop that could be consciously noticed. |

**Other cockpit-era micro-interactions kept and recolored under 0062**: hover/press glow on `Button`/`Card`/`Panel`/nav links via the `--glow-action`/`--glow-accent-2` tokens (a soft green/orange glow instead of the earlier cyan), border illumination on hover (`hover:border-glass-border-strong`), and `useCountUp` (`lib/motion.ts`) for a real, already-known stat that counts up on mount. `useCountUp` follows the same rule as the donut chart's reveal and Section 4's "stat and number displays" rule: only ever animates a resolved real value, never a placeholder, a zero, or a mock number, and short-circuits to the final value with no intermediate frames under `prefers-reduced-motion`.

**Timing budget**, applied consistently across marketing and the authenticated product per [[0057]] (no separate "operational stays snappy" tier):

- Functional micro-interactions (hover, focus, toggle, press): 150–250ms.
- Entrance/reveal for genuinely new or changed content: 200–350ms.
- Hero, first-paint, and marketing-scale reveals (may stagger multiple elements): up to ~600ms.
- A metric count-up (`useCountUp`): ~700ms, ease-out, once per mount.

**`framer-motion`** (a real dependency) is authorized beyond its current single use in `components/app-shell-client.tsx`: use it when real orchestration is needed — staggered sequences, exit animations, shared-layout transitions — that a plain CSS keyframe can't express cleanly. Plain CSS keyframes plus the `motion-safe:` variant remain the default for simple enter/exit/hover cases; reach for `framer-motion` when the sequencing itself is the point, not as a default replacement for a one-element transition.

## 7. Do and do not

Do:

- Design every state: loading, empty, permission denied, error, success, offline/stale when applicable.
- Make irreversible state changes explicit, attributable, and auditable in the UI.
- Use actual data or a clearly marked development fixture. Do not ship fabricated metrics — including inside a motion/reveal animation (Section 4).
- Preserve a clear separation between researcher and organization contexts.

Do not:

- Reproduce another company's exact UI, branded components, icons, or pixel-for-pixel layout — extract the underlying pattern and rebuild it with Unpatched's own tokens (Section 2), the same rule whether the reference is one of `AGENTS.md`'s standing open-source references or a task-directed commercial one.
- Lean on literal "cyber" costume — matrix rain, stock hacker-hoodie imagery, fake terminal-typewriter text, glitch effects — as a substitute for real visual confidence.
- Hide disabled/unauthorized reasons when a safe explanation improves understanding.
- Put authorization logic in presentation components or present controls as permission enforcement.
- Invent a new token, color, or one-off CSS value because no existing pattern matches exactly — extend an existing token/component deliberately, or flag the gap, instead of improvising past it.
- Reuse a reference implementation's markup or CSS because it looks "close enough" — extract the underlying rule, then rebuild it with Unpatched's own tokens and components.

## 8. Responsive and accessible behavior

- Support 320px to wide desktop without horizontal page scrolling. At narrow widths, collapse navigation into an accessible menu and reflow data tables into labelled cards.
- Ensure all functionality is keyboard-operable; dialogs trap focus and return it on close.
- Meet 44×44px touch targets where feasible; never make a touch target smaller than its visual affordance suggests.
- Use semantic HTML first. Associate every control with a name and every error with the relevant input. Announce asynchronous saves and failures accessibly.
- Every new hover- or motion-triggered visual state (Section 6) needs a `focus-visible` equivalent — a bold treatment that only fires on `:hover` is inaccessible by keyboard, not just less polished.

## 9. Agent implementation guide

Before creating or changing a screen, Codex must:

1. State which screen/component is being touched and the intended approach before editing. A token-only tweak can be one sentence; a new component or screen should be checked against this document first. If the work turns out more complex mid-task than assumed, treat it at the heavier tier rather than finishing under the original assumption.
2. Identify the user role, data sensitivity, permitted actions, and each UI state.
3. Check existing tokens/components before adding a new visual pattern — including the motion vocabulary and `framer-motion`'s expanded role in Section 6, before improvising a one-off animation. If a screen looks visually inconsistent with an existing pattern, diagnose which specific token or component variant is missing or misapplied before patching with an inline override or a new one-off value.
4. Use semantic tokens and accessible primitives; avoid hard-coded product colors in page components.
5. Implement the server-authorized action and truthful loading/error/success states before polishing.
6. Check desktop, narrow viewport, keyboard focus, and light/dark appearance.
7. When adjusting a shared component, change one thing at a time and re-check it against this document after each change. If a fix takes more than a couple of attempts, stop and reconsider the approach rather than continuing to guess.
8. Before calling a screen done, verify it: run lint/typecheck, render the actual states (including `prefers-reduced-motion: reduce` for anything touching the motion vocabulary), and confirm token usage. Do not report a screen complete on the basis that the code "should" work.
9. Describe any new shared component or token — including its rationale — in the relevant architecture/design documentation.

Reusable prompts for recurring requests, phrased consistently so repeated asks produce consistent token usage:

- **New screen:** "Create a Unpatched [screen] for [role]. It must show [real data/states], permit only [authorized actions], use the design tokens and component rules in `DESIGN.md`, and include loading, empty, error, and permission-denied states."
- **New shared component:** "Add a Unpatched [component] to the shared component library. Define its default, hover, focus-visible, disabled, and pending/error states as applicable, use existing tokens only, and document it in `DESIGN.md` before using it in a screen."
- **Empty/error/permission-denied state:** "Add the [state] state to [screen]. Explain the absence/error/restriction, state the eligibility or permission constraint if relevant, and offer the next valid action."
- **Visual drift fix:** "[Screen/component] looks inconsistent with `DESIGN.md`. Diagnose the specific token or variant that is wrong before changing anything, then fix the underlying pattern rather than patching the individual screen."

## Reference-informed methodology

This document's structure follows the pattern documented by VoltAgent's `awesome-claude-design` (and the `getdesign.md` convention it catalogs): one agent-readable specification — theme, color roles, typography, component behavior, layout, depth, do's and don'ts, responsive/accessible rules, and reusable agent prompts — kept separate from `AGENTS.md`, which governs engineering process rather than visual/UX rules. That structural methodology is adopted as process, not brand, and is unaffected by [[0057]]'s loosening of the visual-copying rule in Section 2 above.

The agent-execution discipline in Section 9 — stating intent before editing, diagnosing root cause before patching, changing one thing at a time, verifying before claiming completion — is adapted from the workflow methodology documented in `obra/superpowers`, a reference about how an agent should execute engineering work generally, not about visual design. Neither reference's code, prompts, or domain content is used verbatim; only the underlying structural and process principles.

## 10× Design Standard

Evaluate every significant interface for clarity (the state is immediately understandable), information density (experienced operators see more without clutter), workflow efficiency (fewer unnecessary actions), trust (permissions, ownership, state, and consequences are explicit), accessibility (keyboard, screen reader, low-vision, and reduced-motion users can operate it), responsive quality (useful from 320px to wide desktop), and consistency (it extends Unpatched rather than inventing another visual language).

## Reference Research

Approved standing references (see `AGENTS.md`) are research sources for structural/process patterns, not brand sources to copy verbatim. A task-directed commercial reference (Section 2; `AGENTS.md`'s Research sources) follows the identical discipline once a task names it:

1. Inspect existing Unpatched components and this document first.
2. Search the named reference (standing or task-directed) and read its primary source or a real screenshot, not just a summary.
3. Extract the underlying principle — record it in one sentence and name the specific Unpatched token/component/rule it maps to. Do not record a vague "inspired by X" note.
4. Adapt it to Unpatched; do not reuse another project's markup, CSS, or copy because it is "close enough."
5. If no existing token/component fits and the gap is real, create one deliberately and document it here — do not invent an undocumented one-off value to get past a single screen.
6. Update this document once a pattern becomes system-wide (the motion vocabulary in Section 6 is the current example: three keyframes added under [[0057]], intended to propagate across every screen per its phased rollout, not stay a one-page exception).

Periodically pressure-test consistency by deliberately requesting a varied case of an existing pattern (compact vs. comfortable density, light vs. dark, populated vs. empty, motion vs. `prefers-reduced-motion: reduce`) and confirming it resolves through existing tokens without drift.
