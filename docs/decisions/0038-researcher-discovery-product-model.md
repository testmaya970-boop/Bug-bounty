# 0038 — Researcher discovery: product model audit (research only, no implementation)

Related: [[0016-reputation-ledger-foundation]], [[0007-researcher-access]],
[[0026-unpatched-product-strategy-and-10x-gap-analysis]],
[[0037-program-discovery-access-model]].

Per the explicit stop condition: no schema, RLS, RPC, or UI was written this pass.

## 1. Exact current Unpatched researcher model

`public.users` (`202608250001_initial_identity_rbac.sql:7-15`): `id, username,
display_name, platform_role, is_suspended, created_at, updated_at`, plus `email`
(added `202608260001:78`). `public.researcher_profiles` (`202608250001:17-24`):
`user_id, biography, avatar_path, reputation_score` -- this row exists per researcher but
`reputation_score` is confirmed dormant by the *reputation ledger migration's own
comment* (`202608290003:5-7`): "read/written by zero application code." `biography`/
`avatar_path` are equally dormant (zero service or component reference, confirmed by
grep).

Reputation (`202608290003_reputation_ledger_foundation.sql`) is a real, live,
append-only **fact ledger**, not a score: one row per organization-confirmed terminal
outcome (`report_resolved`/`duplicate`/`informative`/`not_applicable`/`rejected`/
`bounty_finalized`), self-readable only (`services/reputation.ts`'s three functions all
derive the subject from `auth.uid()`, never accept a researcher-id parameter). No
aggregation beyond counts-by-fact-type exists; no score, rank, or leaderboard exists
anywhere (`DOMAIN.md:72`, reaffirmed by `0016`).

## 2. What an organization can currently know

Only for a researcher already in one of *its own* programs' rosters
(`services/program-researchers.ts:21`, `components/programs/researcher-table.tsx:11-42`):
username, display name, email, participation status (active/suspended/revoked), joined
date. Nothing else -- no reputation figure, no report count, no bio, no skill, no other
program's history.

## 3. What an organization cannot currently know

Everything else, absolutely: any researcher not already in one of its own programs
(no query path exists at all); any researcher's reputation ledger, report count, bio,
avatar, or program history anywhere else; any other organization's roster. There is no
existence leak -- a stranger org cannot even prove a given username is a real account
versus a typo, since no cross-org or public read path touches `users` at all beyond the
per-program-roster policy.

## 4. Competitor discovery mechanics (freshly researched, mechanics only)

| Platform | Profile visibility | What it shows | Selection mechanic |
|---|---|---|---|
| HackerOne | Public profile per hacker | **Signal/Impact** (percentile-ranked validity/severity), verified **"Hacker Skills"** (earned by submitting relevant reports, HackerOne-verified, not self-declared) | Skills feed directly into **targeted private-program invitation matching** -- "programs are matched to hackers with the right skills" |
| Bugcrowd | Public profile + optional resume | Self-rated skills (1-5 scale), interests, resume (experience/education/certs) | **CrowdMatch**: programs specify required skills; researchers "sub-segmented" by demonstrated proficiency in that specific target area; explicit trust gates (identity verification, geography) layered on top |
| Intigriti | Public profile | Achievement badges, reputation points (earned from accepted/duplicate submissions by severity) | **AI-matching**: learns an org's asset/weakness patterns and matches researchers "that have delivered similar contributions to other programs" -- i.e., matched on *outcome history*, closest of the five to Unpatched's own reputation-ledger philosophy |
| YesWeHack | Profile, **researcher-optional to make public** | Skills (free-text keywords, max 5), languages, achievement badges, write-up track record | Mixed: algorithmic reputation-gated eligibility **plus a human Customer Success Manager** who assembles a shortlist from experience with the community and knowledge of the org's scope |
| Immunefi | Public profile | Bounties earned (amounts), badges, leaderboard rank, NFT "Hall of Fame" | Selection is Immunefi-curated for Invite-Only engagements, matched to "each project's technical requirements" |

**Pattern across all five**: every one of them exposes *some* public profile with
earned/verified signal, and every one of them ties selection to that signal --
never a blind directory search of an undifferentiated user list. The two philosophically
closest to Unpatched's own reputation ledger are HackerOne's *verified* (not self-declared)
skills and Intigriti's outcome-history matching; the two furthest are Immunefi's public
earnings/leaderboard and Bugcrowd's self-rated skill scale, both of which DOMAIN.md's own
"no score/rank" decision already rules out replicating.

## 5. Privacy comparison

Unpatched's `public.users` has no legal name, location, or KYC field at all (confirmed by
grep, zero matches) -- meaningfully less personal data than any of the five researched
platforms even collect for a profile. This is a real constraint on what any discovery
model could expose even if one were built: there is no "identity" beyond
username/display-name/email/reputation-facts to show. Categories, mapped to what
actually exists today:

| Field | Exists? | Recommended max exposure |
|---|---|---|
| username/display name | Yes | Already ORGANIZATION-ONLY (own program's roster) -- fine as-is |
| email | Yes | PROGRAM-ONLY (own roster), never wider -- this is the exact field the org already needs for invitation and already has, once a relationship exists |
| reputation facts (ledger) | Yes | Currently PRIVATE (self-only). Any future exposure must stay fact-based ("3 organization-confirmed critical resolutions"), never a score/percentile/rank, per 0016 |
| bio/avatar | Exists, dormant | Undecided -- not urgent either way |
| legal identity, location, payment history | Does not exist | N/A -- cannot leak what was never collected |
| sanctions/suspension (`is_suspended`) | Exists | PLATFORM-ONLY today; would need to stay that way in any discovery model -- a suspended researcher must never be *promoted* as discoverable |

The core privacy principle this audit lands on: **a researcher should not become
findable by an organization they have never worked with, merely because that
organization wants to recruit them.** Every one of the five competitors' public-profile
models violates this by default (that's *why* they're public profiles) -- Unpatched does
not have to accept that trade-off, and given its current zero-directory state, adopting
it would be a regression in privacy posture relative to today, not a neutral feature add.

## 6. Three candidate Unpatched models

**A. Email-only (current).** Researcher experience: passive, invisible until invited.
Org experience: must already personally know the researcher. Privacy: strongest possible
-- zero discoverability surface. Abuse: none possible (no discovery vector exists).
Security: nothing to secure. Cost: zero (already built). Marketplace implication: none.
Unpatched fit: correct for orgs who already know who they want, which is presumably most
orgs today, but does nothing for the "I don't know any researchers yet" case -- the
actual gap this task opened with.

**B. Platform researcher discovery (searchable directory + invite).** Researcher
experience: exposed to search by any organization, opt-out at best. Org experience:
self-serve search/filter. Privacy: real regression from today (§5). Abuse: high --
scraping, spam invitations, harassment, competitive intelligence (a competitor org
enumerating who works with whom). Security: needs rate limiting, a report/block
mechanism, existence-leak-proofing for any future private-program linkage. Cost: high
(index, search UI, opt-in/visibility settings, abuse tooling, moderation queue). Unpatched
fit: **not now** -- Unpatched has no skill-tagging concept and no verified signal beyond
the ledger's own org-scoped facts, so a directory today would either show nothing useful
or would need new self-declared fields (skills, bio) that reintroduce the
unverified-vanity-data problem 0016 already rejected once (reputation score).

**C. Discovery + application (public program listing, researcher applies).** Researcher
experience: browse and apply. Org experience: review/approve applications. Privacy:
requires the program itself to be listed publicly or semi-publicly -- this is the
`0037` marketplace question, not a researcher-discovery question, and `0037` already
concluded Unpatched isn't ready for it (no reputation-gating mechanism to make public
listing safe). Cost: highest of the three (needs both a public/eligible listing surface
*and* an application-review workflow). Unpatched fit: **not now**, for the same reason
`0037` gave -- this is a program-marketplace decision wearing a researcher-discovery
costume.

## 7. Do we need a marketplace? (explicit)

No -- and the task's own framing is correct that these are separable. A program can
remain fully invite-only (never publicly discoverable, per `0037`) while an organization
still gains a *bounded* way to find researchers to invite: specifically, its own past
collaborators. That requires zero public/marketplace surface at all. This is the basis
for the recommendation in §13.

## 8. Unpatched's differentiator, evaluated

The task's proposed philosophy -- match on "organization-confirmed outcomes," not
popularity -- is real and buildable *in principle*, because the reputation ledger already
is exactly that: a fact log of organization-confirmed terminal outcomes, never a
popularity score. But **program-scope-to-researcher-specialty matching cannot be built
honestly today**, because Unpatched has no specialty/skill concept at all (§6 of the
prior audit; reconfirmed here) -- the ledger records *that* a researcher resolved a
critical finding for Org X, never *what kind* of finding (web app / API / infra). Building
"match on relevant, verified outcomes" would require inventing a new skill/specialty
taxonomy first (see 0037's own caution against inventing capability-shaped columns ahead
of their prerequisites) -- exactly the trap HackerOne avoided by making Skills
*report-verified*, not self-declared, and exactly the corner Bugcrowd cut by allowing
self-rated skills (a real, industry-acknowledged weaker signal). Unpatched should not
rush to either version yet.

## 9. Program-context matching

Correct instinct, not buildable yet, for the exact reason in §8: there is no scope-tag
or specialty-tag on either `programs`/scope entries or `reputation_ledger` to match
against. Deferred until such a concept is deliberately designed (its own future audit),
not invented as a side effect of this one.

