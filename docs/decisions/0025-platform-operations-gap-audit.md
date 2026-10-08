# 0025: Platform operations + three-perspective gap audit

Date: 2026-08-31
Status: **Research only. No code, migration, or UI changes were made in this slice, per explicit instruction.**

This document builds directly on `docs/decisions/0024-three-perspective-product-model.md`, which established that Unpatched behaves as `Researcher ↔ Organization` while serious bug-bounty platforms operate as `Researcher ↔ Organization ↔ Platform`. This slice goes deeper specifically on the missing third tier: what a **platform operations team** — the company running Unpatched, not a customer, not a researcher — actually needs to see, control, investigate, and recover from, researched against current HackerOne/Bugcrowd/Intigriti product mechanics and audited directly against Unpatched's real schema and code. Every Unpatched claim below was verified against the actual migration/RLS/RPC/route, not inferred from progress reports or prior summaries.

---

## 1. Competitor research: product mechanics (not vanity metrics)

`0024` already researched, with sources, the Researcher and Organization perspectives in depth, plus a first pass at platform-level items (program launch approval, managed triage staff, mediation teams, platform-wide bans, payment custody). That material is not repeated here — see `0024` for the full sourced writeup. This section adds the specific platform-*operations* depth this slice asked for.

### Organization-level vs. program-level vs. report-level permissions (the distinction this task specifically asked to isolate)

All three competitors draw this three-way line explicitly:
- **HackerOne**: Organization Admin (cross-program) vs. customizable Groups (Read only / Program admins / Rewards / Report), assignable per program; finer org-wide roles (User Manager, Groups Manager, Assets Manager, Assets Viewer) sit above program Groups. Report-level action (closing a report, awarding a bounty) is gated by the **Rewards**/**Report** group permissions specifically, not just program membership.
- **Bugcrowd**: Organization (Owner / User Admin / Member) strictly layered on Program (Administrator / Analyst / Viewer) — Organization User Admin is deliberately walled off from *all* report/submission data, a clean org-vs-program separation with no report-level sub-permission beyond the program role.
- **Intigriti**: Company (Admin / Member) vs. Program (Admin / Editor / Member / Reader) — four program-level tiers, more granular than Bugcrowd's three, still no distinct report-level permission beyond the program role.

**Unpatched today**: has exactly the same three conceptual layers (organization role, program-level `program_members.role`, and report visibility derived from both) but only **one** program-level role (`manager`) and **no report-level permission distinct from program membership** — a report is visible to any `program_members` row for that program, full stop; there is no "Viewer"/"Reader"-equivalent restricted role at either the program or report layer. This confirms `0024`'s RBAC finding and sharpens it: Unpatched's program-role granularity is coarser than all three competitors, not just Bugcrowd/Intigriti.

### Deeper platform-operations findings (FACT / VENDOR CAPABILITY / INFERENCE)

A dedicated follow-up research pass (official docs only, same three platforms) targeted the specific internal-operations questions this task asked for. Every finding below is tagged FACT / VENDOR CAPABILITY / INFERENCE, with "no official documentation found" stated plainly wherever a platform simply doesn't publish on a topic, rather than assumed absent.

**Organization onboarding & verification**: No platform publishes a formal KYB checklist for customer organizations. HackerOne's enterprise setup is sales-led (a sales rep guides setup — VENDOR CAPABILITY); Bugcrowd assigns a named **Implementation Engineer** with a Day 0–7 kickoff (FACT); Intigriti's launch checklist references a **Customer Success Manager**/**Onboarding Manager** doing a "final program review" before launch (FACT). HackerOne does publish real KYC for *researcher* business accounts (legal name, jurisdiction, annual re-verification) — but that's researcher-entity verification, not organization-side.

**Program approval — what's actually reviewed**: HackerOne requires ≥10 reports and ≥100 invited hackers before public launch unlocks (FACT), with no published rejection criteria beyond an "exclusion list" recommendation. Intigriti's checklist explicitly covers scope/priority definition, test-credential readiness, dev-team capacity, integration setup, and **budget sufficiency specifically to avoid the platform's own auto-suspension mechanic** (FACT). None publish a review-turnaround SLA or formal rejection criteria (INFERENCE: rejection likely happens informally on a review call, not via a documented gate).

**Payment oversight & failed-payout recovery**: Intigriti explicitly documents a **"Failed"/"Error"** payout state and states "the Intigriti team works together with the researcher to resolve the problem so the payout can be retried" (FACT), with a published SLO target of ≤1 month post-validation. Bugcrowd explicitly limits its own liability for provider-side failures (PayPal) — "Bugcrowd does not have the authorization to contact them on your behalf," pushing resolution back to the researcher (FACT). **No official HackerOne documentation was found on failed-payout recovery at all.**

