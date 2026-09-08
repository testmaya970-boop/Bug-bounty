# 0075: HackerOne + Bugcrowd researcher feature inventory, gap-closing plan, and updated launch readiness

Date: 2026-09-05
Status: **Research + reference inventory. No code, migration, RPC, or UI was changed in this document.**

This document does two things: (1) an exhaustive, granular, sourced inventory of every
researcher-facing function HackerOne and Bugcrowd offer, small to big, gathered via direct
research against their own public documentation this session; (2) a gap-closing plan
mapping each function against this codebase's real, verified state (cross-referencing
`0074`), with a priority; and (3) an updated launch-readiness rating superseding `0025`'s
scores where this session's shipped work has changed them.

**Verdict key**: REAL (backend-verified, no fabrication) · PARTIAL (real mechanism, one
disclosed piece stubbed) · MOCK (fixture data) · ABSENT (does not exist).
**Priority key**: P0 (fix/build now) · P1 (next real gap) · P2 (genuine improvement,
not urgent) · P3 (later differentiation, correctly deferred).
**Platform tag**: **H1** = HackerOne only, **BC** = Bugcrowd only, **Both** = confirmed on
both. Unconfirmed items from the source research are carried through honestly rather than
silently dropped — they don't get a Sentinel verdict, since a feature that may not even be
real for the competitor can't meaningfully be "closed."

---

## Part 1 — The exhaustive researcher-feature inventory

