# 0026: Unpatched product strategy and 10× gap analysis

Date: 2026-08-31
Status: **Strategy research only. No code, migration, RPC, or UI was changed in this slice.**

This document builds on `docs/decisions/0024-three-perspective-product-model.md` (first three-perspective audit, competitor role research, the `create_organization` finding) and `docs/decisions/0025-platform-operations-gap-audit.md` (deeper platform-operations research tagged FACT/VENDOR CAPABILITY/INFERENCE, the SEE/CONTROL/INVESTIGATE/RECOVER breakdown, launch readiness, next-5-slices). Competitor facts already sourced there are not re-derived here — this document's job is different: turn that research into an actual strategic decision, reasoning causally ("why does the mechanism exist, what happens without it") rather than re-listing features, and commit to a specific, justified 10× bet and a single next slice.

---

## A. Executive conclusion

Unpatched is a genuinely well-built **two-party workflow application** (researcher ↔ organization) with unusually strong authorization discipline — every domain audited across three prior slices enforces its rules at the RLS/RPC layer, not in application code, and the audit trail is real everywhere it exists. It is **not yet a platform**, because the third party — Unpatched itself, as an operating authority distinct from any one organization — does not exist in any enforceable form. The `platform_role` enum and `requirePlatformAdmin()` guard are confirmed dead scaffolding (re-verified again this slice, zero call sites, nothing ever sets the value).

The strategic conclusion is not "build the platform-admin dashboard next." It is: **Unpatched's real 10× opportunity is not matching HackerOne/Bugcrowd/Intigriti's platform-operations feature set — it is exploiting the structural rigor Unpatched already has (immutable policy versions, append-only reputation, hardcoded state-machine transitions, real RLS-enforced privacy) to make the platform *legible* in a way no competitor's opaque, score-driven model is.** The one next slice (Section S) is chosen because it is the cheapest possible step that makes that legibility real for the first time, not because it is the most obviously "platform" feature.

---

## B. What Unpatched is today

A single-organization-scoped, invite-only security-report workflow tool with: real organization/program/researcher-access authorization domains (deliberately never collapsed into one role field); a rigorous report triage state machine with no generic status setter; evidence and communication with a researcher-visible/internal RLS split; a versioned, immutable bounty-policy engine where a later policy change can never retroactively rewrite an already-calculated decision; a payment ledger with a manual-only provider that never claims success without an explicit operator confirmation; a transactional outbox powering reputation and notification fan-out; a real (Resend) email provider behind a swappable seam; database-backed rate limiting on the sign-in/report-submission/organization-creation/invitation/evidence-upload boundaries; keyset pagination on every genuinely unbounded collection; and a consistent, deliberately unglamorous visual system (no vanity metrics, no fake security theater, honest empty states). All of this is real, live-tested, not aspirational — this document does not relitigate that.

What it is missing entirely: any operational actor above "an organization's own admins." No program-discovery surface for researchers. No retest mechanism. No cross-organization visibility, control, investigation, or recovery capability for anyone. No organization onboarding/verification/trust gate. No dispute mechanism for either side.

---

## C. What HackerOne/Bugcrowd/Intigriti actually optimize for (causal reasoning, not a feature list)

For each mechanism: the problem it solves, why it matters, what happens without it, and whether Unpatched could solve the same problem differently/better.

**Program launch approval / activity thresholds (HackerOne: ≥10 reports, ≥100 invited hackers before public launch)**
- *Problem*: an organization that hasn't yet proven it can respond to reports competently would burn researcher goodwill (and platform trust) the moment it's exposed publicly — a slow, dismissive, or non-paying new program poisons the researcher's opinion of the *platform*, not just that one org.
- *Why it matters*: the platform's own reputation is a shared resource across every organization on it; one bad actor damages everyone's trust in the marketplace.
- *Without it*: researchers learn (via word of mouth, public write-ups, Twitter) that the platform tolerates unresponsive programs, and stop trusting *any* new program on it — a classic marketplace cold-start/lemon problem.
- *Could Unpatched solve it better?* Unpatched doesn't need HackerOne's exact numeric threshold (that's calibrated to HackerOne's own researcher volume). But the underlying mechanism — "prove responsiveness privately before being exposed publicly" — is the right shape. Unpatched's own `DRAFT → REVIEW → ACTIVE` lifecycle already has a natural seam for this (`submit_program_for_review`/`activate_program` already exist as distinct RPCs, per `0021`) — the review step exists in the state machine today but is currently *self-approved by the same organization*, which defeats the purpose entirely.