**Abuse/fraud investigation tooling**: HackerOne is the only one of the three with any documented investigation posture — it defines "duplicate account abuse" and states it "investigates fully... will speak to all parties involved" (FACT), but **explicitly confirms bans are program-specific by default**, not automatically platform-wide (FACT — a materially different, narrower claim than `0024`'s prior framing of "platform-wide bans," worth correcting: platform-wide action is a possible *escalation*, not the default consequence). **No documentation on device fingerprinting, IP analysis, or risk-scoring was found for any of the three** — this is a genuine absence, not merely undocumented internals.

**Platform-wide researcher visibility for staff**: HackerOne's customer-facing audit logs are explicitly **program-scoped**, not cross-program (FACT). Signal/Impact/Reputation percentile scores ARE explicitly cross-program (FACT) — the closest documented construct to platform-wide researcher visibility, though exposed to researchers/orgs as a feature, not confirmed as an internal admin tool. No platform documents an internal "view this researcher across all customers" console (INFERENCE: near-certainly exists internally to compute cross-program scores, but is not itself documented as a product surface).

**Support/escalation channels**: Intigriti publishes the most concrete tiered SLA of the three — P1: 10-min response/4-hr resolution down to P4 best-effort, 95% compliance target (FACT). Bugcrowd publishes concrete ticket SLAs (2-business-day acknowledgment, 10–15 business day resolution) and separate escalation mailboxes for researcher issues vs. payment issues (FACT). HackerOne documents a named Customer Success Manager as "a point of contact for escalations, mediation, and platform support" (FACT).

**System health/status pages**: All three publish a public status page (HackerOne, Bugcrowd, Intigriti) covering uptime/maintenance; Intigriti's is the most concrete in official docs, with a committed maintenance-notice window (≥2 weeks for planned work, prompt notice for >20-minute unplanned downtime) (FACT).

**Platform announcements/policy changes**: All three maintain dated, versioned changelogs and versioned Code-of-Conduct documents (FACT for all three) — this is a genuinely universal, low-complexity pattern.

**Provider/integration failure handling**: Intigriti's Slack integration docs explicitly name two failure modes (activation failure, silent non-delivery if the app wasn't pre-added to the channel) and recommend the in-platform notification as a fallback (FACT) — the single most concrete "what happens when an integration fails" disclosure found. Bugcrowd again explicitly disclaims responsibility for PayPal-side failures. No HackerOne documentation was found on webhook or email-provider failure handling.

**Operational queues**: HackerOne documents the most concrete internal queueing concept — an "Agentic Validation" auto-triage layer that either auto-routes or **queues a report for manual intake review by a human analyst** (FACT), plus a "program inbox queue" concept tied to the Pending-Program-Review state. Intigriti's managed-triage workflow is queue-shaped (validate reproducibility → check duplicates → confirm scope → assign severity) with internal-only notes distinct from researcher-facing messages (FACT). **No documentation of an internal staff dashboard/queue (e.g. "programs pending launch review") was found for Bugcrowd.**

**Correction to carry forward from `0024`**: that document's framing of "platform-wide bans" as the default competitor behavior is too strong per this deeper pass — HackerOne explicitly documents that bans are **program-specific by default**, with platform-wide action being a possible escalation for repeated/severe misconduct, not the standard consequence. This nuance matters for Section 14/Slice 2 below: Unpatched's gap is real (no cross-program suspension mechanism exists *at all*, not even as an escalation path), but the target model to aim for is "a platform-wide escalation path exists for severe/repeated cases," not "every suspension is automatically platform-wide."

---

## 2. Unpatched re-audited directly (not trusting prior progress claims)

Every item below was re-verified this slice against the actual migration file, RLS policy, or grant statement — not carried over from a summary.

### New findings beyond `0024` (failure-recovery visibility)

| Failure mode | Who can see/act on it today | Source |
|---|---|---|
| An outbox event reaches `dead_letter` (e.g. a `report.created` event that failed 5 times) | **No one.** `outbox_events`/`outbox_event_receipts` are revoked from `authenticated`/`anon` entirely, granted only to `service_role`; the worker is a standalone process never imported by the app. There is no product surface — not even an organization owner's own — that can see a dead-lettered event exists. | `202608290002_outbox_event_foundation.sql` |
| A notification email permanently fails to send (`notification_deliveries.state = 'permanent_failure'`) | **No one.** RLS is enabled but has **zero policies**, and grants are `service_role`-only (`select, insert`, plus a narrow `update` on specific columns) — not even the affected recipient can see their own delivery failed. | `202608290004_notification_routing_and_delivery_foundation.sql` |
| A payment attempt fails (`payment_attempts.state = 'failed'`) | **The owning organization's own owner/security_admin only** — real RLS read access exists here, unlike the two rows above — but this is strictly organization-scoped. Nothing is visible platform-wide across all organizations' failed payments. | `202608290001_payment_ledger_and_payout_orchestration.sql` |
| A rate limit is being hit hard (`private.rate_limit_counters`) | **No one** — table lives in the `private` schema, never exposed via any RPC, no read policy of any kind exists for it. | `202608290005_production_hardening_foundation.sql` |

This establishes a clean severity ordering: **event-processing and email-delivery failures are invisible to literally everyone**; **payment failures are visible only within the one affected organization**; **abuse/rate-limit signals are invisible to everyone**. Nothing in Unpatched today is visible *across* organizations to anyone except a raw database connection.

