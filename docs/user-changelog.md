# User-facing changelog

Read live by `/help`'s "What's new" section. This file is deliberately separate
from `CHANGELOG.md` (the repository's own commit-derived engineering history):
that file is written for developers and can legitimately contain internal
notes, migration details, or infrastructure/tech-stack references at any
time -- content that must never be end-user-visible. Every entry here is
written and reviewed specifically for a signed-in user to read, in plain
product language, with no internal implementation detail (no table/column
names, no vendor/library names, no migration or file references).

Only the most recent section renders. Keep entries short, real, and free of
anything that wasn't actually shipped.

## Unreleased / most recent work

- Program switcher: jump between an organization's programs from the program
  header, without returning to the Engagements list first.
- Hactivity: a real, paginated, filterable feed of an organization's own audit
  events.
- Home rewrite: a glance-only KPI row and a single de-duplicated action queue,
  replacing several overlapping lists that could previously show the same
  report twice.
- Faster page loads across authenticated navigation.
- Clarified in three places that payouts are arranged manually, off-platform,
  by an organization's own program contact -- not processed automatically by
  this product.
- Assets & Scope: an organization-wide inventory view over program scope,
  linked from the triage inbox.
- Rewards: a running total of paid bounties on an organization's Home page.
- Added a real "Coming Soon" destination for capability that is planned but
  not yet built, rather than a dead link.
