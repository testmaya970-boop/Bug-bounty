# 0024: Three-perspective product/permission audit — Researcher vs Organization vs Unpatched Platform Admin

Date: 2026-08-31
Status: Audit only — no fixes implemented in this slice, by explicit instruction.

## Purpose

This document answers one question: does Unpatched behave like a serious security platform for the right person at every stage, across its three fundamentally different users — Researcher, Organization/security team, and Unpatched Platform Admin? It is research + a live-tested gap analysis, not an implementation. Every claim about Unpatched's own behavior below was verified against the actual RLS/RPC/migration layer and, where stated, against a real running instance with real accounts — never inferred from UI copy or button visibility alone.

---

## 1. External competitor research: product model (not vanity metrics)

Researched from each platform's own official documentation. Full report with inline source URLs for every claim: see the companion research artifact this audit produced (all citations reproduced below; nothing here is asserted without an official-docs source).

### HackerOne
- **Researcher**: discovers programs via a public Directory (public vs. private visibility); private access comes from reputation-driven invitations. Scope is enforced at submission. Reports move through New → (Pending Program Review, for managed programs) → Triaged → Retesting/Needs More Info → a closed state. Hackers self-close only until Triaged. Comments (public/internal) are the communication channel; evidence attaches at submission. Workspace: report history, Reputation/Signal/Impact scores (percentile-ranked), payment status gated by identity verification + tax form + payout method.
- **Organization**: creates a program via a Setup Guide; configures scope/policy/reward tables; chooses private vs. public. **Program launch is HackerOne-approved**, and public launch requires HackerOne-defined activity thresholds (≥10 reports, ≥100 invited hackers) — not solely the org's discretion. Internal team management via **Groups** (Read only / Program admins / Rewards / Report), assignable only by Organization Admins; finer org-wide roles add User Manager / Groups Manager / Assets Manager / Assets Viewer. Program-level audit log, restricted to program administrators.
- **Platform administration layer**: HackerOne gates program launch; runs **managed triage** via its own security analysts sitting between submission and org review; runs a standing **Mediation Team** adjudicating disputes either side raises; enforces a **platform-wide Code of Conduct** independent of any one customer (temporary/permanent bans); and is the **payments processor** (identity verification, tax, payout) — not the org.
- **Underlying model**: hacker (reputation-gated) → organization (two-level RBAC: Org Admin → program Groups) → HackerOne itself as an active third party with real operational authority (approval, triage, mediation, payment custody) above both.

Sources: docs.hackerone.com — Directory, Private vs. Public Programs, Private Opportunities, Defining Scope, Submission Requirements, Submitting Reports, Report States, Reputation, Retesting, Signal & Impact, Payment Preferences, Receiving Payments, Response Program Setup, Program Starting Point, Invitations, Groups and Permissions, User Management, Permissions, Duplicate Reports, Awarding Bounties, Billing, Audit Logs, Hacker Mediation, Escalating Code of Conduct Concerns; hackerone.com/policies/code-of-conduct; hackerone.com/platform/triage-101.

### Bugcrowd
- **Researcher**: finds programs on a filterable Programs tab (Reward/VDP/Charity/Participating/Invited/Pending); private programs are Bugcrowd-curated invitations based on skill/history; researchers can accept/reject/hide invites. Reviews a **Bounty Brief** (scope + reward range per target group) before testing. Submissions: New → **Triaged (validated by a Bugcrowd Application Security Engineer)** → Unresolved → Resolved, grouped OPEN/ACCEPTED/REJECTED. Comment-based collaboration, a "Request a Response" escalation. Retests are customer-initiated, researcher-performed, and require prior Bugcrowd triage. Workspace: dashboard with submission history, retest queue, rewards; payments need a payout method + tax form, researchers get 100% of the bounty, weekly cycle.
- **Organization**: defines programs via a Start-Up Guide; configures Targets (scope + reward ranges) at program or engagement level; controls Engagement States. All submissions land in a **Security Inbox**; **Bugcrowd's own ASEs triage first** before the org reviews. Two-tier internal roles: **Organization** (Owner: full cross-program access / User Admin: people-only, zero program or submission visibility / Member: no access until assigned) × **Program** (Administrator: full + reward / Analyst: no reward / Viewer: read-only). Teams can be assigned a shared role. Jira (bi-directional, auto-creates/closes tickets) and Slack integrations, plus webhooks.
- **Platform administration layer**: Bugcrowd's own roles doc does not name a customer-facing "Bugcrowd staff" role, but **ASEs structurally sit between every submission and Triaged status** for managed programs. Bugcrowd separately runs **platform-wide trust & safety**: automatic sanctioned-country disqualification, mandatory Code-of-Conduct re-acceptance + OFAC check before every payment, and a **behavior-points ban system** (5 points → platform removal) — independent of any single program's own block decision.
- **Underlying model**: the most rigid two-tier RBAC of the three — Organization (Owner/User Admin/Member) strictly layered on Program (Administrator/Analyst/Viewer), with Organization User Admin deliberately walled off from all security data. Above both, Bugcrowd itself is the mandatory first-pass triager and sole holder of platform-wide sanctions.

