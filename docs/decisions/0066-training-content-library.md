# 0066 — Training content library

Date: 2026-09-04
Status: Accepted

## Context

The HackerOne/Bugcrowd feature-parity review found both competitors treat free training content
(Hacker101, Bugcrowd University) as top-of-funnel researcher-acquisition infrastructure, and
found this platform has none — the existing `/ctf` section (`lib/mock/ctf.ts`,
`app/ctf/page.tsx`) is a practice-challenge arena with flags and points, but no actual lesson
content behind it. This is genuinely new ground: no prior decision doc rejects or discusses a
training-content feature, unlike reputation/leaderboard/profile (0065's territory).

## Decision

Add a training content library at `/learn` — free, no gate beyond the existing sign-in wall every
other authenticated route uses (matching this codebase's own pattern; not opening it fully
public, since the `/ctf` section it complements is also sign-in-gated). Content is real,
authored, static articles — not mock/fixture data standing in for a future query, because there
is no future "real query" this content is meant to simulate: training articles are content the
product team writes once and serves, structurally identical to how a blog or documentation site
works, not a placeholder for a database-backed feature. This is why it is designed as static
content in the repository rather than a database table: nothing about a training article's
shape (title, body, category, estimated read time) needs a database row's mutability, versioning,
or per-user state — it is edited by whoever maintains it and redeployed, exactly like DESIGN.md
or AGENTS.md themselves.

## Structure

- `lib/training/content.ts` — a typed array of `TrainingArticle` (id, slug, category, title,
  summary, estimatedMinutes, body as markdown-ish structured sections, publishedAt), grouped into
  the same category taxonomy `/ctf` already uses (`web`, `crypto`, `reverse-engineering`,
  `binary-pwn`, `forensics`, `network`) — reusing `CtfCategoryId` from `lib/mock/ctf.ts` rather
  than inventing a second, parallel category enum, so a single category filter works across both
  `/learn` and `/ctf` and a future cross-link ("read the lesson, then try the matching challenge")
  needs no data-shape reconciliation.
- `app/learn/page.tsx` — the library index: category filter, search, article cards (title,
  summary, estimated read time, category badge reusing `CtfCategoryBadge`).
- `app/learn/[slug]/page.tsx` — one article's reading view: title, metadata rail (category,
  estimated read time, published date), body rendered from structured sections (heading/
  paragraph/code-block/callout — a small fixed set of section kinds, not raw HTML, so content
  authors cannot introduce an XSS surface by writing an article).
- Nav: `/learn` becomes a new `MAIN_NAV` entry in `components/app-shell-client.tsx`, positioned
  beside `CTF` as the other non-competitive researcher-growth destination (not beside
  Programs/Reports, which are work-tracking) — matching the exact placement reasoning that
  entry's own comment already used for `CTF`.

## Content scope for this slice

A real, non-trivial starter set — not a single placeholder article — covering the same six
categories `/ctf` already has, at least one article per category, written as genuine security
research guidance (not filler text), so the section is credible on first launch rather than an
empty shell with a promise of future content. Content authorship itself (accurate, well-written
security lessons) is the actual deliverable here; this document scopes the mechanism, not a
claim about how many articles ship in the first version beyond "more than one per category."

## What this does not do

- No user progress tracking, no completion badges, no certificates — matching this document's
  own reasoning above (this is content, not a gamified system) and not overlapping with 0065's
  reputation/score territory, which stays reserved for organization-confirmed report outcomes
  only. A future decision could link `/learn` completion into `/ctf`'s existing `useCtfProgress()`
  localStorage-based tracking (both already client-side, ungated by a real backend) — not built
  here, since it is not required to close the "no training content exists" gap by itself.
- No CMS/admin authoring UI — articles are edited by whoever has repository access, the same way
  every other static content in this codebase is maintained. If content authorship volume ever
  justifies a real CMS, that is its own, separately-reviewable decision.
