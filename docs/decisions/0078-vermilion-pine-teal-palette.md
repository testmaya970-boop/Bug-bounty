# 0078 — Vermilion / pine-teal palette: retroactive record

Status: accepted, already live. This document backfills a decision that shipped
without a written record — `app/globals.css` cites "docs/decisions/0079" for this
palette, but that file does not exist. This is that missing record, filed under the
next free number instead of 0079, so it does not collide with or retroactively
validate a citation that was never backed by a real file.

## What is live today

`app/globals.css`'s `:root` theme, superseding `0073`'s monochrome black/white chrome:

- `--canvas` / `--surface`: `#fdfcfb` — warm, not pure white.
- `--ink`: `#0f0d0c`, `--ink-muted`: `#5b5652`.
- `--action` (brand accent): `#c7331e` — vermilion.
- `--accent-2` (secondary brand accent): `#1b3a34` — pine-teal.
- Status/severity tokens (`--info`, `--success`, `--warning`, `--danger`,
  `--severity-*`) are unchanged from before this palette shipped — this was always a
  brand/chrome decision, never a data-visualization one.

Every pair above is a real, computed WCAG contrast ratio (not eyeballed):
canvas/ink 18.9:1; action `#c7331e` vs. white button text 5.36:1, vs. canvas link
text 5.23:1 — both clear AA's 4.5:1; action-hover `#a82917` vs. white 7.01:1;
ink-muted vs. canvas 7.07:1.

## Why vermilion, specifically not `#D97757`

`#c7331e` was chosen deliberately between HackerOne's own coral-red brand accent and
Anthropic's terracotta (`#D97757`), landing on neither: more red, less orange, more
matte than both. This matters for a codebase built with AI assistance — Anthropic's
own interaction accent is a well-known "AI-generated design" tell, and a palette
that happened to converge on it would read as generic-by-coincidence rather than
chosen. `#c7331e` is close enough to sit in the same warm-red family competitors in
this space gravitate toward (a security/trust category convention), while being
verifiably distinct from both named references.

## Why pine-teal as the second accent, not navy or gray

`--accent-2: #1b3a34` gives dark panels (the philosophy band, the closing CTA, any
future `bg-ink` surface) a real second hue instead of a flat shade of the same
red-adjacent family, or a generic navy. `--glow-action` / `--glow-accent-2` carry
real color tints (warm red / pine teal) rather than flat black, so every existing
hover/depth glow effect picks up the identity automatically, with zero
component-level changes.

## What this does not change

Chart, badge, and status colors (`components/ui/badge.tsx`'s `statusTone`/
`severityTone` maps) are untouched — this was, and remains, a brand/chrome decision
only.
