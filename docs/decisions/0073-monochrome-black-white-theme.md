# 0073 — Monochrome black-on-white theme, single theme (no dark mode)

## Status

Accepted. Direct instruction: "change the colour design to black and white, black
letters and background in white." Explicitly scoped as a **chrome/UI theme change only**
— status/severity/data-visualization colors (danger, success, warning, info,
severity-critical/high/medium/low/none, and every chart in `components/charts/*`) are
**unchanged**, per explicit direction ("this is theme change not data visualization
change, graphs/charts remain same"). Also explicitly: no separate dark theme — one theme,
black on white, everywhere.

## What changes

Every chrome/structural token in `app/globals.css`'s `:root` block:

| Token | Before (0062, warm cream/green) | After (monochrome) |
|---|---|---|
| `--canvas` | `#f6f3ea` (warm cream) | `#ffffff` (pure white) |
| `--surface` | `#ffffff` | `#ffffff` |
| `--surface-muted` | `#eef0e3` | `#f2f2f2` |
| `--surface-raised` | `#ffffff` | `#ffffff` |
| `--surface-hover` | `#e7ead9` | `#e8e8e8` |
| `--ink` | `#161c14` (near-black green tint) | `#000000` (pure black) |
| `--ink-muted` | `#5b6355` | `#525252` (neutral gray) |
| `--border` | `#e2ded0` | `#dcdcdc` |
| `--border-strong` | `#c9c3ae` | `#a3a3a3` |
| `--action` | `#3f6b3a` (green) | `#000000` (black) |
| `--action-hover` | `#325930` | `#262626` (dark gray, hover gives some feedback without introducing color) |
| `--on-action` | `#ffffff` | `#ffffff` |
| `--accent-2` | `#e0592a` (orange) | `#404040` (a second neutral shade, distinguishable from `--action`'s pure black by lightness only, never hue) |
| `--on-accent-2` | `#ffffff` | `#ffffff` |
| `--focus` | `#e0592a` | `#000000` (focus rings are already 2px+ and offset per DESIGN.md; black on white is higher-contrast than the prior orange, not lower) |
| `--glass-border` | `rgba(22,28,20,0.08)` | `rgba(0,0,0,0.08)` |
| `--glass-border-strong` | `rgba(63,107,58,0.35)` | `rgba(0,0,0,0.35)` |
| `--glow-action` | `rgba(63,107,58,0.22)` | `rgba(0,0,0,0.14)` (a shadow-like neutral glow, not a colored one — see below) |
| `--glow-accent-2` | `rgba(224,89,42,0.22)` | `rgba(0,0,0,0.1)` |

`.dark` and its `@media (prefers-color-scheme: dark)` fallback block are **removed
entirely** — one theme only, per explicit instruction. `components/theme-provider.tsx`
and `app/layout.tsx`'s theme-init script are left in place structurally (removing the
whole light/dark toggle mechanism is a larger, separate change than a color swap) but
now always resolve to the same single palette regardless of stored preference or OS
setting, since `.dark` no longer defines a different set of values — toggling the class
has no visible effect. A follow-up could remove the toggle UI itself if the product wants
that; this document only removes the *second palette*, not the toggle mechanism, since
`useTheme()`/`setTheme()` may still be read elsewhere and a mechanical removal risks
breaking an unrelated call site.

Body background: the two warm-tinted radial gradients (`color-mix(... var(--action) 7%
...)`, `... var(--accent-2) 6% ...)`) are removed — a pure white background has no ambient
tint. `background-image` on `body` is dropped to `none` (or the property removed
entirely); `.dot-grid`'s dark-panel texture is unaffected (it already derives from
`currentColor`, so it automatically becomes black-on-white wherever `bg-ink`/`text-canvas`
panels use it).

## What does NOT change

- Every token in `components/ui/badge.tsx`'s `TONE` map (`info`, `warning`, `success`,
  `danger`, `severityCritical/High/Medium/Low/None`) — untouched, still reads `--info`,
  `--danger`, etc., which keep their existing semantic color values.
- Every chart in `components/charts/*` — untouched, they already draw from the same
  `Tone` map, so they keep their existing colors automatically without any direct edit.
- `PublicHome`'s own font (`Plus_Jakarta_Sans`) and layout — untouched, this is a color
  token change only.
- The glass-surface mechanics (`backdrop-filter`, `color-mix` opacity blending) —
  untouched structurally, only the colors flowing through them change.

## Why `--glow-action`/`--glow-accent-2` become neutral instead of removed

Several components (`CommandRow`, `PrimaryActionPanel`, `your-position-panel.tsx`, nav
active-state) use `var(--glow-action)` for a soft ambient glow/shadow effect around dark
panels and hover states. Removing the tokens outright would require editing every call
site; keeping them as neutral, low-opacity black values instead preserves the existing
depth/hover-feedback effect as a soft shadow rather than a colored glow — visually
appropriate for a monochrome theme (a black shadow reads as depth, not as an accent
color) and requires zero changes to any component beyond the token file itself.

## Verification

`npm run typecheck`, `npm run lint`, `npm test`, and a clean `npm run build` all still
pass after this change (color values are pure data, no type/behavior surface is touched).
Manual check: every existing component that reads `--danger`/`--success`/`--warning`/
`--info`/`--severity-*` (badges, alerts, charts) renders with unchanged colors; every
component reading `--action`/`--ink`/`--canvas`/etc. renders black-on-white.
