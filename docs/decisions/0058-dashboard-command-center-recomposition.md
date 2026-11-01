# 0058 — Dashboard command-center recomposition (post-hoc)

Related: [[0043-researcher-visual-identity-pass]], [[0045-researcher-showcase-and-charts]].

## Why this doc exists

`app/page.tsx`'s authenticated `HomePage` has carried a comment citing
"docs/decisions/0057" as its rationale since before this numbering slot was
ever written. `0057` is now the governing doc for the app-wide bold-reskin
initiative ([[0057-bold-reskin-and-design-doc-rewrite]]), an unrelated,
later decision — so that citation was dangling from the start. This doc
records, post-hoc, what the cited code already does today, and the
in-code comment is corrected to point here instead.

## What the code actually does

`HomePage` (the signed-in researcher home) recomposes the dashboard into
four purposeful zones instead of a long stack of equal-weight card
sections, in this order:

1. **`CommandRow`** — the one dominant, asymmetric moment: a large primary-
   action panel (whatever most needs the signed-in user's attention right
   now — a report awaiting response, a pending invitation, or "find your
   next target") beside a dense stat rail. Never a tile grid of equally-
   weighted numbers.
2. **`OperationalGrid`** — active/featured programs and challenge spotlight,
   merged into one dense bordered surface rather than three separate
   full-width cards.
3. **`StandingSplit`** — reputation standing and a leaderboard context,
   stepping down in urgency/weight from the two zones above it.
4. **`ReferenceStrip`** — milestones, referral link, and activity history;
   the lowest-urgency zone, last.

Each zone is its own dense bordered surface (consistent with `DESIGN.md`'s
existing "Tables/inboxes" and "Layout and density" rules), not N
independent card components — the recomposition is about information
architecture and visual weight ordering, not a new component primitive.

## Verification

No behavior changed by writing this doc — it documents existing, already-
shipped code. `app/page.tsx`'s dangling `docs/decisions/0057` comment is
updated to cite `0058` in the same pass that authored this file.