Sources: docs.bugcrowd.com — Finding a Program, Viewing and Accepting Invitations, Rejecting an Invitation or Hiding a Program, Reviewing Bounty Briefs, Engagement Scope and Reward, Assigning Submission Statuses, Understanding Substates, Researcher Collaboration, Request a Response, Retesting, Researcher Dashboard, Setting Up Payment Methods (+ FAQ), Getting Rewarded, Following the Code of Conduct, Program Owner Start-Up Guide, Defining the Program Scope, Managing Targets at Engagement Level, Engagement States, Inviting Researchers, The Security Inbox, Getting Started with Bugcrowd Guide, Rewarding, Understanding Roles and Permissions, Adding and Deleting Members at the Organization Level, Assigning Member Roles and Removing Members, Creating Teams and Assigning Team Roles, Program Performance, Slack, Jira integration + error log, Webhooks.

### Intigriti
- **Researcher**: program discovery is gated by four **confidentiality levels** — Public (fully visible), Registered (visible once any account exists), Application (limited preview until applied+accepted), Private/Invite-only (invisible to non-invitees). Optional ID verification unlocks programs that require it. Submissions: Triage → Pending → Accepted → Closed → Archived; **Intigriti's own internal Triage team reproduces/verifies** before forwarding to the company (or closes as duplicate/informative/spam/out-of-scope directly). A dedicated, upfront-defined **retest bounty** is separate from the base bounty. Workspace: Statistics + payout history; payouts auto-trigger on acceptance (100% of bounty), via Payoneer/UPI, 1–5 business days.
- **Organization**: configures confidentiality level, scope, bounty table (fixed/ranged/custom) plus separate discretionary bonuses; a program-launch checklist gates go-live. Program states: Wizard → Draft → Open/Live → Suspended → Closing → Closed, with an **auto-suspension** mechanism the platform can trigger. Internal roles: **Company** tier (Admin: full org control incl. billing/integrations / Member: no org-wide access) × **Program** tier (Admin/Editor/Member/Reader), explicitly documented as least-privilege delegation from company to program. Jira, Slack, and signed webhook integrations.
- **Platform administration layer**: the cleanest documented Company-vs-Program split of the three. Above the customer's own Company Admin, **Intigriti's internal Triage team** is the default first-line validator for managed programs. Intigriti reserves **platform-wide enforcement** over researchers independent of any one program (bad-faith conduct, false identity info, Terms & Conditions breach) and can **auto-suspend** a program under platform-defined conditions. No named mediation/dispute-resolution function was found in official docs (flagged as absence-of-evidence, not asserted as fact).
- **Underlying model**: Company (org-wide, one Admin/Member split) vs. Program (four-tier Admin/Editor/Member/Reader RBAC, least-privilege delegation) as a first-class, explicit split. Intigriti-the-company is the default first-line triager and platform-wide researcher-vetting/enforcement authority, while leaving bounty decisions and program lifecycle to the company's own Program Admins.

Sources: kb.intigriti.com — Program confidentiality levels, Program details including Private Programs, Program confidentiality, Getting started with Intigriti, Submission states & close reasons, Understanding the submission lifecycle and different close reasons, Intigriti Triage (+ Triage Standards), Providing feedback on your submission, Payouts, Payout lifecycle, Payout methods, Statistics, Bounty table & tiers, Custom bounties, Program launch checklist, Program lifecycle, Program auto-suspension, User roles & permissions, Jira, Slack, Webhooks, Researcher Terms & Conditions.

### Synthesis across all three (the pattern that matters for this audit)

