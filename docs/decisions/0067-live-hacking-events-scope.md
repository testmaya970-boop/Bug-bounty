# 0067 — Live hacking events (scoping only, not built)

## Status

Scoped, not implemented. Closes the "no equivalent to HackerOne's Live Hacking Events or
Bugcrowd's LevelUp" gap from the feature-parity review. Deliberately not built in this
pass: unlike badges/CVSS/templates, a live event is primarily a business and operations
investment (venue or virtual-platform costs, program-owner and researcher recruitment,
legal rules-of-engagement per event) — the product surface underneath it is comparatively
small, and building that surface before there is a real event to run it for would be
exactly the kind of premature feature this project's own AGENTS.md discipline warns
against ("no fabricated existence of a real integration/event").

## What HackerOne and Bugcrowd actually run (from the feature-parity research)

- **HackerOne Live Hacking Events (LHEs)**: time-boxed (1-3 day), in-person or hybrid,
  invite-curated researcher cohort working alongside a specific customer's program on-site
  or in a dedicated virtual room, with event-specific rules of engagement (broader scope,
  duplicate-window bounty splitting, sometimes higher bounty multipliers for the event
  window only).
- **Bugcrowd LevelUp**: a free, recurring virtual conference (talks, not a live-hacking
  session against a specific target) plus separate, smaller invite-only "bug bash" events
  that more closely resemble HackerOne's LHE format.

Two genuinely different things are being asked for here: a **content/community event**
(Bugcrowd LevelUp's model — talks, no live target) and a **live competitive hacking
event** (HackerOne's LHE model — a real, time-boxed program window with special rules).
They have different build requirements and should not be conflated into one feature.

## Recommended sequencing: content event first, live-hacking event second

**Phase 1 — a content event (lowest build cost, no new domain concepts)**: a `/events`
page listing scheduled virtual talks/AMAs, each a real calendar entry (date, time,
speaker, topic, a join link to whatever video platform is used) with an optional
post-event recording link. This needs no new authorization model and no interaction with
`programs`/`reports` at all — it is closer to the training-content-library pattern
(0066) than to a live-hacking feature: real, authored content, not a live database of
competitive state.

- New table: `public.community_events` (id, title, description, speaker_name, starts_at,
  ends_at, join_url, recording_url nullable, created_by references organization_members
  or platform_admin). Public-read (any authenticated user), write restricted to platform
  admin — matching how `programs.focus_areas` and other admin-curated content already
  work.
- `app/events/page.tsx` — an upcoming/past events list, following the same layout
  discipline `/learn`'s index already established this session.

**Phase 2 — a real live-hacking event window (the harder, HackerOne-shaped feature)**:
this genuinely needs new domain concepts and should not be attempted until Phase 1 proves
there's real researcher demand for event-shaped content at all.

- **A `program_event_windows` table**: `program_id`, `starts_at`, `ends_at`, and an
  event-scoped override of the program's normal bounty policy (e.g. a temporary bounty
  multiplier, or a temporary broader scope). This is a real domain addition — it changes
  what `evaluate_program_scope` and the bounty-calculation RPCs need to check (is `now()`
  inside an active event window for this program, and if so, apply the event's override
  instead of the program's standing policy) — not a cosmetic label on existing reports.
- **Event-scoped researcher eligibility**: HackerOne's LHEs are invite-curated, not open
  to every researcher who already has program access — this needs its own
  `event_invitations` concept, structurally similar to `program_invitations` (0007) but
  scoped to an event window rather than standing program access, since a researcher's
  event invitation should not silently grant them permanent program access once the event
  ends.
- **Duplicate-window bounty splitting during the event**: HackerOne pays multiple
  researchers who find the same bug independently within a live event's compressed
  timeframe, rather than the normal "first valid report wins, everything after is a
  duplicate" rule. This is a genuine, non-trivial change to `mark_duplicate`'s current
  semantics *scoped only to an active event window* — the standing duplicate rule for
  every other report stays exactly as `0009`/`0012` already built it. This is the single
  most complex piece of Phase 2 and the reason it should not be attempted speculatively.

## What this document does not do

Does not create either table, RPC, or route above. Does not pick a video/streaming
platform for Phase 1's `join_url`. Does not decide event cadence, budget, or which
organizations would host a Phase 2 event first — those are product/business decisions to
make before any of the above gets built, not implementation details to guess at here.
