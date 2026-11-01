# Changelog

Real entries, generated from this repository's own commit history (`git log`) --
never hand-written marketing copy. `/help` links here for "what shipped." Every
commit before this repository's own `git init` is folded into one baseline entry
below; this project's actual, longer implementation history lives in
`docs/decisions/` (numbered decision records) if you need it in more detail than
git can provide.

## Unreleased / most recent work

- Program switcher: jump between an organization's programs from the program
  header, without returning to the Engagements list first.
- Hactivity: a real, paginated, filterable feed of an organization's own audit
  events.
- Home rewrite: a glance-only KPI row and a single de-duplicated action queue,
  replacing several overlapping lists that could previously show the same
  report twice.
- Fixed a request-amplification issue where every visible navigation link was
  speculatively pre-fetched, each one paying a full authentication check --
  removed by disabling prefetch on authenticated navigation links, not by
  weakening the check itself.
- Parallelized several pages' data loading (program home, findings) that were
  previously waiting on unrelated queries one at a time.
- Clarified in three places that payouts are arranged manually, off-platform,
  by an organization's own program contact -- not processed automatically by
  this product.
- Assets & Scope: an organization-wide inventory view over program scope,
  linked from the triage inbox.
- Rewards: a running total of paid bounties on an organization's Home page.
- Added a real "Coming Soon" destination for capability that is planned but
  not yet built, rather than a dead link.
- Launch checklist: a seed script and environment/QA checklist for bringing
  up a new environment.

## Baseline

Everything before this repository's own version history: the researcher and
organization dual-sided platform itself -- programs, report triage and
disclosure workflow, scope/asset management, bounty calculation and payment
ledger, reputation scoring, notifications, CTF practice challenges, and the
platform-admin surfaces. See `docs/decisions/` for the individual design
records behind this baseline.