Every one of the three market leaders draws **three** authorization tiers, not two: Researcher, Organization (itself split into an org-wide tier and a program-scoped tier), and **the platform company itself as an active, operationally-present third party** — gating program launch (HackerOne), performing mandatory first-pass triage (all three, via named staff: HackerOne security analysts, Bugcrowd ASEs, Intigriti's Triage team), running platform-wide researcher enforcement independent of any single org (all three), and in two of three cases (HackerOne, Bugcrowd) explicitly running dispute mediation. All three also make the platform, not the organization, the **custodian of researcher payments** (identity verification, tax handling, payout disbursement).

---

## 2. Unpatched's actual roles — audited against the database, not the UI

Every capability below is sourced from the actual RLS policy, `SECURITY DEFINER` RPC, or grant statement that enforces it — cited by migration file. Where a role or capability is *only* documented in prose (`DOMAIN.md`) but not implemented in the schema, that is called out explicitly as a gap, not conflated with the real thing.

### Researcher — what an authenticated researcher can actually do

Source domain: `program_researchers` (`202608260006_researcher_access_foundation.sql`), `reports`/triage RPCs, `reputation_ledger`, `notifications`.

| Capability | Real? | Source |
|---|---|---|
| Discover a program before being invited | **No** | No `program_visibility` column exists on `public.programs` at all (confirmed: the table has only `id`/`organization_id`/`name`/`status`/`created_by`/timestamps — `202608260004_program_foundation.sql`). Every program is invite-only in practice, not by an explicit visibility choice among options. |
| Join/apply to a program | **No (invite-only)** | `program_researchers` participation is created only by accepting a `program_invitations` row; no public self-enrollment RPC exists (`docs/decisions/0007-researcher-access.md`). |
| View scope before testing | Yes, once invited | Active researcher reads the program's currently-active scope only, never removed-scope history (manager-only). |
| Submit a report | Yes | `submit_report` composes researcher authorization + program-not-paused/closed + scope match; scope decision frozen at submission time. |
| Communicate on a report | Yes | `post_researcher_message` (report-scoped, own reports only). |
| Attach evidence | Yes | Text/code/URL/log evidence + binary file evidence, both researcher- and org-authored variants exist. |
| Track own report status | Yes | `list_my_reports`, paginated, self-scoped. |
| Request a retest | **No** | No retest/reopening mechanism exists anywhere in the schema — DOMAIN.md states directly that terminal outcomes have no exit transition. All three competitors have a named retest concept; Unpatched has none. |
| See program state (active/paused/closed) | Yes | Surfaced on the participation card. |
| See reward info | Only after a bounty is finalized on their own report | No public "bounty table"/reward-range-per-severity is shown to a researcher before or during testing — bounty policy is configured by the org but not exposed to researchers as a scope-time reference (contrast: all three competitors show this upfront, e.g. HackerOne/Bugcrowd's reward tables, Intigriti's bounty table). |
| Manage own workspace | Partial | Own report history and an honest, non-scored reputation summary (`get_my_reputation_summary`) exist. **No profile/bio page, no payment-method management page, no personal account settings page of any kind** — confirmed by inspecting every `app/` route; `/settings` is organization-only and explicitly states "You don't belong to an organization yet" for a pure researcher. |

**Researcher gap headline**: Unpatched has zero program-discovery surface and zero retest mechanism — both are core, documented features on all three competitor platforms. `DOMAIN.md`'s own wording ("The architecture supports public, private, invite-only, and vulnerability disclosure programs") is aspirational prose, not a schema fact — there is no column backing it today.

### Organization roles — audited against `services/authorization.ts` and the RLS/RPC layer it mirrors

Five roles exist on `organization_members.role`: **owner, security_admin, program_manager, triager, billing_admin**. Every one of the five is a real, database-enforced enum value — none is prose-only. Their actual capabilities (from `services/authorization.ts`'s `ACCESS_SUMMARIES`, which is the same source the RPCs' own `private.has_org_role` checks encode, not a hand-written duplicate):

| Role | Organization access | Can | Cannot |
|---|---|---|---|
| **owner** | Full | Manage org identity/settings, invite/manage members incl. other owners, change roles, view audit activity, access every program | — |
| **security_admin** | Full | Invite members (not as owner), suspend/reactivate/remove members, manage program access, view security activity, manage security settings | Change an existing member's role, manage org identity/billing, transfer ownership |
| **program_manager** *(org-level)* | Limited | Manage assigned programs, manage members within assigned programs | Manage org members/roles, access unassigned programs, view org-wide audit, manage billing |
| **triager** | Limited | Access triage workflows for assigned programs | Manage org/program membership, access unassigned programs, org-wide audit, billing |
| **billing_admin** | Limited | **Nothing** | Manage members, change roles, manage org settings, access program data — the role's own description states plainly: *"Billing capabilities are intentionally not implemented in this slice; this role currently grants no additional access."* |

Two structural facts worth flagging precisely, because they are easy to misread from the enum name alone:
1. **`billing_admin` exists in name only.** Confirmed by grep across every migration: the payment/payout migration (`202608290001_payment_ledger_and_payout_orchestration.sql`) explicitly notes *"billing_admin gains no new capability here"* — payment creation/initiation/cancellation is owner/security_admin-only, identical to bounty finalization. There is no billing surface anywhere in `app/` for any role.
2. **The org-level `program_manager` role is not the same thing as program-level access.** `DOMAIN.md` is explicit about this and the schema enforces it: holding the org-level `program_manager` role grants **zero automatic access to any program** — real program access comes only from an explicit `program_members` row (role: `manager`, the only program-level role that exists) or from Owner/Security Admin's organization-wide oversight. Unlike Bugcrowd's Program Administrator/Analyst/Viewer or Intigriti's Admin/Editor/Member/Reader, Unpatched has exactly **one** program-scoped role (`manager`) — no viewer/read-only, no analyst-without-reward-authority tier exists at the program level.

### Unpatched Platform Admin — determined to not exist as a real capability

Searched for: `platform_admin`, `platform_role`, `superuser`, `internal admin`, `support role`, `moderation role`, `global operator`, service-role-only operations.

**Found**: `public.platform_role` is a real enum — `('researcher', 'organization_owner', 'program_manager', 'triager', 'platform_admin')` — on `public.users.platform_role`, defaulting to `'researcher'` (`202608250001_initial_identity_rbac.sql`). A TypeScript guard, `requirePlatformAdmin(user)`, exists in `services/authorization.ts` and checks `user.platformRole !== "platform_admin"`.

**Also found, decisively**: grepping every migration for any statement that ever sets `platform_role` to anything other than its default returns **zero matches**. No RPC, trigger, or migration ever assigns `'platform_admin'` (or `'organization_owner'`, `'program_manager'`, or `'triager'` — the other three non-default values) to any user, ever. And grepping the entire application for call sites of `requirePlatformAdmin` returns exactly two files: its own definition and its own unit test — it is **never called from any action, service, route, or RPC in the actual product**.

> **Unpatched currently has no first-class platform administration layer.** A `platform_role` column and a guard function exist in the schema/codebase, but nothing in the product can ever legitimately set a user's `platform_role` to `platform_admin` (or to any of the other three non-`researcher` values), and the one function that would gate a platform-admin-only capability is dead code with zero call sites. Functionally, every user in Unpatched today is identical at the platform layer — the only real authorization differentiation happens at the organization-membership and program-participation layers.

Consequences that follow directly from this, verified against the RLS layer:
- **No cross-organization visibility exists for anyone.** `audit_logs` RLS (`"audit logs read by org admins"`, `202608260001_organization_membership_lifecycle.sql`) scopes strictly to that organization's own owner/security_admin — there is no platform-wide audit view, matching none of HackerOne/Bugcrowd/Intigriti's model, where the platform itself retains cross-customer audit/enforcement capability.
- **No managed/platform-side triage exists.** Every one of the three competitors interposes its own staff (security analysts / ASEs / Triage team) between a raw submission and the organization's own review. Unpatched has no equivalent — every report goes straight to the owning organization's own triage, with no platform-side first-pass validation option.
- **No platform-wide researcher enforcement exists.** All three competitors reserve the right to ban/sanction a researcher across every program on the platform (Code of Conduct violations, sanctioned-country screening, behavior-points systems). Unpatched has no cross-program suspension mechanism for a researcher — `program_researchers.status` (`active`/`suspended`/`revoked`) is scoped to one program row at a time; suspending a researcher on one program does nothing to their standing on any other.
- **No dispute mediation exists.** Two of three competitors (HackerOne, Bugcrowd) run a named mediation function; Unpatched has no equivalent for either side (researcher vs. org) of a disagreement.
- **Payment custody sits with the organization, not a platform authority.** All three competitors are the payments processor (identity verification, tax, payout disbursement) standing between the org's bounty decision and the researcher's bank account. In Unpatched, `payment_obligations`/`payment_attempts` are org-owner/security_admin-operated directly (manual-provider only, per `docs/decisions/0014`) — there is no platform-side payment intermediary, verification, or disbursement step at all.

---

## 3. Critical rule audit — can a researcher create an organization?

**Product rule stated**: *"A researcher should not be able to create an organization merely because they have a researcher account."*

**Unpatched's actual, live-tested behavior violates this rule.** `create_organization` (`202608260003_organization_creation.sql`) has exactly one authorization check:

```sql
if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
```

That is the entire gate. No role check, no `platform_role` check, no "has this user ever only been a researcher" check. `EXECUTE` on the function is granted to `authenticated` (every signed-in user) and explicitly revoked from `public`/`anon`. This is not an accidental gap — `DOMAIN.md`'s own "Organization lifecycle" section states it as a deliberate design choice: *"Any authenticated user can create an organization and becomes its owner — there is no approval step and no limit on how many organizations one user may create or own; nothing in this domain restricts it."*

### Live test, all five identities, against the real running RPC (not the UI)

| Identity | Setup | Result |
|---|---|---|
| Pure researcher (active `program_researchers` row, zero `organization_members` rows) | Real signed-up account, attached as an active researcher on an existing program via the real invitation-acceptance shape | **SUCCEEDED** — created an organization and became its owner |
| Organization owner (existing account) | Real seeded owner account | **SUCCEEDED** |
| Organization member, non-owner (`triager` role) | Real signed-up account, attached with role `triager` | **SUCCEEDED** |
| Stranger — authenticated, zero organization/program relationships of any kind | Fresh signup, no other data | **SUCCEEDED** |
| Anonymous — no session | `anon` key, no sign-in | **REJECTED** — `28000 AUTH_REQUIRED: authentication required` |

Anonymous is correctly blocked. Every authenticated identity — including a pure researcher with no organizational standing whatsoever — succeeds identically. This was verified against the real local Postgres/GoTrue instance (not a mock), and the created test organizations/accounts were deleted afterward.

This also surfaces a related identity-model fact worth naming precisely: because `platform_role` (Section 2) is inert and organization membership/researcher participation are deliberately-separate, orthogonal domains (`DOMAIN.md`'s own explicit statement), **nothing in Unpatched's data model represents "this person's primary account type."** A user is simultaneously (or by turns) a researcher on zero-or-more programs and an owner/member of zero-or-more organizations, with no first-class flag distinguishing "a researcher" from "an organization" as the two competitor platforms above implicitly assume when a company signs up. The three-tier navigation (`components/app-shell.tsx`) reflects this directly and deliberately — both "Research" and "Organization" nav groups are shown to every signed-in user unconditionally, with an explicit code comment stating this is intentional rather than an oversight, since hiding either would hide real, reachable functionality from a user who happens to hold both kinds of standing.

---

## Gap analysis summary (audit only — nothing below has been implemented)

1. **No platform administration layer exists**, despite schema/code scaffolding (`platform_role`, `requirePlatformAdmin`) suggesting one was planned. All three competitor platforms treat the platform company as an active third tier with real operational authority (launch approval, managed triage, mediation, platform-wide researcher enforcement, payment custody). Unpatched has none of this — the closest thing, `platform_role`, is dead weight today.
2. **`create_organization` violates the stated product rule** that a researcher account alone should not be sufficient to create and own an organization. Live-proven across all four authenticated identity types tested; only anonymity is rejected.
3. **No program-discovery surface exists** for researchers (no public/registered/application visibility tier, despite `DOMAIN.md` prose suggesting otherwise) — a substantial gap against all three competitors' core acquisition mechanism.
4. **No retest mechanism exists** — present on all three competitor platforms, absent from Unpatched's report lifecycle entirely (terminal states have no exit transition by design).
5. **`billing_admin` is a real enum value with zero implemented capability** — worth deciding whether to build it out or remove it, since its current state (a selectable role that visibly does nothing) could itself read as a broken promise to an organization configuring its team.
6. **Program-level roles are far coarser than every competitor's model** — Unpatched has exactly one (`manager`); Bugcrowd/Intigriti both have three-to-four-tier program RBAC (Administrator/Analyst/Viewer; Admin/Editor/Member/Reader).
7. **No platform-side payment custody** — organizations pay researchers directly (manual, operator-confirmed), unlike all three competitors, where the platform itself handles researcher identity verification, tax collection, and payout disbursement.

No implementation work has been done in this slice. This document is the audit; the next step is an explicit product decision on which of the above gaps to close, and in what order.
