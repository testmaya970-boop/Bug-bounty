# 0032 — Public front door: visual execution

Related: [[0031-public-front-door-visual-thesis]], [[0030-public-entry-and-two-sided-authentication]].

## Context

0031 researched and proposed a visual direction for the public homepage and was
approved as the foundation, with one explicit condition: implement it so the result is
recognizably Unpatched, not a well-executed generic SaaS template with a wordmark swapped
in. This decision records what was actually built and why, since 0031 itself is a
proposal document, not a record of the shipped page.

## What changed

`app/page.tsx`'s anonymous branch (`PublicHome`) was rewritten. The authenticated branch
(`HomePage`'s post-`getCurrentUser()` logic) is untouched.

Four new presentation components were added under `components/marketing/`:

- `hero-artifact.tsx` — the hero's right-hand visual object: a bordered panel built from
  the product's own `MetadataPair`/`SeverityBadge`/`StatusBadge`/`ScopeStateBadge`/
  `ProgramStatusBadge` components, showing one illustrative program/report/triage/scope
  record. No device frame, no browser chrome, no laptop mockup — the artifact itself is
  the object.
- `security-lifecycle.tsx` — the dense "How it works" section: five numbered stages
  (Program → Scope → Report → Triage → Resolution), each rendering a real badge
  component rather than an icon.
- `workflow-diagram.tsx` — a reusable numbered vertical sequence, used by the philosophy
  section and by both the researcher and organization sections.
- `program-discovery-preview.tsx` — a permanently dashed, opacity-reduced, dash-only
  placeholder (never a loading skeleton) standing in for the marketplace listing
  Unpatched does not yet have.

One typeface was added: Fraunces (via `next/font/google`), scoped to homepage headline
elements only through its generated `className`. `app/globals.css` was not touched — the
authenticated product's typography is unchanged.

## Why this shape

The 0031 research concluded the page's genericness traced to two concrete, fixable
causes, not to the existing color system:

1. **No distinctive typeface.** `app/globals.css`'s `body` rule resolved to
   `ui-sans-serif, system-ui, ...` only — the literal, verifiable root cause of "default
   Tailwind" typography. One serif display face, used only where headlines need visual
   weight, fixes this without touching the authenticated product's type system.
2. **Uniform information density.** Every section used the same padding and rhythm. The
   research's strongest finding was that HackerOne/Bugcrowd/Intigriti-style sites read as
   generic in part because of this uniformity — not because their colors are wrong.
   `PublicHome` alternates spacious (hero, philosophy, final CTA) and dense
   (`security-lifecycle`, the researcher/organization stage lists) sections deliberately.

No new color token was introduced. The existing warm-toned palette
(`--canvas:#faf8f3`, `--action:#0b6f69`, severity colors) was judged sufficient once
paired with real contrast from ink/surface/border and non-uniform density.

## Real data boundary

Every artifact on the page is illustrative and labelled as such at least once, visibly,
in real page text — not only in a code comment:

- `HeroArtifact` and `SecurityLifecycle` both render "Illustrative example" (the latter:
  "Illustrative example -- not a live program").
- `ProgramDiscoveryPreview` renders no digits, names, or counts of any kind — only
  em-dash placeholders — and the page copy above it says plainly: "Public program
  discovery is coming... Today, an organization invites a researcher directly."
- No researcher count, bounty total, response time, "X vulnerabilities found," company
  logo, testimonial, or G2-style badge appears anywhere on the page. None of that data
  has a real, anonymous-safe backend source, and none was fabricated to fill the page.

## What was deliberately not built

Scroll-triggered reveal animation was considered and deliberately not implemented this
pass. The 0031 research allowed for restrained motion (150–200ms section reveals), but
building it correctly — without a flash-of-unstyled-content on slow connections, without
breaking under `prefers-reduced-motion`, without a library dependency — was judged a
higher-risk, lower-value addition than the time budget justified for this slice. The
delivered motion posture is: hover/focus-visible state transitions only, and a fully
static, fully visible page under `prefers-reduced-motion: reduce` (verified live).

## Authorization boundary

No RLS policy, RPC, database migration, report lifecycle, program lifecycle, payment
path, notification path, platform-operations surface, or authentication authorization
logic was touched in this slice. `app/page.tsx`'s authenticated branch — which does carry
real authorization-sensitive logic (org/program/report queries) — is byte-for-byte
unchanged from before this slice.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test` (990/990) all pass.
- `npm run build` succeeds; `/` remains a dynamic (`ƒ`) route at 271 B page size.
- Live Playwright verification against the dev server (25/26 automated checks passed;
  the one flagged item was a false positive — Next.js's internal RSC script payload
  containing `$Sreact.fragment`, not rendered page content) confirmed: no console or
  hydration errors, correct heading structure, all real CTA links present and no dead
  `/programs` link, all in-page anchors resolve, keyboard navigation reaches the primary
  CTA, zero horizontal overflow at 1440/1280/1024/768/390/320px, and full content
  visibility under `prefers-reduced-motion: reduce`.
- Screenshots at all six breakpoints were visually reviewed.