## 10. Organization UX (architecture only, not built)

Given the §13 recommendation below, the correct home is **Organization → (cross-program)
Researcher history**, not a global directory and not per-program-only. Today's
per-program roster (`researcher-table.tsx`) already exists and stays; what's missing is
an org-level aggregate view across *all* the org's own programs, surfaced from the
organization dashboard, from which "invite to this program" can be initiated without
re-typing an email already on file.

## 11. Researcher UX (architecture only, not built)

No new researcher-facing surface is implied by §13's recommendation at all -- a
researcher does not become more "discoverable" than they already are to organizations
they've already worked with (which is the current, correct baseline). This is a
meaningful advantage of the recommended model: it requires zero new researcher-facing
privacy controls, opt-outs, or consent flows, because no new exposure is created.

## 12. Authorization model

Same predicate the existing per-program roster already uses, just widened from "one
program" to "any program in this org": an org's own owner/security_admin (full org
access) or a program manager (their own programs only) could see a cross-program
roster restricted to `program_researchers` rows whose `organization_id` matches their
own -- never another org's. A billing admin (if such a role exists in this schema) gets
no new access, matching `0025`'s "billing has no researcher-facing visibility" pattern.
A triager, if scoped per-program today, would see the same per-program subset as now,
not the cross-program view. Anonymous: none. Stranger organization: none, structurally
identical to today (the predicate is still `organization_id = mine`). Researchers cannot
see who searched for them, because no search of them ever occurs under this model.

## 13. Most important product decision

**Unpatched should not become "find the right researcher platform-wide" yet, and should
not become "publish and let researchers apply" at all in the near term** (that's `0037`'s
marketplace question, separately answered no). The correct next increment is narrower
than all three candidate models as originally framed: **let an organization invite from
its own real history** -- researchers who have already participated in any of that
org's own programs, surfaced as one cross-program list instead of requiring the org to
remember which specific program a given researcher was in, or re-obtain their email.
This is not Model B (no platform-wide search, no new researcher exposure, no directory)
and not Model C (no public listing, no application flow) -- it is Model A, widened along
an axis the org already legitimately has (its own past relationships), not a new
discovery surface. It solves the literal, real pain named in this task ("primitive
acquisition workflow because you must already know an email") for the case that actually
recurs in practice -- an org running a second or third program wanting to bring back
researchers who did good work on the first one -- without any of Model B/C's privacy,
abuse, or premature-marketplace costs. True cross-platform, skill/scope-matched
discovery (Model B/F in `0037`'s terms) is deferred until both a real specialty taxonomy
and a mature abuse-prevention system exist -- named here as the honest future direction,
not designed in detail.

## 14. Minimum researcher profile (for the recommended model)

Exactly what today's per-program roster already shows: username, display name, email,
which of the org's own programs they've participated in, and status. No new field.
"Verified outcomes" (reputation ledger counts) could be added to this cross-program view
later without expanding *exposure* (the org can already read the researcher's org-scoped
ledger facts today per the RLS in §2 -- unchanged in this model, still bounded to
reports belonging to that org).

## 15. Required backend capabilities (if this were implemented -- not started)

A single new query: "all distinct researchers across every `program_researchers` row
whose `organization_id = my org`," reusing the exact RLS predicate the per-program
roster already relies on, widened from `program_id = X` to `organization_id = my org`.
No new table, no new RLS policy shape (same has_org_role/is_program_member predicate
family), no new RPC beyond a new read query.

## 16. Required frontend capabilities (if this were implemented -- not started)

One new organization-level list view and an "invite to program" action from it that
pre-fills the known email into the existing `invite_researcher_to_program` flow. No new
component family -- reuses `researcher-table.tsx`'s existing visual grammar.

## 17. What NOT to build

No researcher directory, search box, or profile page. No visibility/discoverability
column on `users`/`researcher_profiles`. No skill/specialty taxonomy invented ahead of
a real design pass. No application/request-access system. No public marketplace. No
exposure of reputation ledger facts outside the org(s) that produced them. No score,
rank, percentile, leaderboard, or badge of any kind (reaffirms `0016`). No platform-admin
gatekeeping of ordinary invitations. Nothing in this pass wrote code.

## 18. Exact implementation slice after this research (recommended, not started)

Ship the cross-program "researchers I've worked with" organization view described in
§10/§13, backed by the single widened query in §15, with an "invite to this program"
action reusing the existing invitation RPC unchanged. This is the smallest concrete step
that actually addresses the acquisition-workflow complaint this task opened with,
without touching the invite-only access model `0037` already confirmed correct, and
without building any directory/marketplace surface this audit found unjustified today.
