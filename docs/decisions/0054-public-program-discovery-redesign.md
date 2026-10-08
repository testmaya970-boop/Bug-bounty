# 0054 — Public program discovery: real signals, not a generic list

Related: [[0038-researcher-discovery-product-model]], [[0041-public-program-discovery-vertical-slice]],
[[0042-researcher-product-completion]], [[0051-researcher-extended-identity-kyc-payout]].

## The request and the constraint

A HackerOne "Opportunity Discovery" screenshot was given as a benchmark ("don't be
generic"), with the explicit standing rule this whole project has enforced from the start:
never fabricate a statistic. HackerOne's own page leans on numbers Unpatched has no
real equivalent for (aggregate "447 opportunities," "196 hackers," "94% response rate" --
platform-wide vanity metrics with no disclosed derivation). The redesign benchmarks
HackerOne's *information architecture* -- a curated top section plus a rich, filterable
list, each card carrying real signals instead of just a name and a status badge -- never
its specific numbers or its visual design (matching this project's own repeated
"principles, not a clone" convention: 0030, 0038, 0039, 0049).

## What's real and was already sitting in the schema, unused on this page

Every new number on a card is a live-computed fact, not cached, estimated, or invented:

- **Bounty range** -- aggregated from `program_bounty_policy_severity_ranges`' real
  min/max across every severity tier of the program's *current* policy version. A program
  with no policy configured shows no range at all, never a fabricated "$0 - $0."
  Deliberately the *aggregate* range only, never the per-severity breakdown -- that stays
  gated to org admins/program members/authorized researchers exactly as 0013's RLS policy
  already required; this migration adds a second, narrower, explicitly public-safe
  projection alongside it, not a relaxation of that boundary.
- **Active researcher count** -- `count(*)` from `program_researchers` where `status =
  'active'`, live.
- **Resolved report count** -- `count(*)` from `reports` where `status = 'resolved'`, live
  -- a real trust signal (this program has actually paid out/fixed real vulnerabilities),
  not a vanity number.
- **Focus areas / asset types** -- already-real columns (`programs.focus_areas` from 0051,
  `program_scope_entries.asset_type`), just not previously shown on the discovery card.

## What was built

**Migration `202609020002_public_program_discovery_signals.sql`**: `list_public_programs`
extended (dropped and recreated -- a different signature, the same "old overload must not
linger" discipline 0042 already established) to also return `focus_areas`, `asset_types`,
`bounty_min/max_minor_units`, `bounty_currency`, `active_researcher_count`,
`resolved_report_count`, plus a new `p_focus_area` filter param. New
`list_top_bounty_programs(limit)` -- the curated "Highest-paying programs" section, which
only ever includes a program with a real, currently-active bounty policy, ordered by its
real ceiling.

**`lib/money.ts`**: `formatBountyRange` -- a compact, real `"$5,000 - $25,000"` string,
currency-symbol-aware for USD/EUR/GBP/INR, falling back to the raw code for anything else
rather than guessing a symbol.

**`components/programs/public-program-list.tsx`** (redesigned): every card now shows real
focus-area/asset-type tags, a real bounty range when one exists, and real
researcher/resolved-report counts -- including an honest "0 researchers · 0 resolved
reports" for a brand-new program, which is itself real, useful information about how
established a program is, not something to hide.

**`components/programs/top-bounty-programs-list.tsx`** (new): the curated section, wired
into both the anonymous `/programs` page and the authenticated researcher's own Programs
page, in the same position HackerOne's own "Campaigns & top-paying opportunities" occupies
-- prominent, near the top.

**Focus-area filter**: a real `<select>` on the existing search form, backed by the new
`p_focus_area` RPC param -- the same real enum (`researcher_focus_area`) 0051 already
introduced for researcher interests and program tagging, so a researcher's declared
interests, a program's own tags, and this filter all speak the identical vocabulary.

## What was deliberately not built

- A generic sort-by control (Newest / Most researchers / Highest bounty) -- would require
  generalizing the existing keyset-pagination cursor across multiple, incompatible sort
  keys. The curated "Highest-paying" section already surfaces the one sort order
  (bounty ceiling) that isn't naturally served by the existing recency-sorted list, without
  that complexity. A real sort control remains a reasonable, separable follow-up if
  real usage shows the recency-only default list isn't enough.
- Any platform-wide aggregate stat ("N opportunities available," "N% response rate") --
  HackerOne shows these; Unpatched has no honest, real basis for a response-rate metric at
  all (no SLA/response-time tracking exists anywhere in this schema), and a bare program
  count is exactly the kind of vanity number this project has repeatedly rejected
  elsewhere (0016, 0042, 0043).
- An "educational content" filler section (HackerOne's "New to hacking? Hacker101") --
  Unpatched has no equivalent course/resource to link to; fabricating one, or linking
  Mailpit-style placeholder content, would violate the same honesty standard applied
  everywhere else this session.

## Tests, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1096/1096, 68 files) all pass, including
a rewritten `public-program-discovery-ui.test.tsx` that specifically asserts: the exact
real bounty range/researcher count/resolved-report count passed in is what renders (never
a hardcoded value), no bounty range renders at all when the program has none configured, a
brand-new program's real zero-counts render rather than being hidden, and real focus-area/
asset-type labels render (never a raw enum string).

Live, against the real reset local database and real seeded programs: the anonymous
`/programs` page shows a real "Highest-paying programs" section (Northwind Public API,
$0 - $5,000, matching the seed script's own configured policy) and every card in the full
list shows its real tags, researcher count, and resolved-report count. The authenticated
researcher's own Programs page shows the identical real section. The focus-area filter
select genuinely changes the page's query string and re-filters server-side.

Per standing instruction, `npm run build` was not run for this iteration.
