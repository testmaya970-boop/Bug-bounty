# 0074: Researcher and organization functionality, in priority order

Date: 2026-09-05
Status: **Reference inventory. No code, migration, RPC, or UI was changed in this document.**

## Purpose

A single, current, verified list of what exists for each of Sentinel's two active
perspectives — researcher and organization — ordered by priority. This supersedes the
feature inventory in `0026`'s Sections E/F/I where they disagree: several items `0026`
listed as gaps have since shipped (report collaboration, severity on report-list cards,
organization report analytics, payout/KYC settings reachability), and this document
reflects that. `0026`'s platform-tier analysis (Sections G, L, S) is unaffected and still
stands as written — nothing in this document changes the platform-authority conclusion.

**Verdict key** (same three used throughout this session's own audits):
- **REAL** — backend-verified, works end-to-end, no fabricated data.
- **PARTIAL** — real ledger/mechanism, with one specific, disclosed piece stubbed or thin.
- **MOCK** — fixture/demo data, no backing query.
- **ABSENT** — does not exist in the codebase.

**Priority key**:
- **P0** — blocks or actively damages trust today; fix before anything else.
- **P1** — the next real gap a working researcher/org would hit.
- **P2** — genuine improvement, not urgent.
- **P3** — later differentiation, correctly deferred.

---

## Researcher functionality, in priority order

### P0 — fix now (trust/honesty issues, not missing features)

1. **CTF challenge catalog is fabricated content behind a real submission mechanism.**
   Flag verification (`submit_ctf_flag`), the solve record, and the reputation credit are
   all REAL — hashed server-side, real `ctf_solves` row, real `reputation_ledger` fact. But
   the challenge titles, prompts, hints, difficulty, solve counts, and the CTF leaderboard
   are static seeded content (`lib/mock/ctf.ts`), not admin-manageable, and carry **no
   on-screen disclosure** that they're fixed/seeded rather than a living challenge set. A
   researcher has no way to tell "28 challenges" apart from "28 challenges today, more
   coming" versus "this is literally all there will ever be." *(Verified this session.)*

2. **Homepage dashboard mixes real and fabricated data with no visual distinction.**
   `MOCK_FEATURED_PROGRAMS` (fake program names, fake bounty ranges like "Quiver
   Logistics — Up to $18,000") and `MOCK_LEADERBOARD`/`MOCK_MILESTONES` render with
   identical visual weight to the real stat rail beside them. A first-time researcher
   cannot tell which numbers are real without reading source code. *(Flagged in the
   researcher-side audit this session; not yet fixed.)*

### P1 — the next real gap

3. **Payout mechanism has no automated processor behind the real ledger.**
   `payment_obligations`/`payment_attempts` are REAL — genuine state machine, row-locked,
   audited. The provider behind it is `lib/payment-provider`'s manual/operator-confirmed
   adapter, by disclosed design (`0063`). As of this session, `/settings/payments` now
   surfaces `PayoutDetailsSettings` and `KycSettings` (previously built but **unreachable
   from any route** — a genuine dead-end, now fixed) with an honest in-UI disclosure that
   payouts are processed manually today. The remaining gap is the processor itself, not
   the disclosure.

4. **No KYC prompt at the point it becomes relevant.** KYC status is REAL
   (`get_my_kyc_status`, manual-review-only, honestly disclosed as non-automated) and now
   reachable from `/settings/payments`, but nothing prompts a researcher to complete it
   before or around a finalized bounty — they discover the requirement only by finding the
   settings page, potentially after a payout is already blocked on it.

5. **Retest is structurally absent.** No terminal report status has an exit transition
   (`0026` Section E, still true). A researcher cannot confirm a fix landed; "resolved"
   is a permanent dead end from the researcher's side too, not just the organization's.

6. **Report collaboration has no payout fan-out.** `report_collaborators` and its
   RPCs are REAL (built this session, live-verified including an infinite-recursion RLS
   bug caught and fixed before shipping) — a submitter can add up to 10 collaborators with
   real, server-validated bounty splits. But `create_payment_obligation` still pays the
   submitter only; a collaborator's real split percentage currently has no effect on an
   actual payout. Disclosed in `docs/decisions/0064`'s own "Status" section, not silent.

### P2 — genuine improvement, not urgent

7. **Researcher API is one endpoint of a much larger surface.** Bearer-token auth is
   REAL and correctly scoped, but only `GET /api/v1/reports` (list-my-reports) exists;
   ~19 other representative endpoints are explicitly not built (`0018`).

8. **No "mark all as read" on notifications.** Disclosed as an intentional non-feature
   in-code, but still real day-to-day friction on a long notification list.

### P3 — correctly deferred, do not pull forward

9. **Mobile app** (`0068`) and **live hacking events** (`0067`) — both explicitly scoped
   and deferred with a stated reason; no evidence yet of demand that would change that call.

### Already REAL and complete (no action needed)

- Report lifecycle, scope/asset matching, evidence (text + file), CVSS, weakness type —
  all real, server-enforced, no client-trust gaps.
- Messaging with visibility split (researcher-visible vs. internal), never leaked wrong.
- Reputation ledger, badges, public leaderboard, public researcher profile pages — all
  real, computed read-side from real facts, non-scored by deliberate design (`0016`).
  Severity now shown on report-list cards (fixed this session).
- Disclosure request workflow (request/approve/decline, public disclosure feed).
- Program discovery (public browsing), applications, invitations, participation lifecycle.
- Sign-up, email verification, MFA, sessions, password/security settings.
- Notification routing + real (Resend) email delivery.

---

## Organization functionality, in priority order

### P0 — fix now / foundational, per `0026`'s own unchanged conclusion

1. **No platform-review gate on program launch.** `submit_program_for_review` and
   `activate_program` both exist but are callable by the same organization's own
   owner/security_admin — self-certification, not a real gate. This is `0026` Section H's
   single highest-leverage joint and remains unresolved; nothing shipped this session
   touches it. Requires a real platform-admin actor to exist first (`0026` Section L).

2. **No cross-organization researcher-suspension escalation.** A researcher removed
   from one program is free on every other program on the platform. Same platform-admin-
   actor prerequisite as above.

3. **No platform-operations visibility at all.** Dead-lettered outbox events,
   permanently-failed notification deliveries, and failed payment attempts all already
   exist as real rows with no reader anywhere. `0026` Section S's own recommendation
   (a read-only "Needs Recovery" queue, zero new domain modeling) remains the cheapest
   available next step and has not been built.

### P1 — the next real gap a working organization would hit

4. **Org-facing report analytics were entirely absent until this session — now REAL.**
   Three new RPCs (`get_organization_severity_status_breakdown`,
   `get_organization_weekly_report_volume`, `get_organization_resolution_performance`),
   all backed by real `reports`/`audit_logs` data, live-verified including a real
   `numeric`/`double precision` type-mismatch bug caught before shipping. Reachable at the
   new `/organizations/[organizationId]/analytics` tab. This closes what was previously
   the single most visible "org side is thinner than researcher side" gap.

5. **No managed/first-pass triage service.** Self-triage is REAL and complete; a
   HackerOne/Bugcrowd-style staffed triage-as-a-service offering is correctly absent —
   `0026` explicitly rejects faking this without real staff behind it. Stays deferred
   until there's real capacity to staff it, not a priority gap to close in code.

6. **No dispute mechanism for either side.** Neither a researcher nor an organization
   has recourse when they believe a triage outcome was unfair. Requires the same
   platform-admin foundation as items 1–3; can start as a simple researcher-initiated
   flagging queue once that foundation exists (`0026` Section P).

7. **No organization-facing API.** The one shipped API endpoint is researcher-scoped
   (list-my-reports); nothing org-scoped exists. Lower urgency than the researcher gap
   above since no organization customer has yet asked for one.

### P2 — important scale/operations capability, not urgent yet

8. **No third-party integrations** (Jira/Slack/GitHub/ServiceNow). Correctly deferred —
   only matters once there are enterprise customers with existing workflows to plug into.

9. **No program health/quality signal for an organization's own program** (response
   time, resolution rate) — real and cheaply derivable from data the new analytics RPCs
   already compute, but not yet surfaced as a per-program (vs. per-organization) view.

10. **No abuse/fraud signal foundation.** Zero detection for duplicate accounts,
    collusion, or mass low-quality submission. Real gap, low urgency at current scale.

### P3 — correctly deferred, do not pull forward

11. **Adjacent product lines** (pentest-as-a-service, code security audit, AI
    red-teaming, compliance attestations like SOC2/FedRAMP) — sit well outside a
    bug-bounty platform's core loop; listed for HackerOne-comparison completeness only,
    never a near-term gap for this product.

### Already REAL and complete (no action needed)

- Program lifecycle (draft → review → active → paused → closed), scope/asset management
  with a real matching engine, bounty decision engine (versioned, immutable policy).
- Self-service triage — full, rigorous, row-locked state machine.
- RBAC (owner/security_admin/program_manager/triager/billing_admin), double-checked
  client + DB.
- Payment/payout orchestration ledger (real state machine; manual provider only, same
  disclosed limitation as the researcher side's item 3 above).
- Notification routing with real email delivery.

---

## What changed since `0026` (2026-08-31 → today)

Shipped and live-verified this session, moving four items off `0026`'s own gap list:

- Report severity now visible on report-list cards (was a real UX gap, not in `0026`'s
  scope but found and fixed in this session's own earlier audit pass).
- Report collaboration (`0064`) — built in full: schema, RLS (including a live-caught
  and fixed infinite-recursion bug), RPCs, and UI. Payout fan-out deliberately deferred,
  disclosed.
- Organization report analytics — built in full: three real RPCs, a live-caught and
  fixed numeric type bug, and a new `/organizations/[organizationId]/analytics` route.
  This was `0026`'s own Section I "Org analytics" gap (there conflated with the
  researcher-facing Reports page's own disclosed mock analytics — clarified as a
  genuinely separate, previously entirely-absent surface, not a mock-to-real swap).
- Payout details and KYC settings, both previously fully-built but **unreachable from
  any route in the app**, wired into `/settings/payments` with an honest in-UI disclosure
  of the manual-payout limitation.
- `/settings/collaboration` corrected from a stale "isn't part of Unpatched yet" denial
  (factually wrong once collaboration shipped) to correctly point at where the real
  feature lives.

`0026`'s platform-tier conclusion (Sections G, L, S) is unchanged: the single highest-
leverage next move remains the read-only "Needs Recovery" queue, because every other P0
item on both lists above (program-review gate, cross-org suspension, dispute mechanism)
requires that same platform-admin foundation to exist first.