**Managed/first-pass triage (all three: HackerOne security analysts, Bugcrowd ASEs, Intigriti's Triage team)**
- *Problem*: raw researcher submissions are noisy — duplicates, out-of-scope, low-effort, or simply wrong — and making an organization's own (often smaller, less security-specialized) team wade through all of it before seeing a real signal is exhausting and slows down genuine findings.
- *Why it matters*: it's the platform monetizing its own accumulated pattern-recognition (across every customer) as a service, and it protects researcher goodwill too — a report closed instantly as "duplicate" by a specialist reads as fair; the same closure from an overwhelmed, inexperienced org team reads as dismissive.
- *Without it*: organizations either hire their own triage staff (expensive, slow to reach competence) or researchers get inconsistent, slow first responses that erode trust in the specific program.
- *Could Unpatched solve it better?* This is a genuine, expensive, staffing-dependent capability — not something to fake with a UI. Unpatched should **not** build a fake "managed triage" toggle with no real staff behind it (that would be exactly the kind of theater `DOMAIN.md`'s "10× principle" and this session's own established convention explicitly reject). This stays deferred until Unpatched has an actual reason and actual capacity to staff it.

**Reputation/Signal/Impact as an access-gating mechanism**
- *Problem*: private-program invitations need *some* signal to select researchers by, beyond "who applied first" — quality-blind invitation produces noise and burns organization trust in the invitation mechanism itself.
- *Why it matters*: it's the platform's answer to "how do we let a good researcher's history unlock more opportunity" without a human curator manually vetting every invitation.
- *Without it*: invitations are either fully manual (doesn't scale past a handful of programs) or fully random (bad researcher-organization matches, wasted researcher time on programs unsuited to their skill).
- *Could Unpatched solve it better?* Unpatched's `reputation_ledger` is *already architecturally superior* to a black-box percentile score for this exact purpose — it's append-only, self-explaining (every fact traces to a real report), and deliberately has no invented scoring formula (`0016`). The opportunity is not to copy HackerOne's opaque score, but to use Unpatched's already-more-transparent ledger as an *explainable* input to invitation-worthiness once program discovery exists — a genuine structural advantage, not a hypothetical one.

**Platform-wide researcher sanctions (escalation-gated, not automatic — corrected in `0025`)**
- *Problem*: a researcher acting in bad faith on one program (extortion attempts, scope violations, harassment) is a risk to every other organization on the platform, not just the one that caught it.
- *Why it matters*: without a cross-program mechanism, the same bad actor simply moves to the next unsuspecting organization — the platform's own safety is the thing at stake, not any one org's.
- *Without it*: every organization independently re-discovers the same bad actor, at real cost, with zero shared learning.
- *Could Unpatched solve it better?* No — this is a case where Unpatched should build the *equivalent* mechanism (a genuine escalation path, evidence-gated, not automatic), not a better one. There's no clever alternative architecture here; the gap is simply real and structural.

**Payment custody by the platform, not the organization**
- *Problem*: identity verification, tax compliance, and cross-border payout logistics are a genuinely specialized, regulated capability an individual organization shouldn't have to rebuild.
- *Why it matters*: it's also a trust mechanism — a researcher trusts the *platform's* payment infrastructure more than trusting 500 individual organizations' own ad hoc payment processes.
- *Without it*: payment reliability is only as good as each organization's own operational diligence — exactly Unpatched's situation today (manual, operator-confirmed, per-org).
- *Could Unpatched solve it better?* Not architecturally — this is genuinely expensive infrastructure (compliance, banking relationships) that's a real business decision, not a product-design one. Section M addresses sequencing, not whether to eventually build it.

---

## D. Three-party Unpatched model

### A. Researcher — Find → Understand → Test → Report → Collaborate → Retest → Earn
Confirmed as the right loop. Unpatched currently implements Test → Report → Collaborate → Earn solidly. Find (discovery) and Retest are structural gaps, not UI gaps — no schema supports either today.

### B. Organization — Create → Define → Launch → Receive → Triage → Decide → Reward → Improve
Confirmed as the right loop, and the one Unpatched implements most completely of the three. "Launch" today is self-certifying (no platform gate) — see Section H.

### C. Unpatched Platform — evaluated, not assumed
The prompt's proposed loop (**Approve → Protect → Observe → Intervene → Resolve**) is close but wrong in one important way: it's phrased as linear/one-shot, like the researcher/organization loops. The platform's job is structurally different — it's a **continuous background loop with triggered branches**, not a per-transaction sequence. The corrected model:

```
Establish trust (once, at onboarding/launch)
        ↓
Observe continuously (background, always running)
        ↓
   ┌────┴────┐
   │ signal   │ → Investigate (triggered by a specific signal, not scheduled)
   └────┬────┘
        ↓
   Intervene (proportionate to what was found)
        ↓
   Resolve and record (closes the loop, feeds back into Observe)
```

What the platform **uniquely owns**, evaluated against the "does this actually need to be platform-level, not organization-level" test:
- **Marketplace trust** (the shared reputation of "is this platform worth researchers' time") — yes, uniquely platform, since one org's failure damages everyone's trust in the platform, not just that org.
- **Researcher safety across programs** — yes, uniquely platform, per Section C above's sanctions reasoning.
- **Program launch quality gate** — yes, but only as a *review*, not a content judgment (the platform shouldn't judge whether a program's *scope* is a good idea — that's the org's business call — only whether the org has demonstrated basic operational readiness, mirroring the review→active seam already in the schema).
- **Disputes** — yes, uniquely platform, since neither party can be a fair judge of their own disagreement.
- **Payment integrity** (visibility into failures, not necessarily custody) — yes for visibility; custody is a separate, later, business decision (Section M).
- **Platform integrity/system health** — yes, trivially, since no one else can own the platform's own infrastructure.
- **Abuse prevention** — yes for cross-org pattern detection specifically (the thing no single org can see); individual-program moderation stays with the org.

---

## E. Researcher product loop

| Stage | Unpatched state | Gap |
|---|---|---|
| Find | **Missing entirely** | No program-visibility column, no discovery query, no public listing |
| Understand | Partial | Scope is real and visible once invited; no upfront reward-range/bounty-table visibility before committing time |
| Test | Real | Scope matching, canonicalization, most-specific-match all solid |
| Report | Real | Submission, evidence, frozen scope-snapshot all solid |
| Collaborate | Real | Messaging, evidence exchange both real |
| Retest | **Missing entirely** | No schema support — terminal states have no exit transition by design |
| Earn | Real (mechanism) / Partial (custody) | Bounty decision is real and auditable; payment is manual-provider-only |

## F. Organization product loop

| Stage | Unpatched state | Gap |
|---|---|---|
| Create | Real | `create_organization` works, but with the trust-model gap (Section 9-equivalent, carried from `0024`) |
| Define | Real | Scope, bounty policy, program creation all solid |
| Launch | **Self-certifying only** | `submit_program_for_review`/`activate_program` exist but both are callable by the same org's own owner/security_admin — no platform party ever reviews anything |
| Receive | Real | Report submission composes researcher/scope/lifecycle authorization correctly |
| Triage | Real | Full, rigorous state machine |
| Decide | Real | Terminal outcomes, immutable-once-terminal severity |
| Reward | Real (mechanism) | Versioned, immutable policy; separate recommend/finalize authorization |
| Improve | **Missing** | No program-quality/health signal exists for an org to see "is my program actually working" (response time, resolution rate, researcher satisfaction) |

## G. Platform product loop

| Stage | Unpatched state |
|---|---|
| Establish trust | **Missing** — no onboarding gate, no program-review consumer |
| Observe | **Missing** — no cross-org visibility of anything, including data that already exists (dead letters, failed deliveries) |
| Investigate | **Missing** — no evidence-gathering surface, no dispute intake |
| Intervene | **Missing** — no suspension/approval/override authority exists anywhere |
| Resolve and record | **Missing** — no audit trail exists for a platform-level action, because no platform-level action can happen |

---

## H. Marketplace blockers — the full chain, arrow by arrow

```
Organization                          REAL          create_organization works (trust-model caveat carried from 0024)
  ↓ Create program                    REAL          create_program (owner/security_admin, org-authorized)
  ↓ Prepare program                   REAL          scope entries, bounty policy versions all real and enforced
  ↓ Submit for review                 PARTIAL       submit_program_for_review exists, but "review" has no platform reviewer —
                                                     it's a self-declared readiness flag, not a gate anyone else checks
  ↓ Platform approval?                MISSING       no platform actor exists to approve or reject anything
  ↓ Publish                           WRONG ARCHITECTURE  "publish" isn't a distinct concept from activate_program; activation
                                                     is treated as equivalent to going live, but there is no visibility flip
                                                     because visibility itself doesn't exist as a column
  ↓ Researcher discovery               MISSING      no program_visibility column, no discovery query, no public listing page
  ↓ Participation                     PARTIAL        real once invited; zero discovery-driven application path exists
  ↓ Testing                           REAL           scope enforcement, canonicalization, most-specific-match all solid
  ↓ Report                            REAL           submission, evidence, frozen scope snapshot
  ↓ Triage                            REAL           full state machine, row-locking proven under real concurrency
  ↓ Resolution                        REAL           terminal states, immutable confirmed severity
  ↓ Retest                            MISSING        no exit transition from any terminal state exists at all
  ↓ Bounty                            REAL           versioned policy, frozen decision, separate recommend/finalize
  ↓ Payment                           PARTIAL         real ledger/state machine; manual provider only, no platform custody
  ↓ Reputation                        REAL           append-only, provenance-checked, idempotent under concurrency
```

**Reading this chain**: the marketplace is broken at exactly one structural joint — "Submit for review → Platform approval? → Publish → Researcher discovery" — four consecutive arrows that are PARTIAL/MISSING/WRONG ARCHITECTURE/MISSING. Everything before it (org creation through program preparation) and everything after the joint resumes (participation through reputation, once a researcher is actually in) is real or only mildly partial. This is the single highest-leverage place to intervene, and it directly explains why Section S's recommendation targets that joint specifically.

---

## I. Critical missing capabilities (audit table)

| Capability | Current Unpatched state | Competitor precedent | Why it matters | Severity | Strategic priority | Recommended action |
|---|---|---|---|---|---|---|
| Program visibility | No column exists | Multi-tier (public/registered/application/private), all 3 | Structural prerequisite for any researcher acquisition beyond manual invitation | Critical | P0 | New column + RLS-safe discovery query (smallest viable: two states) |
| Platform review of program launch | Self-certified only | HackerOne: explicit approval + activity threshold | Marketplace trust — an unvetted program damages the whole platform's reputation, not just its own | Critical | P0 | Requires platform-admin actor to exist first (Section L) |
| Retest mechanism | Absent entirely | Universal across all 3 | Researcher can't confirm a fix landed; organizations can't close the loop on "verified fixed" | High | P1 | Narrow state-machine addition, no new domain |
| Cross-program researcher suspension | Per-program only | Escalation-gated platform-wide sanction, all 3 | A bad actor removed from one program is free everywhere else | High | P0 | Requires platform-admin actor to exist first |
| Payment custody/failure visibility | Org-scoped only; platform-wide invisible | Platform is the processor, all 3 | No one can see a systemic payment problem across organizations | High | P1 | Read-only cross-org visibility first (not custody) |
| Dispute mechanism | Absent for both sides | HackerOne/Bugcrowd named mediation function | Neither side has recourse when they believe an outcome was unfair | Medium | P1 | Needs a platform actor to adjudicate; can start as a simple flagged-report queue |
| Organization onboarding/verification | None — instant, self-serve, unrestricted | Sales-assisted (HackerOne/Bugcrowd) or CSM-reviewed launch checklist (Intigriti) | Unpatched currently trusts every organization identically regardless of track record | Medium | P1 | Section 9-equivalent decision already made in `0024`: gate the *program going live*, not the org shell |
| Program health/quality signal | Absent | Not directly competitor-documented, but implied by response-time/reward tables | Organizations can't see if their own program is actually working | Low-Medium | P2 | Real, derivable from existing data (time-to-first-response, resolution rate) — no new domain needed |
| Abuse/fraud signal foundation | Absent | Documented posture (HackerOne), no tooling internals disclosed by any | Duplicate accounts, collusion, mass-low-quality submission have zero detection | Medium | P2 | Start with a simple velocity/duplicate-account heuristic, not ML |
| System health visibility | stdout-only | All 3 publish public status pages | No one, including Unpatched's own operators, has a persisted view of worker/provider health | Low | P2 | Cheap — persist what's already logged |

### Decision matrix (the specific 15-area scoring this audit requires)

Evidence-based, not arbitrary — each score is backed by the specific finding it references (`0024`/`0025`/this document's own sections).

| Area | Unpatched today | Competitor baseline | Unpatched opportunity | Priority |
|---|---|---|---|---|
| Researcher discovery | Missing — no `program_visibility` column exists at all (Section H) | Multi-tier public/registered/application/private, all 3 | Genuine acquisition unlock, but only once the review gate (below) exists to make public exposure safe | P0 |
| Program trust | Self-certified only — `submit_program_for_review`/`activate_program` both callable by the same org (Section H) | Platform-approved launch (HackerOne explicit; Intigriti CSM-reviewed checklist) | The single highest-leverage joint in the whole chain (Section H) | P0 |
| Reporting | Real — submission, evidence, frozen scope snapshot, all live-tested across prior slices | Structured forms, custom fields (HackerOne) | Unpatched already matches or exceeds on rigor; no gap | — |
| Triage | Real — hardcoded-target-status RPCs, row-locked, concurrency-proven | Managed (staffed) first-pass triage, all 3 | Legibility (Section K.2) over managed-triage-as-a-service (P3, staffing-dependent) | — |
| Retesting | Missing entirely — no exit transition from any terminal state | Universal across all 3 | Real, bounded gap — narrow state-machine addition, no new domain | P1 |
| Reputation | Real, append-only, self-only, non-scored (`0016`) | Opaque percentile scoring, all 3 | Already structurally superior — make it a stated product claim (Section K.1), don't copy the opacity | Differentiator, not a gap |
| Organization workflow | Real and thorough — full lifecycle, member roles, audit | Comparable across all 3 | Program health/quality signal is the one real, cheap addition (Section I) | P2 |
| Payments | Real ledger/state machine, manual provider only, org-scoped visibility | Platform-custodied, all 3 | Sequence visibility before custody (Section M) — do not jump straight to a provider | P1 (visibility) / later (custody) |
| Platform operations | ~5% — confirmed dead scaffolding only | All 3 have a real internal-ops layer (Section 1 of `0025`) | The entire Section S recommendation | P0 |
| Moderation | Absent — no org-level or platform-level moderation queue of any kind | Per-program (org) + platform-wide escalation (all 3) | Needs platform-admin foundation first, then a real moderation queue | P0 (foundation) / P1 (queue) |
| Disputes | Absent for both sides | Named mediation function (HackerOne, Bugcrowd); absent from Intigriti's public docs | Real, unaddressed gap — start with researcher-initiated flagging | P1 |
| Abuse prevention | Absent — no fraud signal of any kind | No platform documents fingerprinting/scoring either (confirmed absence, `0025`) | Low competitive urgency (no one else discloses sophisticated tooling); still a real gap once at scale | P2 |
| Notifications | Real routing/preferences/delivery state machine; real (Resend) provider now wired; failures invisible to everyone | Multi-channel (Slack/Teams/SMS), all 3 | Failure visibility (Section I) matters more than channel breadth | P1 (visibility) / P3 (channels) |
| API | Real — one representative endpoint, stable envelope, CODE→status map, rate-limited | Full public API + webhooks, all 3 | Not yet a differentiator or urgent gap; deepen only with real integration demand | P3 |
| Reliability | Strong within a single organization (row-locking, idempotency, concurrency all proven live); zero cross-org recovery visibility | Documented SLAs/status pages, all 3 | Section S directly — the cheapest, most concrete fix available | P0 |

---

## J. Competitor features Unpatched should NOT copy (and why)

- **A configurable permission-group builder (HackerOne's Groups system)** — this is the most complex end of any competitor's RBAC model. Unpatched doesn't yet have enough program-level role granularity to justify it (still one role: `manager`) — building a permission IDE before there's a second or third role to combine would be pure premature complexity, confirmed by `0024`'s own RBAC analysis.
- **Percentile-ranked, opaque reputation scoring** — directly contrary to Unpatched's own established design principle (`0016`: "no score, ranking, badge, or leaderboard... not from a mutable score column"). Unpatched's append-only, explainable ledger is a deliberate, already-made-correctly decision; competing on "our score is more sophisticated" would be racing in the wrong direction. See Section K.
- **Automatic, non-escalated platform-wide bans** — the corrected finding from `0025`: even HackerOne's bans are program-specific by default. Building automatic cross-program sanctions from a single incident report would be *more aggressive* than the actual competitor precedent, not merely matching it — a real fairness risk to avoid.
- **Elaborate marketplace ranking/leaderboards** — same reasoning as reputation scoring; would require inventing a scoring formula `0016` explicitly declined to invent, purely for a competitive-feature-parity reason with no evidence it improves researcher retention over an honest, evidence-linked ledger.
- **Dozens of notification channels (Slack/Teams/SMS/push/digest)** — already correctly deferred (`0017`); a real email provider now works. Adding channels before there's a real usage signal that email alone is insufficient would be speculative surface area.
- **Complex integrations (bi-directional Jira, generic webhooks)** — genuinely useful once Unpatched has real enterprise customers who need them, but zero evidence yet that this is a blocker for anyone using Unpatched today. P3, not now.
- **Device fingerprinting / IP-based fraud scoring** — none of the three competitors document this even existing; building it now would be inventing infrastructure with no documented precedent and real privacy/complexity cost, for a threat model not yet observed in Unpatched's own data.
- **Huge analytics dashboards / vanity KPI grids** — directly contrary to Unpatched's own visual-system principle (already established: no generic SaaS KPI grids). The platform-ops surface (Section N) should be operational queues, not a metrics wall — this is not a competitor feature to avoid copying so much as a temptation to actively resist when building Section S.

---

## K. Unpatched's 10× opportunities (specific, not "better UI")

**1. Explainable, evidence-linked reputation instead of an opaque score.** Every competitor's reputation mechanism (HackerOne's Signal/Impact percentile, Bugcrowd's trust score) is a black box the researcher cannot fully audit. Unpatched's `reputation_ledger` is *already* structurally superior for this purpose — append-only, provenance-checked against the real report row, no invented formula. The 10× move is to make this a first-class, visible *product* claim ("every reputation fact you have traces to a real report you can open — never a mysterious number"), not just a database property no one sees.

**2. A report state that is never ambiguous.** Unpatched's hardcoded-target-status-per-RPC pattern (no generic status setter, ever) means a report's state is always exactly one of a small enumerable set, with an explicit event/audit record for every transition. Competitors' more organic close-reason taxonomies (HackerOne's 5+ closed states, Bugcrowd's OPEN/ACCEPTED/REJECTED categories layered over sub-states) are more flexible but less legible. The 10× move: make "what happens next, and when" always answerable directly from the state itself in the UI — no report should ever require the researcher to guess or ask.

**3. A fully auditable bounty-policy history, exposed as a real feature.** Because policy versions are immutable and every decision links to the exact version used at calculation time, Unpatched can show a researcher (or a new organization employee auditing past decisions) an honest, reconstructable answer to "why was this bounty this amount" — tied to the actual policy in effect, not a negotiated or discretionary figure. No competitor's documentation claims this level of after-the-fact auditability for their own bounty tables.

**4. Radical authorization transparency as the platform's trust pitch.** Because Unpatched's authorization is genuinely enforced at the RLS layer (not application-layer convention), it is possible to make a *verifiable*, not marketing, claim: "here is exactly what a platform admin can and cannot see about your organization's data" — and have that claim be checkable against real policy definitions, not a privacy-policy PDF. This is the natural product expression of the same rigor that's already made every one of this session's own live-verification passes possible.

**5. Honest, non-gamified operational surfaces for every actor.** Unpatched's own established convention (proven repeatedly this session: no fake security badges, no vanity metrics, real empty states with real explanations) is a genuine point of difference from competitors, who lean into gamification (percentile ranks, streaks, leaderboards) to drive engagement. The 10× move is committing to this as an explicit, stated product principle for the organization and platform surfaces too, not just the researcher-facing reputation page it currently lives on — "every number in Unpatched is real, or we tell you why it isn't yet," applied uniformly.

All five are grounded in architecture Unpatched already has, not features to build from nothing — the opportunity is making existing structural rigor *visible and legible* as a product advantage, rather than building the same opaque mechanisms competitors already have.

---

## L. Platform authority / security model

**Why a real platform-admin authority should exist**: to close the SEE/CONTROL/INVESTIGATE/RECOVER gaps `0025` identified with data that mostly *already exists* — not to replace or override organization authority, and not to revive `platform_role` as-is (its naming collision with organization/program role values, noted in `0024`, should be resolved — either renamed or the unused non-`researcher` values removed — before any real logic is built on it).

**Exact authority (the smallest real version)**:
- Read-only, cross-organization visibility into data that already exists but has no reader today: dead-lettered outbox events, permanently-failed notification deliveries, failed payment attempts, aggregate counts (active researchers, active programs, in-flight reports).
- Ability to change an organization's own `status` (e.g. to a future `suspended`/`archived` state `DOMAIN.md` already anticipates) — a control action, always audited.
- Ability to approve/reject a program's `review → active` transition, once that concept is real (this requires the review step to stop being self-certified — see Section H).
- Ability to set a genuinely platform-wide researcher-suspension flag, distinct from and layered on top of (never replacing) per-program `program_researchers.status`.

**Exact non-authority**:
- **Cannot read report content** (title, description, evidence, messages) without a specific, evidenced dispute or abuse investigation actively open against that report — never blanket browsing of any organization's report data.
- **Cannot modify a bounty amount, a payment record, or any financial figure** — that stays owner/security_admin-only, exactly as today.
- **Cannot initiate or reverse a payment.**
- **Cannot impersonate a user's session, ever** — if a platform admin needs to see something "as" a user for investigation purposes, that must be an explicit, separately-audited, read-scoped RPC (e.g. "view this specific flagged report's metadata"), never a literal credential/session switch. This is a hard line, not a configuration option.

**What requires an audit log entry**: every single platform-admin action, with no exceptions — matching the existing `audit_logs` convention every other sensitive mutation in this codebase already follows.

**What requires dual control** (two distinct platform admins, not one unilateral actor): suspending an organization, platform-wide-banning a researcher, and any action that would halt an organization's ability to operate mid-flight — these are the actions with the largest blast radius and the highest cost of a mistaken or malicious single actor.

**What must remain impossible, structurally, not just by policy**: silent/unaudited access to any private data; mutating a financial record without a required, stored before/after value and reason (mirroring the existing bounty-adjustment pattern exactly); and any platform-admin action that bypasses RLS entirely rather than being expressed as its own narrowly-scoped, `SECURITY DEFINER` RPC with its own explicit check — platform authority should be built the same way every other authority boundary in this codebase already is, not as a service-role backdoor.

---

## M. Payment strategy

**What Unpatched should own vs. delegate**: Unpatched should permanently own the **ledger and state machine** (`payment_obligations`/`payment_attempts`, the finalized-decision-to-obligation snapshot, the attempt history) — this is domain logic, not payment-processing logic, and is already correctly modeled as provider-independent (`lib/payment-provider.ts`). What Unpatched should eventually **delegate** to a real provider is the actual movement of money, identity verification, and tax handling — exactly the specialized, regulated capability Section C's causal analysis identified as genuinely not worth rebuilding.

**Implications for payment state, retries, and visibility**: the manual provider today conflates "the org confirms it happened" with "it actually happened" — there is no independent verification. This is an acceptable, disclosed limitation for a small, trusted beta (per `docs/decisions/0014`'s own framing) but is not a foundation to build a real provider integration on top of *as-is* — the platform-level visibility gap (Section I) must close first, because integrating a real provider without any cross-org failure visibility just moves the same blind spot into a higher-stakes system where real money is actually moving.

**Recommended sequencing relative to the marketplace roadmap**: (1) close the platform-operations visibility gap first (cheap, mostly read-access on existing data); (2) only then consider a real payment provider, and only when there is a genuine multi-organization, real-money need — not speculatively ahead of that need. Integrating Stripe/Razorpay today, before Section L's platform authority exists, would create a worse failure mode than the current manual system: real money moving with zero party able to see a cross-organization problem when it happens.

---

## N. Product information architecture

**Researcher — 5–8 destinations**: Overview/home; **Discover programs** (new — the single missing entry point); My reports; My reputation; Notifications; a payment/payout status view (currently absent as a distinct surface — payment state exists in the domain but has no researcher-facing home beyond the reputation page's incidental mention).

**Organization — 5–8 destinations** (largely already real): Organizations home; Program management (scope, policy, lifecycle — already unified); Report inbox/triage; Members & roles; Payments (currently folded into report detail, not a standalone view); Settings; Audit activity.

**Unpatched Platform — 5–8 operational destinations, explicitly NOT a metrics wall**:
- **Needs Review** — programs awaiting a real platform review before going live (does not exist yet; the queue itself is the product of Section H's fix).
- **Needs Intervention** — flagged organizations, researchers with pending suspension escalations.
- **Needs Investigation** — open disputes, abuse signals surfaced.
- **Needs Recovery** — dead-lettered events, permanently-failed notification deliveries, failed payment attempts, aggregated across every organization (this queue's data already exists today per `0025`'s finding — it is the cheapest of the four to build first, hence Section S).
- **Organizations overview** — a real, honest health signal per org (last activity, program count, unresolved report count) — not a vanity total.
- **Researchers overview** — the ecosystem dimensions `0025` already mapped to real schema (active/participating/submitting/accepted), explicitly marking anything without a real source as a stated gap rather than a fabricated number.

**What should be visible before clicking anything, per actor**: Researcher — what they can test and what it might pay, before committing time to a program. Organization — what needs attention right now (blocked reports, pending payments, expiring invitations), not a raw undifferentiated list requiring the org to infer priority. Platform — literally the four "Needs ___" queues above; zero counters that don't map to an action.

---

## O. Visual/product-design implications

The established visual language (warm canvas, restrained color, editorial typography, technical labels, thin separators, dense operational rows, no gradients/neon/generic SaaS KPI grids) does not need to change. What changes is the *information architecture* layered onto it: every new surface in Section N should default to an operational-queue shape (a list of things requiring a decision, each row answering "what is this, why does it need me, what are my options") rather than a dashboard-of-counters shape — matching the same discipline already applied to the organization workspace's own "what needs attention" framing, extended to the platform tier for the first time rather than introducing a new visual paradigm just because the audience changed.

---

## P. Priority roadmap

**P0 — launch blockers**: platform-admin foundation (read-only, Section L's smallest version); program-review gate stops being self-certified; cross-program researcher suspension escalation path; program visibility column (the Section H joint).

**P1 — required for a serious beta**: retest mechanism; cross-org payment-failure visibility; a minimal dispute/flagging mechanism (start with researcher-initiated, the higher-stakes side); organization program-launch review consuming the now-real review gate.

**P2 — important scale/operations capability**: program health/quality signal for organizations; abuse/fraud signal foundation (simple heuristics, not ML); system health persistence (worker/provider status beyond stdout).

**P3 — later differentiation**: integrations (Jira/Slack/webhooks); a genuine managed-triage-as-a-service offering (only with real staffing behind it); any second program-level role beyond `manager`, once a real need for one surfaces.

---

## Q. Explicitly deferred capabilities

Real payment provider integration (Section M — sequenced after platform visibility, not before). MFA/passkeys (already separately, evidence-gated deferred per `docs/decisions/0023`). A configurable permission-group builder. Percentile/leaderboard reputation scoring. Device fingerprinting/fraud ML. Dozens of notification channels beyond email. Automatic (non-escalated) platform-wide bans. Huge analytics dashboards. All per Section J's reasoning — not silent omissions, disclosed deferrals with a stated reason each.

---

## R. Launch-readiness assessment

Unchanged from `0025`'s nine-axis breakdown (Researcher 55%, Organization 75%, Platform operations 5%, Security 70%, Payment 40%, Notification 45%, Marketplace 0%, Frontend 70%, Backend 75%) — re-affirmed, not re-scored, since nothing has changed in the codebase since that audit. The stage classification (A/B ready, C beta-ready, D/E/F not ready) also stands unchanged. This document's contribution is the *causal* "why" behind those numbers (Sections C, H, I) and the specific next move (Section S), not new measurement.

---

## S. Recommended next slice

**Slice: Platform Operations Foundation — the "Needs Recovery" queue, read-only, on data that already exists.**

**Why this, why now, why Unpatched**: Section H's chain analysis shows the marketplace is broken at one specific joint (program review → platform approval → publish → discovery), and closing that joint *requires* a real platform-admin actor to exist first (Section L) — there is no one to approve a program without it. But building the platform-admin authority in the abstract, or jumping straight to the review-gate feature, risks becoming exactly the "generic platform dashboard" this document was explicitly told to avoid. The cheapest, most concretely justified first step is the one piece of Section L's authority that requires **zero new domain modeling**: `outbox_events` in `dead_letter`, `notification_deliveries` in `permanent_failure`, and `payment_attempts` in `failed` **already exist as real rows today** — they simply have no reader. Exposing them, read-only, to a real (if minimal) platform-admin role is the smallest possible slice that makes the platform tier *real* for the first time, on data that is already correct, rather than inventing new domain concepts (program visibility, retest, disputes) before there's any authority to act on what they'd surface.

**What important product loop does it unlock**: it is the prerequisite for every other P0 item (Section P) — the program-review gate, cross-program researcher suspension, and payment-failure escalation all require a real platform-admin actor to exist and be audited correctly *before* they can be built safely. This slice proves that actor's authority model (Section L) on the lowest-stakes, already-correct data before extending it to higher-stakes actions (suspending an org, banning a researcher).

**Necessary for launch** (stage C/D, per Section R): yes — without it, stage C's own limitation ("any real failure has no operational recovery path") stays true regardless of how much researcher/organization polish is added elsewhere.

**Valuable later, not now**: the full "Needs Review"/"Needs Intervention"/"Needs Investigation" queues (Section N) — each requires new domain capability (a real program-review gate, a real suspension escalation mechanism, a real dispute intake) that this slice deliberately does not build yet, in order to prove the authority model on real, already-existing data first.

**Competitor feature deliberately refused here**: a general-purpose platform-admin dashboard with counters/metrics (Section J) — this slice is explicitly four operational queues over real failure data, not a KPI wall, and explicitly not a permission-group builder or any RBAC complexity beyond the single new role Section L specifies.

**STOP — this is the strategy document. No code, migration, or UI was changed in this slice.**