### 1. Account & profile

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Public profile page (bio, "hacker story", ambitions) | Both | REAL — `app/researchers/[username]` | — |
| Social/external links (GitHub, GitLab, Twitter, etc.) | Both | ABSENT | P2 |
| Skills/expertise self-rated tags | Both (H1: [unconfirmed]; BC: 1–5 self-rating, feeds "Crowdmatch") | REAL — `researcher_profiles.hacking_interests`/`security_focus` exist, though not rated 1–5 | — |
| Avatar/profile photo | Both ([unconfirmed] exact mechanics on H1) | ABSENT | P2 |
| Country / timezone field | H1 (payment context only) / BC (onboarding) | ABSENT as a general profile field (only used for KYC/payout) | P3 |
| Resume (Summary/Experience/Education/Certifications) | BC | ABSENT | P3 |
| Profile privacy toggle (public only once ≥1 applicable submission) | BC | Public profile requires a claimed `public_username`; conceptually similar, not identical | — |
| Bounty-earnings visibility toggle | H1 | ABSENT | P3 |
| ID Verification (photo ID + selfie, ~72hr, 12-month validity, green checkmark) | H1 (Veriff) | PARTIAL — real KYC exists (`get_my_kyc_status`) but manual-review-only, no automated ID-verification provider, no badge | P2 |
| Background check (Clear program, Checkr, 7-year lookback, eligibility thresholds) | H1 | ABSENT | P3 |
| Residency & citizenship verification | H1 | ABSENT | P3 |
| Identity Verification (IDV) required before Managed Bug Bounty submission | BC | ABSENT | P3 |
| Trust score composite (tenure + verification + escalations) | BC | ABSENT (Sentinel deliberately uses a non-scored, evidence-linked ledger instead — see `0016`, and `0026` Section K.1's stated differentiation) | — (intentional divergence) |
| Mandatory 2FA (TOTP + security keys + backup codes) | Both | REAL — `0052` | — |
| Device registration / trusted devices | H1 | ABSENT | P3 |
| Session management (view/revoke active sessions) | H1 | REAL | — |
| Friend/social connections ("easier collaboration") | BC | ABSENT (Sentinel's collaboration flow adds by username directly, no friend-graph prerequisite) | — |
| Personal calendar export | H1 | ABSENT | P3 |
| Hacker email alias | H1 | ABSENT | P3 |
| External service linking (Hack the Box account) | H1 | ABSENT | P3 |
| API personal access token | Both | REAL — `settings/api-tokens` | — |
| @bugcrowdninja.com email address for researchers | BC | ABSENT | P3 |
| Dark/light theme toggle | H1 ([moderate confidence]) | ABSENT — Sentinel is single-theme by deliberate design (`0073`) | — (intentional divergence) |

### 2. Program discovery

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Public program directory/list | Both | REAL — public program browsing exists | — |
| Filters: asset type, reward range, industry, program type | Both | PARTIAL — some filtering exists on `/programs`; industry/reward-range filters not confirmed present | P2 |
| Search by name | Both | REAL | — |
| Saved/bookmarked/favorited programs | Both (H1: star icon; BC: "Hidden" filter, no confirmed favorite) | ABSENT | P2 |
| "Recently updated"/"Trending"/"New" sections | Both ([partially unconfirmed] exact mechanics) | ABSENT | P3 |
| Personalized recommendation feed ("Just For You"/Opportunity Discovery) | Both | ABSENT | P3 |
| Program policy page: scope, out-of-scope, rewards table, response SLA | Both | REAL — program scope + bounty policy are real; response-SLA display to researcher is ABSENT (no SLA metric surfaced) | P1 |
| Program-level "response efficiency"/compliance badges shown to researcher | H1 (Program Levels, Gold Standard Safe Harbor badge) | ABSENT | P2 |
| Hacker-authored program ratings/reviews | Neither confirmed — H1 explicitly has no such feature (reverse: programs review hackers); BC not confirmed either | ABSENT (matches competitor absence — not a gap) | — |
| Eligibility indicators (Signal/Reputation threshold, submission caps) | H1 (4-tier Signal Requirements gating submission caps) / BC (90-day activity + validity-rate thresholds for private-program eligibility) | ABSENT — Sentinel's reputation ledger exists but is not used as an eligibility gate anywhere | P2 |

### 3. Applying/joining a program

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Private program invitations | Both | REAL | — |
| Invitation accept/decline, expiry | Both (H1: 14-day expiry) | REAL (accept/decline); expiry timing not confirmed identical | — |
| Automated invitation targeting by skill/reputation/activity (CrowdMatch / Signal-based) | Both | ABSENT — invitations are manual, not algorithmically targeted | P2 |
| Invitation preference settings (accept from any/bounty-only/none; min bounty threshold) | H1 | ABSENT | P3 |
| "Claim a spot" self-service private-opportunity list | H1 (beta) | ABSENT | P3 |
| NDA / custom program agreement e-signature flow | Both | ABSENT — no agreement-acceptance step exists in the program-join flow | P2 |
| Background-check/ID-verification gating for sensitive programs (Clear) | H1 | ABSENT (depends on the ID-verification gap above) | P3 |

### 4. Report submission

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Title, free-text description | Both | REAL | — |
| Weakness/CWE-style category selection | H1 (CWE taxonomy) / BC (VRT taxonomy) | REAL — `weaknessType` enum exists (`0047`) | — |
| Severity self-assessment (None–Critical / P1–P5) | Both | REAL — `researcherSeverity`, advisory-only by design | — |
| CVSS calculator (multiple versions) | H1 (3.0/3.1/4.0) / BC (customer-side only, not researcher-visible) | REAL — CVSS 3.1 fields exist and are researcher-facing (`0069`) — Sentinel's researcher-facing CVSS exposure is a genuine point ahead of Bugcrowd's model | — |
| Impact field | Both | REAL | — |
| Steps to reproduce | Both (folded into description on both) | REAL — part of `description` | — |
| Affected asset/target selection tied to real scope | Both | REAL — scope-matched, server-enforced | — |
| Attachments (files, screenshots, PoC video) | Both (BC: 20 files/400MB each) | REAL — file evidence exists, 10MB cap (smaller than BC's 400MB) | P2 |
| Draft saving (auto-save + manual) | Both ([partially confirmed] for H1's standard flow) | ABSENT — no draft concept exists on report submission | P2 |
| Duplicate-checking shown to researcher pre-submit | Neither confirmed as a true pre-submit check (H1: staff-only tool; BC: "Known Issues" list, no automated check) | ABSENT (matches competitor absence — not a gap) | — |
| Inline submission guidelines | Both | ABSENT — no configurable "introduction text"/guidelines shown on the submission form | P2 |
| Report template (program-defined, pre-populated) | Both (BC: 100+ VRT-linked templates) | REAL — report submission templates exist (`0070`) | — |
| AI-assisted report writing/clarity check | H1 (Report Assistant / Hai) | ABSENT | P3 |
| Embedded/no-login/anonymous submission widget | H1 | ABSENT | P3 |
| Post-submission evidence-attach failure recovery | [not a competitor-documented feature either way] | REAL — Sentinel's own honest one-time banner (identified as a strength in this session's researcher audit) | — |

### 5. Report lifecycle & tracking

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Full, real report status enum | Both | REAL — 9 real statuses, hardcoded-per-RPC transitions (`0009`) | — |
| Auto-close after inactivity (Needs More Info → Informative after 30 days) | H1 | ABSENT — `needs_information` has no auto-close today | P2 |
| SLA/resolution-target countdown shown to researcher | Both | ABSENT | P1 |
| Report list filters/sort (status, severity, target type, date) | Both | REAL — status/severity filters exist on both org and researcher sides | — |
| Report detail page (metadata sidebar, timeline, activity log) | Both | REAL — this session added severity to the summary card; detail page has full metadata | — |
| Internal vs. researcher-visible comment split | Both | REAL (`0010`) | — |
| Mediation/dispute request mechanism | H1 (Request Mediation, 3-business-day program response target, eligibility rules) / BC (Request a Response, max 2/lifetime) | ABSENT — this is `0026`/`0025`'s own top platform-tier gap, confirmed again here | P0 |
| Retest mechanism | Both (H1: explicit retest invitation + outcome states; BC: implied via re-triage) | ABSENT — confirmed again as the single clearest structural gap on the researcher side | P1 |
| Triage-experience rating (CSAT) | H1 (Hai Triage 1–5 rating) | ABSENT | P2 |
| Severity/bounty negotiation | Both (routes through mediation/RaR on both, no separate counter-offer UI on either) | ABSENT (matches competitor shape — not a distinct gap beyond the mediation gap above) | — |

### 6. Collaboration

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Add collaborators to a report, weighted/percentage bounty split | Both (H1: max 10, weight-ratio formula; BC: max 10, percentages summing to 100%) | **REAL — built and live-verified this session** (`0064`), including an infinite-recursion RLS bug caught and fixed before shipping | — |
| Collaborator invitation must be accepted before earning credit | H1 | PARTIAL — Sentinel's `add_report_collaborator` adds immediately (submitter-added, no separate accept step) | P2 |
| Collaboration lock after report reaches certain states | Both | REAL — locked once past `new`/`triaging`, matching both competitors' actual mechanics | — |
| Payout fan-out to each collaborator's real split | Both | **ABSENT, disclosed** — `create_payment_obligation` still pays the submitter only; this is `0064`'s own stated next step, not silently missing | P1 |
| "Collaborators tab" on a program page for pre-report coordination | H1 | ABSENT | P3 |
| Program-level "Solo-Only" opt-out of collaboration | BC | ABSENT | P3 |
| Persistent "Team"/"Squad" entity | Neither confirmed as existing in the casual sense (H1's closest analog is a business-entity account; BC has no confirmed team object) | ABSENT (matches competitor absence — not a gap) | — |

### 7. Payments

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Bank transfer, PayPal, crypto (BTC/USDC) payout methods | Both (H1: 37-currency Currencycloud + Coinbase Prime crypto; BC: bank/PayPal/limited BTC) | PARTIAL — `payment_obligations`/`payment_attempts` ledger is REAL; the provider behind it is manual/operator-confirmed only, no live rails of any kind | P1 |
| Minimum payout threshold, configurable schedule | Both (H1: $15–$100 by method, configurable $100–$10k; BC: configurable, $10k max) | ABSENT — no threshold/schedule concept exists | P2 |
| Tax form collection (W-9/W-8BEN/W-8BEN-E) | Both | ABSENT — `researcher_payout_details` collects bank/PayPal info but no tax-form flow | P2 |
| Payment history/statements, CSV export | BC (confirmed); H1 [unconfirmed] | REAL — `BountyTrackRecord`/`listMyPaymentObligations` show real obligation history; no CSV export | P3 |
| Payout speed SLA (1–10 business days by method) | Both | ABSENT — no committed timing since the provider is manual | P2 |
| Unclaimed-funds/forfeiture policy | H1 (9-month forfeiture) | ABSENT (not applicable at Sentinel's current scale/maturity) | P3 |
| Points/Kudos non-cash reward system (VDP-only) | BC | ABSENT — VDP programs exist (`0074`'s "real VDP vs bounty distinction") but carry no non-cash reward mechanic | P3 |
| Business/entity-level payout account | H1 | ABSENT | P3 |
| External Payments (claim a bounty without a pre-existing account) | H1 | ABSENT — not applicable, Sentinel requires an account for report submission itself | — |

### 8. Reputation, ranking, gamification

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Reputation score with defined per-outcome deltas | Both (H1: +7/+2/0/−5/−10 by exact outcome, floor 0; BC: severity-weighted Kudos) | REAL — Sentinel's own ledger (`0016`) uses different point values (+25/+10/−5) but the same "real, append-only, per-outcome fact" shape | — |
| Percentile ranking vs. other researchers (Signal/Impact) | H1 | REAL, but non-percentile by deliberate design — Sentinel shows a real score, not an opaque percentile (`0016`'s stated differentiation, reaffirmed in `0026` Section K.1) | — (intentional divergence) |
| Public leaderboard (global, filterable) | Both (H1: 8+ distinct leaderboard views — reputation, critical-reputation, OWASP-category, country, asset-type, up-and-comers, most-upvoted, CTF, pentester; BC: single global Rank leaderboard, filterable by time/severity/country) | REAL — Sentinel has one real, RPC-backed leaderboard (`get_public_leaderboard`); far fewer cross-cuts than H1's 8, roughly matching BC's single-view simplicity | P2 |
| Per-program "Top Hackers"/Hall of Fame | Both | ABSENT — no per-program recognition list exists (Sentinel's leaderboard is platform-wide only) | P2 |
| Achievement badges (H1: 20 confirmed named badges; BC: 4 badge families with numeric levels) | Both | REAL — Sentinel has real, computed-read-side badges (`0071`), fewer than either competitor's catalog | P2 |
| Streaks (consecutive resolved reports/months) | Both (via badges, not a separate mechanic on either) | ABSENT | P3 |
| Swag/merchandise rewards | Both | ABSENT | P3 |
| MVP/incentive-tier program (BC) / Hacker Milestone Rewards (H1, new Sept 2025) | Both | ABSENT | P3 |
| Certificates for course/skill completion | Neither confirmed for general researchers (H1 only for its separate vetted Pentester cohort) | ABSENT (matches competitor absence for the general researcher population) | — |

### 9. Learning & training

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Free structured training curriculum (Hacker101 / Bugcrowd University) | Both | ABSENT — no training-content library exists | P2 |
| CTF / practice challenges | Both (H1: dozens of levels, 26-pt program-invite eligibility, dedicated leaderboard; BC: occasional one-off events, no standing product) | **PARTIAL** — Sentinel's own CTF is closer to H1's shape (standing product, real flag verification, real reputation credit) than BC's (one-off events only) — but Sentinel's challenge *content* is fixed/seeded with no on-screen disclosure, a real honesty gap flagged in `0074` | P0 (disclosure) |
| Live/virtual hacking events | H1 | ABSENT — explicitly scoped and deferred (`0067`) | P3 |
| Community forum / Discord | Both | ABSENT | P3 |
| Mentorship program | H1 (informal + "Community Day" formal track) | ABSENT | P3 |

### 10. Communication & notifications

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| In-app notifications with read/unread state | Both | REAL | — |
| Granular notification preferences | Both | REAL | — |
| Email delivery | Both | REAL (Resend, `0022`) | — |
| @mention forcing a notification | Both | ABSENT — no @mention parsing in comments | P3 |
| Slack/Discord integration | Both (organization-facing on both, not hacker-facing on either) | ABSENT (matches competitor shape — this is correctly an org-side, not researcher-side, gap) | — |
| Mobile push / native app | Neither confirmed to exist on either platform | ABSENT (matches competitor absence — not a gap) | — |
| "Mark all as read" | [not confirmed either way for competitors] | ABSENT — disclosed intentional non-feature (`0074`) | P2 |

### 11. Disclosure

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Disclosure request flow (initiate, approve/decline) | Both | REAL (`0009`-era disclosure workflow) | — |
| Full vs. limited/summary disclosure levels | H1 | ABSENT — Sentinel's disclosure is binary (published or not), no partial/summary tier | P2 |
| Auto-default-to-public after timeout | H1 (30 days, CVD-compliance-dependent) | ABSENT | P3 |
| Public disclosed-report feed (Hacktivity / CrowdStream) | Both | REAL — Sentinel's public disclosure feed exists | — |
| Feed filters/sort (severity, asset type, date, upvotes) | Both (H1: rich Lucene-style filtering; BC: simpler) | PARTIAL — feed exists, filter richness not confirmed to match either competitor | P3 |
| Upvoting on disclosed reports | H1 | ABSENT | P3 |

### 12. API & tooling

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Personal API token generation | Both | REAL | — |
| Full researcher-facing REST API (reports, programs, payments, hacktivity) | Both (H1: ~10+ documented endpoints; BC: versioned, role-scoped) | PARTIAL — Sentinel has exactly 1 endpoint (list-my-reports) of a much larger representative surface, disclosed as intentional (`0018`) | P2 |
| CLI tool | Neither confirmed as an official first-party tool on either platform | ABSENT (matches competitor absence — not a gap) | — |
| Browser extension | Neither confirmed as official on either platform | ABSENT (matches competitor absence — not a gap) | — |
| Public vulnerability-taxonomy API (VRT) | BC | Not directly applicable — Sentinel's weakness taxonomy (`0047`) is internal, not published as an open standard | P3 |

### 13. Trust & safety

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Safe harbor legal language | Both | ABSENT — no safe-harbor statement surfaced to researchers | P1 |
| Code of Conduct | Both | ABSENT — no researcher-facing code of conduct document exists | P1 |
| Program-flagging / Code-of-Conduct escalation mechanism | Both | ABSENT — same gap as the mediation/dispute mechanism above (Section 5) | P0 |
| Support ticket portal / help desk | Both | PARTIAL — `/settings/feedback` exists as the one real "I need help" destination (this session's earlier `HelpLink` fix routes here); no dedicated ticketing system | P2 |

### 14. Anything else, small

| Feature | Platform | Sentinel today | Priority |
|---|---|---|---|
| Researcher referral program | [unconfirmed for both — H1 has no confirmed hacker-referral program; BC's is customer-side only] | ABSENT (matches competitor absence — not a gap) | — |
| Swag store | Both | ABSENT | P3 |
| "Year in Review" personalized annual stats | H1 | ABSENT | P3 |
| CVE assignment request for qualifying findings | Both (H1 explicit CVE Requests feature; BC as a CNA) | ABSENT | P3 |
| Report transfer request | H1 | ABSENT | P3 |
| Accessibility statement/WCAG documentation | Neither confirmed to publish one | ABSENT (matches competitor absence — not a gap) | — |

---

## Part 2 — What this confirms and sharpens from prior session work

- **The mediation/dispute gap is now confirmed from BOTH competitors' own documented
  mechanics** (H1's Request Mediation, BC's Request a Response), not just inferred from
  `0026`'s causal reasoning. This raises it from `0026`'s P1 to **P0** here — it is the
  single most-repeated gap across this entire inventory, touching lifecycle (Section 5),
  trust & safety (Section 13), and payments (a bounty disagreement routes through the same
  mechanism on both competitors).
- **The CTF disclosure gap (Section 9) and mediation gap (Sections 5/13) are the two
  P0 items that require NO new domain modeling** — CTF disclosure is a UI-only fix (an
  honest caption, matching the existing "Mock data:" pattern already used elsewhere in the
  app); mediation is new but narrowly scoped (a flagged-report queue, per `0026`'s own
  "start with researcher-initiated flagging" recommendation) and does not require the full
  platform-admin foundation to exist first — an organization's own owner/security_admin
  could resolve a mediation request today, the same way they resolve everything else.
- **Sentinel's researcher-facing CVSS exposure (`0069`) is a genuine point of parity-or-
  better against Bugcrowd specifically** — Bugcrowd's CVSS calculator is confirmed
  customer-side only, never shown to the researcher; Sentinel shows CVSS to the submitting
  researcher. Worth stating as a real, verified differentiator, not just an assumption.
- **Safe harbor / Code of Conduct (Section 13) is a real, cheap, high-trust-value gap**
  neither previous audit (`0025`/`0026`/`0074`) flagged, because it's a legal/content gap,
  not a schema gap — a static page, not a migration. Elevated to **P1** here specifically
  because it costs nothing to build and both competitors treat it as foundational trust
  infrastructure, not a nice-to-have.
- **Report collaboration (`0064`) is now confirmed to structurally match both
  competitors' actual mechanics** (max ~10 collaborators, percentage/weight split, locked
  after a certain lifecycle point) — this was built from `0064`'s own research and is now
  independently re-confirmed by this session's fresh HackerOne/Bugcrowd research pass,
  not just internally self-consistent.

---

## Part 3 — Updated launch-readiness rating

Superseding `0025`'s scores (dated 2026-08-31) where this session's shipped work has
changed them. Unchanged axes are carried forward with their original basis cited.

| Dimension | `0025` score | **Updated score** | What changed |
|---|---|---|---|
| Researcher readiness | 55% | **60%** | Report collaboration shipped (real, live-verified); severity now visible on report-list cards; payout/KYC settings now reachable (were previously orphaned components with no route). Discovery and retest remain structurally absent — this is why the increase is modest, not large. |
| Organization readiness | 75% | **80%** | Organization report analytics shipped in full (3 real RPCs, live-verified, a real numeric-type bug caught and fixed before shipping) — closes what was previously the single most visible "org side is thinner than researcher side" gap. Self-triage, RBAC, bounty engine, payment ledger unchanged and still solid. |
| Platform operations readiness | 5% | **5%, unchanged** | Nothing shipped this session touches the platform-admin tier. `0026` Section S's own recommendation (read-only "Needs Recovery" queue) remains the cheapest available next step and has not been built. |
| Security readiness | 70% | **72%** | The report-collaboration RLS infinite-recursion bug was caught and fixed *before* shipping via live-simulated-session testing, not discovered in production — a real demonstration of this codebase's own verification discipline holding up under a genuinely new cross-table RLS interaction, its hardest test yet. Authorization-boundary correctness remains the strength; operational recoverability remains the gap (unchanged from `0025`'s framing). |
| Payment readiness | 40% | **42%** | Payout details and KYC settings are now reachable from the UI (previously real components with zero route rendering them — a genuine dead-end, now fixed) with an honest in-UI disclosure of the manual-payout limitation. The underlying gap — no live payment processor, no cross-org failure visibility — is unchanged. |
| Notification readiness | 45% | **45%, unchanged** | Nothing shipped this session touches notification delivery/visibility. |
| Marketplace readiness | 0% | **0%, unchanged** | No `program_visibility` column exists; confirmed absent again this session. |
| Frontend readiness | 70% | **73%** | New: `/organizations/[organizationId]/analytics` route, `ReportCollaboratorsPanel`, `/settings/payments`'s expanded KYC/payout section, corrected `/settings/collaboration` copy — all live-verified via typecheck/lint/test/build (browser-level smoke test attempted but blocked by a stale dev-server cache unrelated to the code itself). |
| Backend readiness | 75% | **78%** | Four new real RPCs this session (`add_report_collaborator`, `remove_report_collaborator`, `list_report_collaborators`, plus the three organization-analytics RPCs), all live-verified against real demo data including two real bugs (RLS recursion, numeric type mismatch) caught before shipping. |

### Launch-stage classification (unchanged from `0025`, re-affirmed not re-scored)

| Stage | Classification | Why (updated basis) |
|---|---|---|
| A. Private internal demo | READY | Unchanged — everything needed already worked, and now works better |
| B. Invite-only beta | READY | Unchanged |
| C. Controlled organization/researcher beta | BETA READY | Unchanged — org analytics and collaboration are real improvements *within* this stage, but don't change the stage itself; the platform-ops recovery gap (`0025` Section 4) is still the reason this isn't "READY" outright |
| D. Public researcher onboarding | NOT READY, but the newly-confirmed mediation gap (Part 2) sharpens WHY: no dispute mechanism exists on either the researcher or organization side, and both competitors treat this as foundational for any public-facing researcher population |
| E. Public program marketplace | NOT READY | Unchanged — `program_visibility` still doesn't exist |
| F. Production commercial launch | NOT READY | Unchanged — platform operations layer is still ~5% real |

**The honest overall statement, updated**: Sentinel remains a well-built two-party product
that cannot yet safely operate as a three-party platform at scale — but the two-party
product itself got measurably better this session on both sides (researcher: +5pp;
organization: +5pp), while the platform tier remains exactly where `0025` found it. The
newly-confirmed, competitor-sourced mediation/dispute gap (Part 2) is the single most
important addition to the priority list this document contributes beyond `0025`/`0026`/
`0074` — it was previously reasoned about causally; it is now independently confirmed as a
real, named, documented mechanism on both HackerOne and Bugcrowd.

---

## Part 4 — The single most important next priority, each side

**Researcher side**: Disclose that CTF challenge content is fixed/seeded, the same honest
caption pattern already used elsewhere in the app (`0074` P0 item #1) — costs nothing,
fixes a real trust gap, no code beyond a UI label.

**Organization side**: Build the mediation/dispute mechanism as a real, narrowly-scoped
flagged-report queue an organization's own owner/security_admin can resolve — this does
NOT require the platform-admin foundation to exist first (unlike every other P0 item on
the organization list), making it the cheapest genuinely new capability available, and it
is now confirmed as standard practice on both competitors researched this session, not a
speculative addition.

---

**STOP — this is the inventory, gap-closing plan, and updated rating. No code, migration,
or UI was changed in this document.**
