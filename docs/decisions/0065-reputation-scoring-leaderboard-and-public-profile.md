# 0065 — Reputation scoring, a real public leaderboard, and public researcher profiles

Date: 2026-09-04
Status: Accepted — formally supersedes 0016 §"Deferred, explicitly" (score/ranking/
leaderboard/public-profile clauses only), 0038, 0039, and 0049 §C's "Public profile page /
directory" and "Leaderboard" rejections, and 0043 wherever it reaffirms those same clauses.

## Why this document exists, and why it is not a silent code change

Six prior decision docs — 0016, 0038, 0039, 0042, 0043, 0049 — each independently considered and
rejected some combination of a numeric reputation score, a public leaderboard, and a public
researcher profile/directory. This is not one team missing the idea once; it is a considered
position reaffirmed across roughly ten months of the product's own history, most explicitly in
0016 ("a wrong guess baked into a scoring formula is far harder to walk back than a missing
feature") and 0049 ("a stranger being able to browse every researcher is a different privacy
posture than Unpatched has chosen"). Per AGENTS.md's authority order, a current, explicit task
requirement outranks any of these documents — but Section 9's own rule is that a change this
significant needs a real decision doc and a DOMAIN.md rewrite, not a silent reversal. This is
that document.

**The reason to reverse now**: a competitive feature-parity review against HackerOne and Bugcrowd
found that a real, public, discoverable reputation signal and researcher identity are two of the
five largest researcher-growth gaps this platform has — both competitors use them as their
primary researcher-acquisition and private-program-gating mechanisms. The prior rejections were
correct given what they were weighing at the time (an unproven formula, an unrequested privacy
posture); they were never re-litigated against an explicit researcher-growth objective, because
until now no task had put one in front of them. This document is that re-litigation, done in the
open rather than by accretion.

## What changes, precisely

1. **A real, computed reputation score** — publicly visible, but never stored as a mutable
   column and never a departure from 0016's ledger architecture (see "What does not change"
   below).
2. **A real, public leaderboard** — ranked by the score above, showing real display names (per
   explicit product decision — no pseudonymous/opt-in handle system, matching how
   `report.researcherName` is already shown to organizations today; a researcher's display name
   was never private in this product).
