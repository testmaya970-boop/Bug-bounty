# 0071 — Achievement badges (closer HackerOne/Bugcrowd parity, deliberate volume exception)

## Status

Accepted. Closes the last of the five researcher-growth gaps from the feature-parity
review. 0065 explicitly listed badges as still out of scope when it reversed the
score/leaderboard/profile decision — this document is that follow-up, made on explicit
direction to mirror HackerOne's (achievement badges, star tiers) and Bugcrowd's (P1
Warrior, Bounty Bee, Submission Shogun, Collaboration Crusader) badge systems more
literally than the score formula did.

## The volume-vs-quality tension, named explicitly

0016 built the reputation ledger to reward organization-confirmed *outcomes*, never raw
*activity* — its own six-question filter explicitly rejected recording bare submission
count as a reputation signal ("recording bare submission would reward volume over
quality, the opposite of a trust signal"). Bugcrowd's own "Submission Shogun" badge is
volume-based (cumulative valid submissions), and this document's explicit instruction is
to mirror that more closely rather than stay purely outcome-gated. **This is a deliberate,
scoped exception, not a reopening of 0016's reasoning**: exactly one badge family below
(Prolific Researcher) is volume-based, reads from `reports` directly rather than
`reputation_ledger`, and is explicitly namespaced as a badge, never folded into the score
formula (0065) or the ledger itself. The score stays outcome-only, unchanged. Badges are a
separate, additive display layer, the same relationship 0065 already established between
score and ledger.

## Badge families

| Badge | Tiers (Bronze / Silver / Gold / Platinum) | Source |
|---|---|---|
| **Prolific Researcher** (volume, the deliberate exception) | 1 / 10 / 50 / 200 total submitted reports | `count(*)` on `reports` where `researcher_id = target` — every report, any status |
| **Resolver** (outcome) | 1 / 5 / 25 / 100 `report_resolved` facts | `reputation_ledger` count by `fact_type` |
| **Critical Finder** (outcome, severity-weighted) | 1 / 5 / 15 / 50 `report_resolved` facts where `confirmed_severity = 'critical'` | `reputation_ledger` joined to `reports.confirmed_severity` |
| **Bounty Earner** (outcome) | 1 / 5 / 20 / 75 `bounty_finalized` facts | `reputation_ledger` count by `fact_type` |
| **Program Breadth** (outcome, breadth) | 2 / 5 / 10 / 25 distinct programs with at least one `report_resolved` fact | `reputation_ledger` distinct `program_id` count, filtered to `report_resolved` |

Four tiers each (Bronze/Silver/Gold/Platinum), matching HackerOne's/Bugcrowd's own
multi-level badge convention rather than a single unlock/no-unlock state. A researcher's
*current* tier per family is the highest threshold met; lower tiers are not separately
displayed once a higher one is reached (matching how Bugcrowd's own badge levels replace
rather than stack).

## What is explicitly NOT a badge family

No "Collaboration Crusader" equivalent — team collaboration does not exist in this
product yet (0064, scoped not built); a badge for a capability that cannot be earned
would be exactly the "fabricated feature" pattern AGENTS.md forbids. Will be added if/when
0064 ships.

## Database design

A single, purely computed RPC, following the same pattern 0065 already established for
the score (`get_researcher_reputation_score`) — no new table, no stored/mutable badge
state, no "badge unlocked" event to insert or track. A badge tier is a deterministic
function of already-true facts (report count, ledger fact counts, distinct program
count) — recomputing it fresh on every read means there is nothing to keep in sync,
nothing a migration could desync from the underlying data, and no risk of a stale
"you earned this badge" row surviving a correction to the underlying report/ledger data.

`public.get_researcher_badges(p_researcher_id uuid) returns table (badge_key text, tier
text, current_value bigint, next_threshold bigint)` — one row per badge family the
researcher has reached at least Bronze in (a family with zero progress is simply absent
from the result, not present at a "tier: none" row — matching the leaderboard's own "no
row for zero facts" convention from 0065). `next_threshold` is null at Platinum (no higher
tier to progress toward) — surfaced so a profile page can show "12 more resolved reports
to Gold" rather than just the current tier in isolation.

Public-callable (`authenticated, anon`), matching `get_researcher_reputation_score`'s own
grants — badges appear on the public profile page, which a signed-out visitor can view.

## UI surface

- **Public profile** (`app/researchers/[username]/page.tsx`): a new "Badges" section
  between the stat grid and the biography, rendering each earned badge's icon, tier, and
  a one-line "N more to reach the next tier" progress note when applicable.
- **Own profile settings**: no change needed — badges are derived, not something a
  researcher configures; they simply appear once earned.
- **Leaderboard**: not added to the dense table/podium in this pass — badges are a
  profile-page concept here, matching how Bugcrowd's own badge display lives on the
  profile page and only badge-*specific* leaderboards (a separate page this document does
  not build) show them in ranked-list form.

## What does not change

`reputation_ledger`, its append-only trigger, `get_researcher_reputation_score`,
`get_public_leaderboard`, and `get_my_leaderboard_position` are all untouched. The score
formula gains no new terms. No new fact_type is added to the ledger's closed six-value
set.
