# 0059 — Sidebar nav restructure and duplicate-active-item fix (post-hoc)

Related: [[0043-researcher-visual-identity-pass]].

## Why this doc exists

`components/app-shell-client.tsx` and `tests/unit/ui.test.tsx` both cite
"docs/decisions/0062/0063" and "0063" respectively for the sidebar's
Main/System nav-group structure and a duplicate-active-nav-item bug fix.
Neither `0062` nor `0063` was ever written. This doc records, post-hoc,
what that code and test already describe, and both citations are corrected
to point here.

## What the code actually does

`MAIN_NAV`/`SYSTEM_NAV`/`ORGANIZATION_NAV` in `components/app-shell-client.tsx`
group the authenticated sidebar into two always-present groups (Main:
Dashboard, Programs, Reports, Researchers, Bounties; System: Notifications)
plus a conditional Organization group, deliberately with **no separate
"Workspace" group and no separate "Leaderboard" entry**:

- A "Workspace" group (My Programs → `/programs`, My Reports → `/reports`,
  Saved Programs → `/programs` again) was found live to duplicate Main's
  own destinations under a second label — every one of those destinations
  was already one click away in Main, never a distinct route.
- A separate "Leaderboard" entry would have duplicated `/researchers`,
  which already carries the real leaderboard alongside the reputation
  ledger as one page, not two.

Both duplications produced the identical real bug: `usePathname()` matched
two nav items' `href`s at once, so two entries (e.g. "Programs" and "Saved
Programs") lit up as active simultaneously on the same route. Removing the
duplicate destinations — not adding special-case active-state logic — is
the fix: a route has exactly one nav entry, so exactly one can ever match.

`tests/unit/ui.test.tsx`'s "groups navigation into Main/System... with
exactly one Researchers entry and no separate Workspace group" test
(`AppShellClient` foundation suite) asserts this structure directly:
`"Main"`/`"System"`/`"Organization"` group labels are present, `"Workspace"`
is absent.

## Verification

No behavior changed by writing this doc. `components/app-shell-client.tsx`'s
`0062/0063` comment and `tests/unit/ui.test.tsx`'s `0063` reference are both
updated to cite `0059` in the same pass that authored this file.