3. **A public researcher profile page** at a real, chosen, collision-checked public username —
   closing the exact gap 0049 §F named as its own prerequisite ("a real, chosen, editable public
   username with collision handling — not done, not started") before any public-profile
   discussion could even begin.

## What does NOT change — 0016's architecture is correct and stays exactly as built

This is the load-bearing design decision in this document: **the reversal is additive, not
destructive.** `reputation_ledger` keeps every property 0016 gave it:

- Still append-only (the `reject_reputation_ledger_mutation` trigger is untouched).
- Still FACT not INTERPRETATION — no new column is added to `reputation_ledger` itself, and no
  existing row's meaning changes.
- Still re-derived from authoritative source tables on every insert, never trusted from an event
  payload.
- `get_my_reputation_summary()` is untouched and keeps working exactly as before.

**The score is a new, separate, purely computed VIEW over the existing ledger** — never a stored
value, never a mutable column, never written by any RPC. This preserves 0016's own explicit
future-proofing statement verbatim: *"a future scoring algorithm can change its weighting of
these same facts without any migration to the underlying history."* This document is that
future — arriving exactly the way 0016 anticipated it would, as a read-side aggregation change,
not a schema rewrite.

## The formula, and why it resists the exact abuse 0016 was built to prevent

```
score = (report_resolved_count × 25) + (bounty_finalized_count × 10) − (report_rejected_count × 5)
```

`report_duplicate`, `report_informative`, and `report_not_applicable` are weighted **zero** —
this is a direct, deliberate continuation of 0016's own reasoning, not an oversight: 0016's
research explicitly states these "are often submission-order accidents, not quality problems"
and that neither HackerOne's nor Bugcrowd's own signal models penalize them. Encoding them as
positive would reward volume; encoding them as negative would penalize researchers for
organization-side categorization decisions outside their control. Zero is the only weighting
consistent with 0016's own six-question filter table.

`report_rejected` gets a small negative weight — the one outcome that is a real,
organization-confirmed signal of a low-quality or bad-faith submission. This is the one place
this document diverges from 0016's neutral-valence stance for `rejected`, and it is a deliberate,
narrow one: 0016 rejected assigning valence before the platform had any experience with real
researcher/organization behavior. That experience gap is exactly what "reversal only after
proving the growth case" means here — a small penalty, not a large one, so a single contested
rejection cannot dominate a researcher's score, while sustained bad-faith submission volume does
show up over time.

**Why this resists gaming exactly the way 0016's own six-question filter demands:**
- Every input to the formula is an organization-confirmed terminal outcome — a researcher cannot
  self-report their way to a higher score, identical to every existing reputation fact.
- The score has no stored representation to tamper with — it is computed fresh from
  `reputation_ledger` on every read, so there is no mutable value a bug, a compromised session,
  or a malicious insert could corrupt independently of the ledger itself.
- Raw submission volume is not a factor at all — only terminal, organization-confirmed outcomes
  count, so mass-submitting low-effort reports cannot inflate a score (and mass-submitting
  low-effort reports that get rejected actively lowers it).

## New database objects (see migration `202609040001_reputation_scoring_and_public_profile.sql`)

- `public.get_researcher_reputation_score(p_researcher_id uuid) returns bigint` — a `stable
  security definer` function computing the formula above directly from `reputation_ledger`
  aggregates. Takes an explicit researcher id (unlike `get_my_reputation_summary`'s
  self-only, no-parameter shape) because a leaderboard and a public profile both need to compute
  *other* researchers' scores — this is the one deliberate, explicit widening of
  `reputation_ledger`'s read surface this document makes, and it exposes only the aggregate
  number, never a raw ledger row, never organization/program identity, never severity detail.
  Public-callable (`grant execute ... to authenticated, anon` — a public leaderboard must be
  readable by a signed-out visitor too, matching HackerOne's/Bugcrowd's own public leaderboard
  pages).
- `public.get_public_leaderboard(p_limit integer default 50) returns table (researcher_id uuid,
  display_name text, public_username text, score bigint, resolved_count bigint,
  bounty_finalized_count bigint)` — joins `reputation_ledger` aggregates to `public.users` for
  display name/username, ordered by score descending, ties broken by `resolved_count` descending
  then `researcher_id` (a stable, deterministic tiebreak — never an arbitrary row order). Only
  includes researchers with at least one ledger fact — a researcher with zero history does not
  appear on the leaderboard at all, rather than appearing at score 0 alongside people who have
  never submitted anything real.
- `public.get_my_leaderboard_position() returns table (rank bigint, score bigint,
  total_researchers bigint)` — self-only, computed via a window function over the same view the
  public leaderboard uses, so a researcher's own rank can never disagree with where they'd
  actually appear on the public page.
- `public.users.public_username` (new nullable, unique, citext column) — the real, chosen,
  collision-checked public identifier 0049 §F named as a prerequisite. Nullable because choosing
  one is an explicit researcher action, not automatic — a researcher without one set has no
  public profile URL and does not appear as a link from the leaderboard (their row still shows,
  using display name only, exactly like a report's `researcherName` today). `set_my_public_username`
  RPC validates format (lowercase alphanumeric + hyphen, 3-30 chars, matching this codebase's
  existing slug conventions) and uniqueness (citext handles case-insensitive collision
  detection), and is idempotent-safe to call again to change it (no cooldown is implemented in
  this slice — a future abuse-pattern finding could add one, not invented speculatively here).
- `public.get_public_researcher_profile(p_username citext) returns ...` — the public profile
  read. Composes exactly three existing, already-public-read pieces of data plus the new score:
  display name, biography (`researcher_profiles.biography` — already public-read per 0051),
  professional details' `hacking_interests`/`security_focus` (already public-read per 0051 — a
  researcher's stated focus areas, not new exposure), and the new reputation score/resolved
  count. **Explicitly excludes**: personal details (gender/age — self-only per 0051, unchanged),
  KYC status, payout details, external platform handles (kept private-by-default per this
  document's own judgment call below), and location/language/employment-status-style fields —
  0042's and 0049's rejection of social-profile filler is preserved; this reversal is scoped
  narrowly to reputation/score/leaderboard/identity, not a wholesale reopening of every field
  0049 rejected.

## One field this document does NOT restore: external platform handles

0049 rejected Bugcrowd/GitHub/etc. handles as "unverifiable self-reported claims... exactly the
'fake reputation adjacent' pattern 0016/0039 already rejected once." That reasoning is
independent of the leaderboard/profile question this document reverses — an unverified claim is
exactly as unverifiable on a public profile as it was on a private one. `external_handles` stays
excluded from the public profile read. This is a deliberate, narrow line: this document reopens
"should a researcher's real, verified reputation be public," not "should a researcher's
unverifiable claims be public."

## Public profile route

`app/researchers/[username]/page.tsx` (new) — a genuinely public, unauthenticated route (no
`getCurrentUser()`/redirect gate, matching `app/disclosures/page.tsx`'s existing precedent for a
public, unauthenticated data surface). A username with no matching researcher, or one who has
never set a `public_username`, renders the same honest "not found" state — never distinguishing
"doesn't exist" from "exists but has no public profile," which would leak the latter fact.

## `/researchers` page changes

`app/researchers/page.tsx`'s existing mock leaderboard (`MOCK_LEADERBOARD`,
`MOCK_MY_LEADERBOARD_POSITION`, `LeaderboardPodium`/`YourPositionPanel`/`LeaderboardTable`) is
replaced with the real data above — this also resolves the self-contradiction this session's own
codebase audit found (the page's own copy said "unlike the leaderboard above" and "Unpatched
does not compute a score or ranking" directly beneath a mock leaderboard that already looked and
behaved like one). The copy is rewritten to match reality: reputation is still described as
"organization-confirmed outcomes," and the score/leaderboard are now real, disclosed as
transparently computed from that same history (the formula above is shown in-product, not hidden
— transparency is part of what makes it gaming-resistant, per this document's own "resists
gaming" section).

## `/researchers/community` page

Unchanged. It already deliberately shows only `get_my_reputation_summary` counts with no
score/ranking — that restraint was correct before this document and remains a legitimate, more
conservative surface after it (a researcher can still view their own history without a score
framing if that page is never updated to add one). Not required to change by this document.

## DOMAIN.md

The "Reputation and financial integrity" section is rewritten (see the diff to that file in this
same change) to state plainly that a real score and public leaderboard now exist, computed
read-side from the unchanged ledger, and to remove the sentence "No score, ranking, badge, or
leaderboard exists" — replaced with a description of the formula and its provenance-based
gaming resistance, cross-referencing this document.

## What is still deferred, unchanged from 0016/0049

Badges, XP, a points marketplace, a social graph, endorsements/reviews, AI-driven scoring, a
complete anti-Sybil system beyond "every input requires organization confirmation," time decay,
avatar upload, and a full researcher-discovery/matching marketplace for organizations remain out
of scope — this document reverses exactly three things (score, leaderboard, public profile), not
every deferred item on 0016's or 0049's lists.
