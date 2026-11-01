# 0056 — Public homepage visual reskin, an explicit override of DESIGN.md and 0031-0036

Related: [[0030-public-entry-and-two-sided-authentication]], [[0031-public-front-door-visual-thesis]],
[[0032-public-front-door-visual-execution]], [[0033-motion-first-front-door]],
[[0034-public-front-door-product-stage]], [[0035-unpatched-visual-identity-system]],
[[0036-live-security-environment]].

## The request and the deliberate reversal

On explicit, repeated user instruction ("redesigned whole app using ss inspired by the
screenshot, all don't change content only the design, layout, font"), `app/page.tsx`'s
`PublicHome` — the anonymous-visitor homepage — was rebuilt to match the layout rhythm of
a reference marketing-page screenshot (Jasper's public homepage): a sticky pill-shaped
nav, a centered light hero with a rounded eyebrow pill and rounded CTA buttons, a logo/
proof-strip-shaped band, a tri-card bento feature grid, stat tiles, alternating tinted
benefit sections, and a closing FAQ accordion before a dark final CTA band.

This is a **direct, explicit override**, not an accidental drift: `DESIGN.md` states
"Do not copy another company's branded components, copy, icons, palette, or layout" and
"Unpatched deliberately does not adopt any cataloged company's brand system, palette."
`AGENTS.md`'s authority order puts the current task's requirements above `DESIGN.md`
itself, and per its own conflict-handling rule ("stop implementation, identify the
conflict and its impact, and request or document a resolution — do not silently choose a
behavior"), the conflict was surfaced to the user directly before any code changed; the
user chose to override the rule for this one page. Same posture as [[0055]]'s reopening of
skills/interests fields: a deliberate, disclosed reversal, not a silent one.

## What changed, and what deliberately did not

**Scope: `app/page.tsx`'s `PublicHome` function only.** No other file changed. The
authenticated dashboard (`HomePage`), `AppShell`, every shared token in
`app/globals.css`, and every shared component's own default styling are untouched —
`FeatureCard`, `Eyebrow`, `StatTile`, and `FaqItem` are new, page-local components defined
in `app/page.tsx` itself, not registered anywhere shared.

**Palette: rebuilt from Unpatched's own semantic tokens, never Jasper's literal colors.**
`PUBLIC_HOME_THEME_VARS` is a plain object of CSS custom properties (`--canvas`,
`--surface`, `--action`, `--info`, `--warning`, ...) applied via inline `style` on
`PublicHome`'s own root `<div>` — the same override mechanism `app/globals.css` already
uses for `:root`/`.dark`/`.light`, just scoped one element lower so it can never leak into
the authenticated product. Every existing shared primitive this page reuses (`Badge`,
`SectionLabel`, `MetadataPair`, `LiveWorkflowArtifact`, `RealProductFragment`,
`LifecycleStepper`, `WorkflowDiagram`, `ProgramDiscoveryPreview`) already reads these same
token names, so they re-skinned for free with zero prop or markup changes to those files.
The warm cream canvas, forest-green action color, and orange focus/CTA accent are original
values chosen to evoke the reference's warmth without copying its literal hex values.

**Typography: `Plus_Jakarta_Sans` (Google Fonts, via `next/font/google`), scoped to this
file's own generated className exactly as `Fraunces` was before it.** Fraunces and the
`boldSansHeadingClass` bold-system-sans register from 0034 are both gone from this page;
`GhostNumber` and `SignalLine` (0035's "one recurring graphic signature") are no longer
rendered on the homepage. `SignalLine` is untouched as a component/file — still available,
just unused here — since removing the file itself was out of scope for a layout-only ask.

**Content: byte-for-byte unchanged.** Every heading, paragraph, CTA label, FAQ answer
(the FAQ questions are new headings around content that already existed as
`ProgramDiscoveryPreview`'s disclosure plus real facts drawn from `PHILOSOPHY_STAGES`/
`SIGNAL_PATH`/the lifecycle stage lists — nothing invented), and stage list is identical to
before. `ProgramDiscoveryPreview`'s exact copy is still rendered verbatim, just re-homed
next to the new FAQ section instead of its own muted strip. No fabricated metric was
added: the new `StatTile` band states real structural facts about the workflow itself
("7 stages", "1 record" [immutability], "0 silent changes" [attributed transitions]),
never an invented usage/customer number — this holds the line DESIGN.md's Section 7 and
`AGENTS.md`'s "never fabricate metrics" rule draw regardless of the visual-system override
above; those rules were not part of what the user asked to override.

## Verification

`npm run typecheck`, `npm run lint`, and `npm test` (1096/1096 tests, 68 files unchanged)
all pass — `tests/unit/marketing-ui.test.tsx` only exercises the reused child components
directly and asserts none of the removed/renamed page-local constants, so it needed no
changes. Rendered live in Chromium via a temporary Playwright script (removed after use)
at 1440px and 390px: no horizontal overflow at either width, the sticky pill nav collapses
its middle links and "Sign in" text below `md`/`sm` while keeping "Get started" visible,
the bento cards and two-tone researcher/organization panels stack to one column on mobile,
and the FAQ `<details>` accordion opens/closes without JS. Per standing instruction,
`npm run build` was not run for this iteration.

## What this does not settle

This override applies to the public homepage only. It does not reopen DESIGN.md's
anti-copying rule for any other screen, and does not retroactively bless recreating any
other reference product's UI elsewhere in Unpatched without the same explicit,
documented conflict-and-override step this slice went through.
