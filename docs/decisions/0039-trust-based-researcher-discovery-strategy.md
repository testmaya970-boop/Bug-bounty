# 0039 — Trust-based researcher discovery: strategy audit (research only, no implementation)

Related: [[0016-reputation-ledger-foundation]], [[0037-program-discovery-access-model]],
[[0038-researcher-discovery-product-model]].

Per the explicit stop condition: no schema, RLS, RPC, or UI was written this pass. This
document was explicitly asked to try to disprove its own thesis -- §3 and §12 do.

## 1. Brutal assessment of Unpatched's current researcher acquisition

It has exactly one working mechanism: an organization must already know a researcher's
exact email. `0038`'s recommended MVP ("researchers I've worked with") fixes the
*re*-acquisition case only. It does not touch the actual hard problem: an organization
running its first program, or a program needing a specialty it has no history with, has
**no way to find anyone**. That is a real, unsolved cold-start gap, and this document
should not pretend otherwise.

## 2. Competitor mechanics -- specifically, what signal answers "is this the right one?"

| Product | Signal used | Self-declared, verified, or both? |
|---|---|---|
| HackerOne | Category filters (industry/asset/technology) for browsing; separately, **ID-verification + background checks** as a distinct trust tier for sensitive work | Both -- filters are near-metadata-level, but the *sensitive-work* gate is platform-verified identity, not a skill score |
| Bugcrowd (CrowdMatch) | A blended "Security Knowledge Graph": *verified* platform history (points, report volume, quality, testing accuracy, depth, aggregate impact) **plus** *self-declared* skills, education, certifications, self-assessments | **Both, explicitly** -- this is the disconfirming data point for §12, see below |
| Intigriti | Reputation points (severity-weighted accepted submissions) + AI pattern-matching against an org's own asset/weakness history | Verified (points) + inferred (AI matching), no self-declared skill field surfaced in the matching itself |
| YesWeHack | Self-declared skill keywords + a **human** Customer Success Manager curating shortlists from experience | Both, with a human arbiter in the loop |
| Immunefi | Public earnings/leaderboard/badges; project-side manual selection against technical requirements | Mostly self-evident from outcomes, but publicly ranked -- exactly what `0016` already rejected replicating |
| GitHub (CODEOWNERS) | **Zero skill taxonomy at all.** Reviewer authority is derived purely from *demonstrated write access to that exact file path* -- structural, contextual, scope-bound trust | Verified only, and narrowly scoped -- the closest real-world parallel to "verified outcomes tied to scope," not a marketplace at all |
| Stripe (Radar) | Dozens of blended signals scored simultaneously for **risk**, never a single attribute, never used for positive "best fit" ranking | Verified/derived -- a trust/safety instrument, not a matching instrument (see §11) |

## 3. Critically examining "skills" -- disproof attempt

The three options, tested against the evidence in §2:

**A. Self-declared skills** -- cheap, immediate, but exactly the signal `0016` already
distrusted once (self-reported reputation score) for the same reason: unverifiable claims
inflate over time and cannot be disputed. Weakest option, though every competitor uses it
*at least partially* -- notably, even Bugcrowd's most sophisticated system still does.

**B. Organization-applied controlled taxonomy at confirmation time** -- not yet
considered in `0038`, and the strongest option found this pass. Unpatched already has an
organization perform an audited, SECURITY DEFINER-gated confirmation action at the exact
moment a report resolves (the triage/decision RPCs). Extending that *already-trusted,
already-attributed* moment to also capture a controlled-vocabulary category (e.g.,
"authentication," "injection," "business logic" -- a fixed enum, not free text) costs
nothing in new trust surface: the same organization that already confirms severity and
outcome would confirm category, using the identical authorization path. This produces a
fact that is simultaneously organization-confirmed *and* structured -- something none of
the five competitors' skill signals actually are (theirs are either self-declared or
opaque ML inference).

**C. Inferred from report text/outcome** -- rejected on evidence, not principle: this
requires NLP/ML classification of freeform report content, an entirely new
non-deterministic subsystem with no audit trail of its own decisions -- the same
"opaque black box" weakness Bugcrowd's own Knowledge-Graph approach has, and a poor fit
for a platform whose entire design philosophy (`DESIGN.md`, `SECURITY.md`, every prior
decision doc in this project) is "no silent status field, every fact attributed to an
actor and an event." An inferred tag has no actor.