### Re-confirmed from `0024` (not re-derived, cited for completeness)
- `platform_role` enum exists (`researcher`/`organization_owner`/`program_manager`/`triager`/`platform_admin`, default `researcher`); **nothing in any migration ever sets it to anything but the default**; `requirePlatformAdmin()` has zero call sites outside its own definition and unit test.
- `create_organization`'s only check is `actor is null` — every authenticated identity type succeeds, live-tested across 5 identities (pure researcher, org owner, non-owner org member, stranger, anonymous) — only anonymous is rejected.
- No `program_visibility` column exists on `public.programs` at all — every program is invite-only by absence of any other mechanism, not by an explicit visibility choice.
- Organization roles: 5 real enum values, `billing_admin` grants zero capability by the payment migration's own comment (`"billing_admin gains no new capability here"`).
- No retest mechanism exists anywhere in the report state machine.
- No cross-organization audit visibility exists (`audit_logs` RLS is strictly organization-scoped).

---

## 3. Three-perspective capability matrix

`DONE` = fully implemented and enforced server-side. `PARTIAL` = exists but materially incomplete or scoped narrower than the capability implies. `MISSING` = no implementation. `N/A` = not a meaningful capability for that perspective.

| Capability | Researcher | Organization | Platform | Unpatched today | Competitor precedent | Gap severity |
|---|---|---|---|---|---|---|
| Program discovery (public/registered/private) | Consumes | N/A | Would configure/moderate visibility | **MISSING** | All 3 (multi-tier visibility) | **P0** |
| Program creation/lifecycle | N/A | DONE | Would approve/gate launch | Org: DONE. Platform: MISSING | HackerOne gates launch explicitly | P1 |
| Scope management | Consumes | DONE | N/A | DONE | All 3 | — |
| Researcher invitation | Consumes | DONE | N/A | DONE | All 3 | — |
| Report submission | DONE | N/A | N/A | DONE | All 3 | — |
| Report triage | N/A | DONE | Would provide managed/first-pass triage option | Org: DONE. Platform: MISSING | All 3 (named staff) | P2 |
| Retest after fix | MISSING | MISSING | N/A | **MISSING** | All 3 | P1 |
| Bounty decision/finalization | Receives | DONE | N/A | DONE | All 3 | — |
| Payment execution | Receives | DONE (manual only) | Would custody/process | Org: PARTIAL (manual only). Platform: MISSING | All 3 (platform is the processor) | P1 |
| Payment failure recovery | N/A | PARTIAL (org-scoped visibility only) | MISSING (no cross-org visibility) | See table above | All 3 (documented ops process — see Section 1 insert) | P1 |
| Notification delivery | Receives | N/A | N/A | PARTIAL (dev provider works; failures invisible to everyone) | — | P1 |
| Reputation | DONE (self, non-scored) | N/A | Would use for platform-wide risk signal | Researcher: DONE. Platform: MISSING | All 3 (percentile/score used for access gating) | P2 |
| Researcher suspension | N/A | DONE (per-program only) | MISSING (no cross-program escalation path at all) | See below | All 3 (a platform-wide escalation path exists for severe/repeated cases — not the default per-incident response; see Section 1's correction) | **P0** |
| Organization onboarding/verification | N/A | MISSING (self-serve, unverified) | MISSING | **MISSING** | See Section 1 insert | P1 |
| Dispute mediation | MISSING | MISSING | MISSING | **MISSING** | HackerOne, Bugcrowd (named function) | P2 |
| Abuse/fraud investigation tooling | N/A | N/A | MISSING | **MISSING** | See Section 1 insert | P1 |
| Cross-org audit/oversight | N/A | PARTIAL (own org only) | MISSING | **MISSING** | Implied by platform enforcement in all 3 | P0 |
| Platform admin role | N/A | N/A | MISSING (dead scaffolding only) | **MISSING** | All 3 | **P0** |
| System health/status visibility | N/A | N/A | MISSING | **MISSING** | See Section 1 insert | P2 |
| API/webhook integrations | Consumes (none exist) | MISSING (no Jira/Slack/webhook) | N/A | **MISSING** | All 3 | P3 |
| Support/escalation channel | MISSING | MISSING | MISSING | **MISSING** | See Section 1 insert | P2 |

---

## 4. The critical platform question

> "If Unpatched had 10,000 researchers and 500 organizations tomorrow, what would the Unpatched platform team be unable to SEE, CONTROL, INVESTIGATE, or RECOVER from?"

### SEE — invisible operational information
- **Every dead-lettered outbox event, across every organization.** No product surface shows this; only a raw `service_role` DB query can.
- **Every permanently-failed notification delivery**, across every organization — not even the affected recipient can see their own notification silently failed.
- **Aggregate platform state of any kind**: total active researchers, total active programs, total reports in flight, total pending payments — no query, RPC, or page anywhere produces a cross-organization count of anything. Every existing list/count in the product is deliberately, correctly scoped to "your own organization" or "your own reports" (a real, intentional security property — see `0024`) — but that same correctness means **there is no platform-wide view at all**, not even a read-only one.
- **Rate-limit pressure** (`private.rate_limit_counters`) — completely opaque; a coordinated abuse pattern hitting the sign-in or evidence-upload limiter leaves no visible trace to anyone.
- **Which organizations are actually active vs. dormant** — `organizations.status` is `'active'` for every org from creation (no `SUSPENDED`/`ARCHIVED` state is implemented yet per `DOMAIN.md`), so there is no way to distinguish a genuinely operating customer from an abandoned one.

### CONTROL — what cannot be administratively changed, suspended, approved, or blocked
- **A researcher cannot be suspended platform-wide.** `program_researchers.status` is per-`(program, user)`; suspending someone on one program does nothing anywhere else. A researcher banned from one organization for abuse can immediately do the same thing on 499 others.
- **An organization cannot be suspended, verified, or blocked by anyone but itself.** No platform-side organization status/moderation exists at all — `create_organization` has no approval gate (Section on the trust-model question below), and nothing can revoke an org's ability to operate afterward either.
- **A program cannot be paused or closed by anyone except that organization's own owner/security_admin.** There is no platform-level override — if a program is actively harmful (e.g., its scope is being used to attack a third party, or its bounty policy is fraudulent), no one outside that one organization can intervene.
- **A dead-lettered event cannot be retried or force-completed by anyone through the product** — only a direct database operation (outside any documented, auditable product action) could touch it.

### INVESTIGATE — what incidents/abuse/disputes cannot currently be investigated
- **No dispute mechanism exists for either side.** A researcher who believes a report was closed unfairly, or an organization that suspects a researcher of bad faith, has no in-product path — no mediation request, no escalation, no support ticket concept anywhere in the schema or routes.
- **No fraud/abuse signal exists.** Duplicate-account detection, collusion between a researcher and an org insider, or a researcher submitting the same finding to many programs simultaneously (a well-known abuse pattern all three competitors screen for) has zero tooling — not even a manual query surface, since there is no cross-organization read access for anyone but a raw DB connection.
- **No researcher-side complaint mechanism exists** for a payment that never arrives, since payment visibility itself is organization-scoped and there is no platform party to escalate to.

### RECOVER — what failures cannot be recovered operationally
- **A dead-lettered notification or reputation-ledger event stays dead-lettered forever**, invisibly, unless someone manually inspects the database and calls `complete_outbox_event`/re-queues it by hand outside any product action, audit trail, or authorization check.
- **A permanently-failed payment can only be retried by that organization's own owner/security_admin manually re-initiating** (per the manual-provider design) — there is no platform-side payment-operations escalation if the organization itself is unresponsive or the researcher has no other channel.
- **A researcher who is wrongly suspended on their only active program has no appeal path** — no dispute mechanism (above) and no platform authority to review the org's decision.

---

## 5. Platform admin dashboard — conceptual research, not a design

The question the first screen must answer: **"What requires Unpatched's intervention right now?"** — not a generic SaaS metrics wall. Every proposed item below is checked against a real Unpatched data source; anything without one is marked `DATA GAP` explicitly, per instruction, rather than invented.

| Category | Proposed signal | Real Unpatched data source today | Status |
|---|---|---|---|
| Operational queues | Dead-lettered outbox events (count, by type, age) | `outbox_events where status = 'dead_letter'` — the rows exist and are queryable by `service_role` today | **Real, just not exposed to any product surface** |
| Failed deliveries | Permanently-failed notification count | `notification_deliveries where state = 'permanent_failure'` — rows exist, `service_role`-only | **Real, not exposed** |
| Payments | Payment attempts stuck in `requires_operator_action` or `failed`, across all organizations | `payment_attempts` — rows exist per-organization; no cross-org query exists today | **Real, not exposed cross-org** |
| Program approvals | Programs awaiting platform review before going active | No `program_visibility`/approval-gate concept exists at all | **DATA GAP — requires domain capability** |
| Researcher ecosystem | Platform-wide researcher counts by status | See Section 6 — several sub-metrics are real, several are gaps | Mixed, see below |
| Organization ecosystem | Platform-wide organization counts by activity | See Section 7 | Mixed, see below |
| Abuse/moderation | Flagged researchers, suspected duplicate accounts, cross-program suspensions | No fraud signal, no cross-program suspension state exists | **DATA GAP — requires domain capability** |
| Reports requiring mediation | Disputed/escalated reports | No dispute/escalation concept exists in the schema | **DATA GAP — requires domain capability** |
| System health | Outbox worker liveness, API error rates, rate-limit pressure | Worker logs to stdout only (no persisted health record); `private.rate_limit_counters` exists but is unexposed | **Partially real (worker heartbeat could be derived), mostly DATA GAP** |
| Provider failures | Email provider failures (Resend 401/429/5xx) | Classified and recorded per-delivery in `notification_deliveries.last_error`/`state`, but — see above — that table itself is invisible to any product surface | **Real, not exposed** |

**Honest framing**: roughly half of a genuinely useful platform-ops first screen is data Unpatched *already has* and simply never surfaces (dead letters, failed deliveries, failed payments); the other half (program approval queue, abuse signals, dispute/mediation queue, researcher risk scoring) requires new domain capability that does not exist in any form yet, not just a new page.

---

## 6. Researcher ecosystem — mapped to real schema

| Dimension | Real Unpatched source | Status |
|---|---|---|
| Total researchers (any) | `public.users` count | Real, trivial |
| Newly registered (time-windowed) | `public.users.created_at` | Real |
| Participating (has ≥1 active `program_researchers` row) | `program_researchers where status = 'active'`, distinct `user_id` | Real |
| Submitting (has ≥1 report) | `reports`, distinct `researcher_id` | Real |
| Accepted findings (resolved reports) | `reports where status = 'resolved'`, per researcher | Real |
| Suspended (per program) | `program_researchers where status = 'suspended'` | Real, but **per-program only** — no platform-wide "suspended researcher" concept exists (see Section 4/CONTROL) |
| Banned/restricted (platform-wide) | — | **DATA GAP** — no such state exists anywhere in the schema |
| Payment-related issues | `payment_attempts where state = 'failed'`, joined through `payment_obligations.researcher_id` | Real, but only reachable per-organization today, not aggregated platform-wide |
| Abuse signals (duplicate accounts, collusion, mass low-quality submission) | — | **DATA GAP** — no signal exists; would require new schema (e.g. a fraud/risk table) and new detection logic, not just a query |
| Reputation | `reputation_ledger`, `get_my_reputation_summary` | Real, but explicitly self-only by design (`0016`) — no platform-wide aggregate/leaderboard exists, and building one would need a new, deliberately-not-yet-built cross-user read path |
| Program participation breadth (how many programs per researcher) | `program_researchers`, group by `user_id` | Real |

## 7. Organization ecosystem — mapped to real schema

| Dimension | Real Unpatched source | Status |
|---|---|---|
| Onboarding (recently created) | `organizations.created_at` | Real |
| Active vs. inactive | — | **DATA GAP** — `organizations.status` is `'active'` for every org unconditionally (`DOMAIN.md`: `SUSPENDED`/`ARCHIVED` "anticipated but not implemented"); no activity-derived signal (e.g. "no report in 90 days") exists either |
| Programs (count, lifecycle distribution) | `programs`, group by `organization_id`/`status` | Real |
| Reports (volume, unresolved count) | `reports`, group by `organization_id`/`status` | Real |
| Payments (obligations, attempts, failures) | `payment_obligations`/`payment_attempts`, joined to `organization_id` | Real, per-organization; no cross-org aggregate query exists today |
| Configuration completeness (has a bounty policy, has scope defined) | `program_bounty_policy_versions`, `program_scope_entries` | Real |
| Verification status | — | **DATA GAP** — no organization verification concept exists at all |
| Moderation/risk flags | — | **DATA GAP** — no such concept exists |
| Support tickets/escalations | — | **DATA GAP** — no support/escalation schema exists |

---

## 8. Program marketplace gap — confirmed from schema

Re-confirmed directly (not merely re-cited from `0024`): `public.programs` (`202608260004_program_foundation.sql`) has exactly these columns — `id, organization_id, name, status, created_by, idempotency_key, created_at, updated_at`. **No visibility/confidentiality column of any kind exists.** Every researcher-facing program list (`app/programs/page.tsx`) is driven entirely by `program_researchers` participation rows — there is no query path, RPC, or page that lists programs a researcher has *not* yet been invited to.

**Can Unpatched launch a public researcher marketplace today? NO.**

Precisely because:
1. There is no schema representation of program visibility (public/registered/application/private) to gate on — adding a page that lists "all programs" would either leak every organization's private program to every researcher, or require a new column, a new RLS predicate, and a new researcher-facing query, none of which exist.
2. There is no program-approval/moderation gate an organization would need to pass before a program could safely be shown publicly (Section 4/CONTROL).
3. There is no abuse/spam protection for a public researcher-facing surface (Section 6's DATA GAP items) — a public marketplace is the single highest-exposure surface for exactly the abuse patterns Unpatched currently has zero tooling for.

---

## 9. Organization creation trust model — options, not a decision

Confirmed directly (Section 2, and live-tested in `0024`): `create_organization`'s only gate is authentication. A pure researcher succeeds identically to an existing organization owner.

Three viable product models, drawn from the competitor research pattern (none of the three platforms let self-serve signup alone produce a live, unverified organization with real researcher-facing programs):

**Model A — Platform-approved organization onboarding (closest to HackerOne's program-launch-approval pattern).** Any authenticated user can *request* an organization, but the organization is created in a non-operational state (e.g. a new `pending_review` status, reusing the `organizations.status` enum `DOMAIN.md` already anticipates extending) until a platform admin approves it. Requires: the platform-admin layer (Section 2/10) to actually exist first — currently a hard blocker, since there is no one to approve anything.

**Model B — Self-serve creation, gated by identity/intent, not by platform staff (closer to Intigriti's Company Admin model, where the org itself is unrestricted but program visibility is the gated resource).** Anyone can create an organization instantly (current behavior, unchanged), but a *program* cannot go beyond `DRAFT`/cannot become researcher-visible until some minimal verification step (e.g., a confirmed work email domain distinct from a personal one, or a manual review only at the point a program actually wants to reach researchers) — this defers the trust decision to the moment it actually matters (reaching real researchers) rather than gating the org shell itself.

**Model C — Distinguish "researcher account" from "organization operator" as a first-class identity choice at signup**, independent of `platform_role` (which is inert today) — e.g., a signup-time choice ("I'm here to find vulnerabilities" vs. "I represent an organization") that does not itself grant or deny any capability, but is a real, stored signal a future platform-admin view or approval flow can act on, and that product surfaces (nav, onboarding copy) can react to. This is the smallest change of the three and does not require the platform-admin layer to exist first, but it is also the weakest enforcement — nothing stops a "researcher" identity from clicking "create organization" anyway.

**Recommendation: Model B**, as the immediately viable step, with Model A as the natural next step once a real platform-admin layer exists. Model B requires no new authorization primitive to invent from scratch (it reuses the exact "gate is the sensitive act, not the shell" pattern Unpatched already applies everywhere else — e.g. organization creation is unrestricted but *program creation within it* is owner/security_admin-only, and *program activation* is a separate, further-gated transition per `docs/decisions/0021`). Model A is strictly better long-term but is blocked on Section 10/11's platform-role gap being closed first — recommending it now would just be inventing a second unenforceable role, the exact mistake `platform_role` already made once.

---

## 10. Platform role audit (re-confirmed, not re-derived)

- **Where is `platform_role` populated?** Only at row creation, to its default `'researcher'` (`handle_new_auth_user` trigger, `202608250001_initial_identity_rbac.sql`). No migration, RPC, or trigger ever sets it to any other value.
- **Where is it enforced?** `services/authorization.ts`'s `requirePlatformAdmin()` is the only code that reads it for an authorization decision.
- **Can any real user become `platform_admin`?** No — through any product-reachable path, never. Only a direct database `UPDATE` (outside the product entirely) could set it.
- **Does any real UI exist?** No — no page, route, or component references `platform_role` for rendering or gating anything.
- **Does any real RPC use it?** No — grepped every migration; zero RPCs reference `platform_role` in any check.

**What a legitimate platform-admin architecture would need (research findings, not a design to implement now):**
1. A real, product-reachable way to grant it — e.g. a `service_role`-only RPC callable only from an internal/ops tool, never from the public app, mirroring how `workers/outbox/` is reachable only via `service_role` and never imported by `app/`.
2. Real RLS policies and RPCs that actually check it — starting with exactly the cross-organization read paths Section 4/SEE identified as missing (dead letters, failed deliveries, cross-org aggregates), since those are genuine, already-existing data with zero current reader.
3. A resolution to the `platform_role` vs. `organization_member_role`/program role naming collision noted in `0024` (`platform_role` has values literally named `organization_owner`/`program_manager`/`triager` that are unrelated to and could be confused with the same-named organization/program roles) — worth renaming or removing the unused values before ever building real logic on top of this enum.

---

## 11. RBAC comparison

**Where Unpatched is too coarse:**
- Exactly one program-level role (`manager`) vs. competitors' 3–4 tiers. A read-only "Viewer"/"Reader" equivalent is a real, missing capability — e.g. an organization wanting to give a junior analyst or an auditor read access to a program without triage/reward authority cannot do so today.
- No report-level permission distinct from program membership at all (every `program_members` row sees every report in that program identically).

**Where Unpatched is already reasonably right-sized (do not blindly add complexity to match competitors):**
- The five organization roles map cleanly to real, distinct responsibilities (identity/membership, security operations, program assignment, triage-only, and a reserved-but-honest billing placeholder) — this is comparable in shape to Bugcrowd's Owner/User Admin/Member, and better than inventing Intigriti's exact four-tier program model wholesale, which would be premature complexity for a platform that doesn't yet have report-level permission differentiation to justify it.
- `billing_admin` should **not** be deleted reflexively just because it's a no-op today — the honest move is either to implement real billing-scoped capability behind it (viewing payment obligations/attempts without triage access) or to explicitly document it as reserved-for-future rather than quietly removing a role an organization may already have assigned to someone.

**Roles that should NOT be added just to match competitors:**
- A Bugcrowd-style separate "Team" grouping concept — premature; Unpatched doesn't yet have enough program-level role granularity to make team-based bulk role assignment meaningful.
- A HackerOne-style fully custom/configurable permission-group builder — this is the most complex end of any competitor's model and is almost certainly over-engineering for Unpatched's current program count; a fixed, small set of program-level roles (adding one or two, not a builder) is the smallest model that closes the real gap (report-level read-only access) without building a permissions IDE nobody asked for.

**Smallest model that supports a serious 10× product**: keep the five organization roles as-is; add exactly one new program-level role (a read-only "Viewer" equivalent) to close the starkest, most concretely-justified gap; do not add report-level permissions, teams, or a permission builder until a real customer need surfaces one.

---

## 12. Launch readiness — brutally honest

| Dimension | Score | Basis |
|---|---|---|
| Researcher readiness | 55% | Submission/communication/evidence/tracking/reputation are real and live-tested; discovery and retest are structurally absent |
| Organization readiness | 75% | Full lifecycle, triage, bounty, payment (manual), audit — genuinely solid for a single-org, invite-only workflow |
| Platform operations readiness | **5%** | Confirmed dead scaffolding only; zero real cross-org visibility, control, or recovery capability |
| Security readiness | 70% | RLS/RPC discipline is consistently strong throughout every domain audited; the gap is operational (Section 4), not authorization-boundary correctness |
| Payment readiness | 40% | Real ledger/obligation model, manual-provider-only, no platform custody, no cross-org failure visibility |
| Notification readiness | 45% | Routing/preferences/delivery-state-machine is real; real provider (Resend) now wired; failures are invisible to everyone including the recipient |
| Program marketplace readiness | **0%** | No visibility model exists at all; confirmed above |
| Frontend readiness | 70% | Consistently real, live-browser-verified per-slice across this session's own history; no platform-ops surface exists at all (0%, since nothing to render) |
| Backend readiness | 75% | Domain logic is thorough and RLS-correct wherever it exists; the platform tier simply doesn't exist yet |

### Launch-stage classification

| Stage | Classification | Why |
|---|---|---|
| A. Private internal demo | **READY** | Everything needed already works end-to-end for a controlled, known set of users |
| B. Invite-only beta | **READY** | Invite-only is Unpatched's *only* mode today — this is not a stretch, it's the native shape of the current product |
| C. Controlled organization/researcher beta | **BETA READY** | Works, but any real failure (a dead-lettered event, a failed payment, an abusive researcher) has no operational recovery path — acceptable for a small, closely-watched cohort, not for scale |
| D. Public researcher onboarding | **NOT READY** | No abuse/fraud tooling, no platform-wide researcher suspension, no support/dispute channel |
| E. Public program marketplace | **NOT READY** | Confirmed structurally impossible today (Section 8) — this is not a configuration gap, it's a missing schema/domain capability |
| F. Production commercial launch | **NOT READY** | Platform operations layer is ~5% real; a genuine incident (fraud, payment failure at scale, abusive researcher) has no one and nothing to catch it |

---

## 13. Priority the gaps

**P0 — launch blockers (stage C and beyond cannot proceed safely without these):**
- A real platform-admin role and the minimal cross-organization read paths for what already exists (dead letters, failed notification deliveries, failed payments) — closing Section 4/SEE's starkest gaps costs no new domain modeling, only new RLS/RPC exposure of data that already exists.
- Platform-wide (not per-program) researcher suspension — the single clearest "a bad actor can freely repeat elsewhere" gap.
- Fix or explicitly re-decide `create_organization`'s trust model (Section 9).

**P1 — required for a serious beta:**
- Retest mechanism (present on all 3 competitors, absent entirely).
- Real payment-failure recovery path that isn't organization-owner-only.
- Program visibility model (even a minimal `public`/`invite_only` two-state column) as the prerequisite for anything in Section 8.
- A dispute/escalation mechanism for at least one side (researcher-initiated is the more urgent of the two, given payment/outcome disputes are the highest-stakes case).

**P2 — important scale/operations capability:**
- Abuse/fraud signal foundation (even a simple duplicate-account or velocity heuristic, not a full ML system).
- System health visibility (worker liveness, provider error rates) — currently stdout-only.
- Managed/first-pass triage option (platform-side), matching all three competitors — a real differentiator but not a launch blocker for an invite-only beta.
- Organization activity/verification status (`SUSPENDED`/`ARCHIVED`, already anticipated in `DOMAIN.md`'s own enum design).

**P3 — later differentiation:**
- Integrations (Jira/Slack/webhooks) — every competitor has these, none is a domain gap, all are pure additive surface.
- Report-level fine-grained permissions / a program-level "Viewer" role.
- Platform-wide researcher reputation aggregate/leaderboard (deliberately deferred by `0016`'s own design — do not resurrect without a real product reason).

---

## 14. Final recommendation — NEXT 5 SLICES

### 1. Platform Operations Foundation (the real platform-admin layer)
- **Why now**: every other gap in this audit (P0 items especially) is downstream of this not existing. Building anything else in the platform tier before this exists means building on the same dead scaffolding `platform_role` already demonstrated doesn't work.
- **Research-backed reason**: all three competitors treat the platform-as-company as an active third authorization tier with real operational authority (Section 1); Unpatched has the enum but none of the machinery.
- **Backend/domain changes required**: a real, `service_role`-gated path to grant platform-admin (never through the public app); RLS policies/RPCs giving a platform admin genuine, audited read access to the already-existing data Section 4/SEE identified (dead-lettered events, failed notification deliveries, failed payments, aggregate counts) — read-only first, no destructive/mutating platform-admin capability yet.
- **Frontend changes required**: none yet, or at most a minimal internal-only route gated by the new role — the dashboard itself (Slice 3) comes after the data access exists.
- **What it unlocks**: every other P0/P1 item becomes buildable on a real foundation instead of invented ad hoc.
- **What must explicitly remain deferred**: any mutating platform-admin capability (suspending an org, force-completing a dead letter) — read-only visibility first, control second, once the visibility itself is proven correct.

### 2. Platform-wide researcher standing (cross-program suspension)
- **Why now**: the single starkest CONTROL gap (Section 4) — a researcher removed from one program for cause has zero friction repeating the same behavior on 499 others.
- **Research-backed reason**: HackerOne explicitly documents that bans are program-specific *by default*, with a platform-wide escalation reserved for severe/repeated misconduct — Unpatched's gap is that no cross-program mechanism exists at all, not even as an escalation path, so the target is "a real escalation path exists," not "every suspension becomes platform-wide."
- **Backend/domain changes required**: a new, genuinely platform-wide researcher status (distinct from `program_researchers.status`, which stays per-program), enforced by RLS server-side, not a client-side flag.
- **Frontend changes required**: a platform-admin-only action (depends on Slice 1's role existing); a researcher-facing state (their account is platform-restricted) needs honest, non-punitive-sounding UI, matching this codebase's own established "no fake security theater" convention.
- **What it unlocks**: a real, enforceable response to the single most obvious abuse vector before any public-facing expansion.
- **What must explicitly remain deferred**: any automated fraud/abuse detection driving this — this slice is the *mechanism* (a real suspension state platform admin can set), not the *detection* (Section 13/P2).

### 3. Program visibility model (the marketplace prerequisite)
- **Why now**: this is the one schema change that everything in Section 8 depends on, and it's a small, additive column plus RLS predicate change, not a rewrite.
- **Research-backed reason**: every competitor's researcher-acquisition model depends on some form of this; Unpatched has literally zero representation of it today.
- **Backend/domain changes required**: a `program_visibility` (or similarly named) column on `programs` with at minimum two real states (`invite_only` — today's actual behavior, made explicit rather than implicit; `public` — genuinely listable); a new RLS-safe researcher-facing query for public programs; scope/eligibility rules for what a non-invited researcher may see before participating (mirroring competitors' "full scope visible, submission gated" pattern).
- **Frontend changes required**: a real "Browse programs" page (the `/researchers` page's existing link already promises this and currently lies) showing public programs to any authenticated researcher.
- **What it unlocks**: the actual prerequisite for stage E (public marketplace) — still not sufficient alone (abuse tooling, Slice 2, and moderation are also required), but the first concrete unlock.
- **What must explicitly remain deferred**: `registered`/`application` visibility tiers (Intigriti's more granular model) — start with the two-state version; a public marketplace launch decision itself, which depends on Slices 1 and 2 also being real first.

### 4. Retest mechanism
- **Why now**: the most concrete, narrowly-scoped researcher-experience gap with a clear precedent on all three competitors and a bounded implementation surface (it's a report-lifecycle addition, not a new domain).
- **Research-backed reason**: universal across HackerOne/Bugcrowd/Intigriti; absent entirely from Unpatched's report state machine (`DOMAIN.md`'s own "terminal outcomes have no exit transition" statement blocks it structurally today).
- **Backend/domain changes required**: a new, narrowly-scoped transition (e.g. `RESOLVED → RETEST_REQUESTED → RETEST_CONFIRMED/RETEST_FAILED`) that does not reopen the full triage state machine, reusing the exact "hardcoded target status per RPC" pattern `0009` already established.
- **Frontend changes required**: a real action on a resolved report, and a researcher-facing retest queue (mirroring competitors' own dashboard concept).
- **What it unlocks**: a genuine researcher-experience parity item, independent of the platform-tier work above — can proceed in parallel with Slices 1–3.
- **What must explicitly remain deferred**: a separate retest-specific bounty (Intigriti's model) — start with the state transition alone, add a reward concept only if a real organization asks for it.

### 5. Payment-failure cross-organization visibility (platform ops, payments-specific)
- **Why now**: the one P0/P1 item that's almost entirely a *read-access* change on data that already exists correctly (`payment_attempts`), making it the cheapest possible win once Slice 1's platform-admin role exists.
- **Research-backed reason**: all three competitors are the payments processor, not a passive observer — Unpatched doesn't need to go that far immediately, but "the platform can at least see every organization's stuck payment" is the minimum viable step toward that model.
- **Backend/domain changes required**: a platform-admin-scoped RPC/read policy over `payment_obligations`/`payment_attempts` across all organizations (depends on Slice 1).
- **Frontend changes required**: a real, minimal "payments requiring attention" list — the first genuinely useful screen answering Section 5's stated question, using entirely real data.
- **What it unlocks**: the first concrete, demonstrable platform-ops screen, built on real data rather than invented metrics.
- **What must explicitly remain deferred**: any platform-side payment execution/custody (becoming the actual payments processor) — that is a materially larger, separately-reasoned slice, not a byproduct of visibility.

---

## 15. Required backend/frontend progress — separate estimates, not one number

```
Researcher product        [███████████░░░░░░░░░] 55%   Submission/comms/evidence/reputation real; discovery + retest absent
Organization product      [███████████████░░░░░] 75%   Full lifecycle/triage/bounty/payment(manual)/audit; solid for invite-only single-org use
Platform product          [█░░░░░░░░░░░░░░░░░░░]  5%   Dead scaffolding only (platform_role, requirePlatformAdmin) — no real capability
Core backend (domain)     [███████████████░░░░░] 75%   RLS/RPC discipline consistently strong across every domain audited
Platform backend (ops)    [██░░░░░░░░░░░░░░░░░░] 10%   The exact data Section 4/SEE needs already exists in tables; zero read access exposed to anyone
Security/operations       [██████████████░░░░░░] 70%   Authorization-boundary correctness is real and repeatedly proven; operational recoverability is the gap, not authorization
Frontend                  [██████████████░░░░░░] 70%   Consistently real, live-verified per slice; zero platform-ops surface exists (nothing to render yet)
Overall product            — intentionally not collapsed to one number —
```

**What each percentage actually means**: these are independent axes, not components of one weighted average — a high "Organization product" score does not offset a near-zero "Platform product" score, because they measure different, non-substitutable capabilities. A single blended "overall" number would misrepresent a platform that is genuinely strong for one user and genuinely unbuilt for another. The honest overall statement is qualitative, not a percentage: **Unpatched is a well-built two-party product (researcher ↔ organization) that currently cannot safely operate as a three-party platform at any scale beyond a small, closely-watched invite-only beta.**

---

**STOP — this is the audit. No code, schema, or UI was changed in this slice.**