**Verdict: B, not A or C.** This is a genuine, evidence-grounded differentiator: category
data captured as an attributed fact at an already-audited moment, not a self-declared
claim and not an opaque inference.

**Does this fully validate the core thesis?** No -- and this is the honest disproof
result. Bugcrowd's own CrowdMatch, the most mature real system researched, still blends
self-declared data *because pure verified-outcome signal is too sparse to bootstrap*: a
brand-new researcher with zero organization-confirmed facts is invisible under a
verified-only model, exactly as they are under Unpatched's current invite-only model.
**Verified-only outcomes cannot solve the cold-start problem** -- they can only make
matching trustworthy *once a researcher has some track record*. Any Unpatched strategy
that claims verified-outcomes-only fully replaces the need for some lower-trust signal
(even just "categories of interest," self-declared) for brand-new researchers is not
supported by the strongest competitor evidence found. The correct claim is narrower:
verified, organization-confirmed category facts are the right signal **for matching
established researchers to programs**, not a complete answer to the separate "how does a
new researcher ever get their first opportunity" question -- which remains the invitation
model, unchanged, exactly as it is today.

## 4. Trust hierarchy

```
SELF-DECLARED (e.g., "interested in API security")
    -- weakest; used by every competitor for cold-start bootstrapping only
ORGANIZATION-CONFIRMED (e.g., a controlled-category tag applied when a report resolves)
    -- strongest available signal Unpatched can produce today; attributed, audited, disputable
PLATFORM-VERIFIED (e.g., HackerOne's ID/background check)
    -- a distinct, heavier tier for sensitive engagements; Unpatched has no such mechanism
       and none is proposed here -- named only because HackerOne's evidence shows it is a
       *separate* axis from skill-matching, not a replacement for it
```
Unpatched should trust organization-confirmed category facts for matching; self-declared
signals should be visually and structurally distinguished (per DESIGN.md's own severity
convention: never blur an unconfirmed claim into a confirmed fact's presentation) if ever
shown at all; platform-verified identity is out of scope for this document entirely.

## 5. Program → researcher matching -- minimum viable model

Grounded in real data only: `program.scope` (targets already exist) x
`reputation_ledger` category tags (§3's proposal) x `program_researchers`/organization
history x researcher opt-in (§7). Availability/preferences are **not** retained as
matching inputs -- no such data exists or is proposed, and inventing it would repeat the
exact "invent a field nobody populates" mistake `researcher_profiles.biography` already
demonstrates (dormant since the day it was created).

## 6. Privacy model

| Attribute | Anonymous | Researcher (self) | Org member (no relationship) | Program manager (own org) | Triager (own org) | Platform admin |
|---|---|---|---|---|---|---|
| username/display name | No | Yes | No (unless §7 opt-in) | Yes, once related | Yes, once related | Via audited RPCs only |
| email | No | Yes | No | Yes, once related | No new access | No |
| reputation facts (raw ledger) | No | Yes | No | Own-org facts only, unchanged from today | Own-org facts only | No |
| category tags (§3) | No | Yes | No, unless researcher opts in (§7) and only aggregated/anonymized-until-invited | Same as reputation facts | Same | No |
| bounty/payment history | No | Yes | **Never** -- financial data crosses an organization boundary that must never leak between orgs, or to an org with no relationship at all | Own program's own payments only (already the existing boundary) | No | Via audited financial RPCs only, unchanged |
| sanctions/suspension | No | Yes (own status) | No | No -- a suspended researcher must simply not appear anywhere, never be shown *as* suspended to an unrelated org (that itself would be a reputation leak) | No | Yes |
| private program membership (elsewhere) | No | Yes | **Never** | **Never** -- this is the single most important "must never leak" item: Org A must never learn Org B has a relationship with a given researcher | Never | No |

**Must never become organization-visible, under any model considered here**: bounty/
payment amounts across an org boundary; the mere fact that a researcher participates in
another organization's program; suspension status shown to an unrelated org (leaks a
negative signal about someone who isn't even discoverable to that org); any self-declared
field presented with the same visual weight as an organization-confirmed one.

## 7. Researcher control

Compared directly: **opt-in discovery** (researcher must explicitly enable being
findable by orgs they have no relationship with) vs. **default discovery** (rejected --
turns every researcher into inventory the moment they sign up, without consent) vs.
**invite-only identity forever** (`0038`'s status quo -- safe but does not solve
cold-start for orgs). **Recommended: opt-in discovery**, and only for the narrow,
program-context-matched surface in §9/§14 -- never a general searchable profile. A
researcher who never opts in experiences literally nothing different from today.

## 8. Organization discovery model (conceptual journey, not screens)

Create program → configure scope → activate → **recruit**. Today "recruit" is a dead
end unless the org already has emails. The conceptually correct next step is not "search
researchers" -- it's "see researchers *from your own program's specific scope category*
who have opted in and have an organization-confirmed outcome in that category," which is
a much narrower, safer statement than a generic search box, and only exists once §3's
category tags and §7's opt-in both exist.

## 9. Program-context matching model

Confirmed as the correct frame over "organization searches everyone": matching should be
initiated **from a specific program** (its scope implies relevant categories), scoped to
only opted-in researchers, filtered to those with at least one organization-confirmed
outcome in a matching category, and explicitly excluding any researcher this
organization would not otherwise be authorized to know about. This is structurally
closer to GitHub's CODEOWNERS model (context-bound, evidence-based authority) than to
Bugcrowd/HackerOne's broader marketplace-style matching.

## 10. Abuse model

Spam invitations: rate-limit invitations per organization per day, exactly the kind of
control HackerOne's 14-day-expiry + "don't request an invite" disclosure norm implies is
necessary industry-wide. Harassment: opt-in discovery itself is the primary control --
a researcher who never opts in cannot be reached this way at all; an opted-in researcher
needs a real "report/block this organization" action before any matching surface ships.
Reputation manipulation / fake findings: already structurally hard today, since every
ledger fact requires a real `outbox_events`-sourced report resolution
(`source_event_id... references outbox_events`) -- an organization cannot fabricate a
fact without actually running a real report through the real triage pipeline, which
itself is audited. Collusive reputation (an org and a "researcher" faking outcomes
together to inflate a profile): a real residual risk with no existing detection --
platform admin involvement (§11) is the right layer for this, not an automated gate at
launch. Scraping/competitive intelligence: opt-in + no public route (never build a page
crawlable without authentication) is the primary defense. Discriminatory selection: out
of scope for this document -- a policy/legal question, not an architecture one, but
worth flagging that any future matching UI should avoid surfacing attributes (even
category tags) in a way that could function as a proxy for protected characteristics;
none of the proposed signals here are demographic, which helps.

## 11. Platform-admin governance

Not a per-invitation gatekeeper (explicitly rejected, matches the task's own instruction).
Correct role, extending the real `platform_admins` foundation already built (`0027`):
investigate disputed/suspicious reputation-ledger patterns (a queue, not a manual
approval step -- the same "Needs Recovery" read-only-queue-plus-one-safe-action shape
`0027` already established), issue/lift researcher suspensions (already exists via
`is_suspended`), and adjudicate abuse reports from §10's block/report action. Scalable
because it is exception-handling, not a required step in every invitation's critical
path.

## 12. The big strategic question -- brutal answer

**Would "researchers I've worked with" alone (0038's MVP A) be meaningfully better, or
just incremental?** Incremental. Stated plainly, as instructed: it makes an existing,
narrow workflow (re-inviting a past collaborator) slightly easier. It does not touch the
actual strategic question this document was asked to answer, and would not, by itself,
change how a new organization with no researcher relationships experiences Unpatched at
all.

**What would make Unpatched's researcher discovery genuinely 10x better than a generic
directory** -- based on Unpatched's actual existing architecture, not invented features:
Unpatched is the only platform researched whose entire report lifecycle already produces
attributed, audited, disputable facts as a side effect of normal operation (triage,
decision, bounty, audit_logs). Competitors' skill/trust signals are bolted onto their
platforms as separate systems (self-assessment forms, ML knowledge graphs, manual CSM
curation). Unpatched's differentiator is that a genuinely trustworthy matching signal
(§3, Option B) can be produced with **zero new trust infrastructure** -- it reuses the
exact SECURITY DEFINER confirmation moment that already exists for an unrelated reason
(closing out a report). That is a structural advantage no competitor's architecture
naturally has, because none of them built triage-as-an-attributed-event-log first and
skill-matching second -- they built matching as its own bolted-on product. Unpatched could
build the trustworthy version first, cheaply, because the audit trail was there for a
different reason. This is real, not aspirational -- but it only pays off once enough
organization-confirmed, categorized outcomes accumulate (§3's cold-start caveat), so the
honest framing is "a structurally superior foundation for matching, not yet a matching
product."

## 13. MVP comparison

| | Product value | Eng. complexity | Privacy risk | Abuse risk | Data required | Differentiation | Time to launch |
|---|---|---|---|---|---|---|---|
| A. Researchers I've worked with | Low-moderate (real but narrow) | Very low | None (no new exposure) | None | None new | None (any platform could ship this) | Fast |
| B. Opt-in researcher directory | Moderate | High (search, opt-in UI, moderation) | Moderate (mitigated by opt-in) | High without §10's controls | Needs self-declared fields (weak signal, per §3) | Low -- this is what every competitor already has | Slow |
| C. Program-context discovery | High, if B's prerequisites exist | High (needs B's infra plus scope-matching logic) | Same as B | Same as B | Needs §3's category tags | Moderate | Slow, blocked on B |
| D. Verified-outcome matching | Highest long-run | Highest (needs §3 tags accumulated at scale, opt-in, matching logic) | Lowest of the discovery options (fact-based, not self-declared) | Lowest of the discovery options | Needs real accumulated ledger category data -- does not exist yet | **Highest** -- this is §12's actual differentiator | Slowest -- gated on data that doesn't exist yet |
| E. Hybrid (phased A→B→C→D) | Builds real value at each phase | Incremental | Managed incrementally | Managed incrementally | Grows incrementally | Reaches D eventually | Realistic |

## 14. Recommended strategy -- phased, only what Unpatched can actually support

**Phase 1 (now): MVP A only**, explicitly labeled internally as a usability fix, not a
strategic discovery launch. **Phase 2 (backend-only, no new exposure): add §3's
organization-confirmed category tag** to the existing report-resolution confirmation
moment -- zero new visibility, pure data accumulation, so Phase 4 has real data to work
with when its time comes. **Phase 3 (once Phase 2 has real data and §7's opt-in +
§10's abuse controls exist): program-context matching among opted-in researchers only**,
surfaced from a specific program, never a general directory. **Phase 4 (once Phase 3 is
proven and enough category-tagged outcomes exist): relevance-ordered recommendations**
within that same opted-in pool -- still fact-based, never a score or rank shown to an
organization, consistent with `0016` for the life of this product.

## 15. Why this could be 10x better (restated concisely)

Because the trust signal is a byproduct of Unpatched's existing, already-audited
triage/decision architecture, not a bolted-on skill marketplace -- see §12.

## 16. What NOT to build

Everything `0038`'s §17 already excluded, unchanged, plus: no self-declared skills field
(rejected in §3); no ML/NLP inference of researcher capability (rejected in §3); no
public leaderboard/earnings display (rejected, matches `0016`); no default-on
discoverability (rejected in §7); no cross-org visibility of suspension, payment, or
other-program membership under any circumstance (§6); no platform-admin approval step in
the ordinary invitation path (§11).

## 17. Backend capabilities eventually required (not started)

Phase 2: one new controlled-vocabulary enum column on the report-resolution confirmation
path, populated by the existing organization-confirming actor inside the existing
SECURITY DEFINER RPC (additive, no new authorization surface). Phase 3: a researcher-side
opt-in flag (default false); a program-scoped query joining `programs.scope` category
against opted-in researchers' tagged ledger facts, reusing existing RLS-author patterns.
Phase 4: a ranking/ordering function over Phase 3's result set -- no new data, just
presentation order.

## 18. Frontend capabilities eventually required (not started)

Phase 2: none (backend-only). Phase 3: one researcher-facing discoverability toggle
(with plain-language consequence copy) and one organization-facing "find researchers for
this program" view, scoped to a single program, never a global search. Phase 4: relevance
ordering within that same view -- no new screen.

## 19. Exact next implementation slice (recommended, not started)

Unchanged from `0038`: ship **Phase 1 only** (MVP A, "researchers I've worked with"),
labeled honestly as an incremental usability fix. Do not begin Phase 2 (category
tagging) until this document's Phase 1 has shipped and there is a real, current audit of
the actual report-resolution RPC surface it would extend -- that is its own future
slice, not started here.
