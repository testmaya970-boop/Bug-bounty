# 0009: Report triage — a data-driven transition table, one shared authorize-and-lock primitive, audit as the only history mechanism

Date: 2026-08-27
Status: Accepted

## The state machine is not invented here — it already exists in `DOMAIN.md`

`DOMAIN.md`'s "Reports" section already specifies the exact states and legal transitions:

```text
NEW → TRIAGING | NEEDS_INFORMATION | ACCEPTED | DUPLICATE | INFORMATIVE | NOT_APPLICABLE | REJECTED
TRIAGING → NEEDS_INFORMATION | ACCEPTED | DUPLICATE | INFORMATIVE | NOT_APPLICABLE | REJECTED
NEEDS_INFORMATION → TRIAGING | ACCEPTED | DUPLICATE | INFORMATIVE | NOT_APPLICABLE | REJECTED
ACCEPTED → RESOLVED | NEEDS_INFORMATION
```

`RESOLVED`, `DUPLICATE`, `INFORMATIVE`, `NOT_APPLICABLE`, `REJECTED` are terminal (no outgoing rows). This is implemented **verbatim** as a `private.report_status_transitions` table — every row above is one table row, nothing invented and nothing dropped. The task's own example state names (`validated`, `closed`) do not appear in `DOMAIN.md` and are not used — `DOMAIN.md` wins where the two differ, per this task's own rule. `report_status` (the enum) was already defined in full in `0008`, in anticipation of this exact slice — no enum change was needed here.

## Why a table, not eight hand-written `IF` chains

Every transition RPC needs the identical check — "is my target status a legal move from the report's current status" — with a different target status hardcoded per function. Writing that check as a literal list inside eight separate functions means eight independent places that must agree with `DOMAIN.md`'s table and with each other; a table plus one shared `private.is_valid_report_transition(from, to)` lookup means exactly one place to get right, and a permanent test can assert the table's contents equal `DOMAIN.md`'s table exactly. This is the same "one implementation, several independently-authorized entry points" structure `0008` established for `private.match_program_scope` — reused here for the identical reason, not coincidentally.

## No generic status-update RPC

Every transition is its own public function (`start_triage`, `request_information`, `accept_report`, `mark_duplicate`, `mark_informative`, `mark_not_applicable`, `reject_report`, `resolve_report`) with its **target status hardcoded in the function body**, never accepted as a parameter. A client cannot submit `{ status: "accepted" }` to anything — the closest it gets is choosing *which named function to call*, and each one still independently re-validates the transition against the shared table before doing anything. This is the literal difference between "the client requests an action" (safe) and "the client requests a status" (the bypass risk the task named).

## One shared authorize-and-lock primitive, per transition-specific business rules kept separate

`private.lock_and_authorize_report_for_triage(report_id)` — derives the actor, `SELECT ... FOR UPDATE`s the report row (the row lock, not application-level coordination, is what makes concurrent transitions deterministic — see "Concurrency" below), and authorizes via the *identical* two-path check every other program-management operation already uses (`has_org_role(['owner','security_admin'])` or `is_program_member`). Every transition RPC calls this first, then does only what is unique to it: its own transition-validity check (with its own hardcoded target status), its own required-field validation, its own column updates, its own audit event. `respond_to_information_request` does **not** use this helper — it has its own researcher-specific authorization (`researcher_id = auth.uid()` and `private.is_researcher_authorized_for_program`), since a researcher responding to their own report is a completely different actor class than a manager triaging it.

## Authorization: reuses the existing capability model, does not add a new one

No new capability framework was introduced. Triage authorization is the *same* two-path check `add_scope_entry`, `invite_researcher_to_program`, and every other program-management mutation already uses. This has a real, disclosed consequence worth stating plainly: `services/authorization.ts`'s existing capability text already says Program Manager and Triager (organization roles) may only act on "**assigned** programs" — but no RPC to assign an organization member to a specific program's `program_members` beyond its original creator has ever been built (`0004` explicitly deferred this, and it remains deferred here). In practice today, only an organization Owner/Security Admin (oversight) or a program's original creator can triage its reports — an org-level `Triager` or `Program Manager` role, by itself, grants nothing without that still-missing assignment mechanism. This is not a bug introduced by this slice; it is the same gap `0004` already disclosed, now visibly relevant to a second capability (triage) rather than newly created. Billing Admin, any non-member, and any org member without program standing are correctly rejected — they were never in the eligible set to begin with.

## Assignment: deferred

`DOMAIN.md`'s report field list (title, classification, affected asset, description, impact, reproduction steps, evidence, severity/CVSS, status, comments, events, bounty, resolution) does not name an assignee. Given the authorization model above already narrows "who may act" to a small, non-assignment-dependent set, adding an `assignee` column now would be exactly the "meaningless assignment column" the task warned against — nothing would read or branch on it. Deferred until a future slice actually needs to distinguish "authorized to triage this program" from "the specific person currently working this report."

## Severity: only the organization-confirmed half is implemented

`0008` deferred severity entirely, on the reasoning that "the real distinction (researcher-proposed vs. organization-confirmed) only matters once triage exists to do the confirming." Triage now exists. This slice adds `reports.confirmed_severity` (nullable `report_severity` — the identical `none/low/medium/high/critical` taxonomy `components/ui/badge.tsx`'s `SeverityBadge` already uses, not a new one), settable only by an authorized triager via `set_report_severity`, independent of status transitions (any state, since `DOMAIN.md` does not restrict re-assessment after resolution, and forbidding it would be an invented rule). Researcher-*proposed* severity remains deferred — implementing it would mean reopening `submit_report`'s already-shipped, already-verified creation form for a field the task's own section 30 form list never named, which is a larger and separate change than this slice's actual subject (the triage lifecycle, not the submission form). `confirmed_severity` never overwrites anything researcher-submitted, because nothing researcher-submitted on this axis exists yet to overwrite — there is no collision to prevent, only a future one to leave room for (a nullable column, added independently, is exactly that room).

## Duplicate semantics

`mark_duplicate(report_id, duplicate_of_report_id)` requires the target report to exist and belong to the **same program** (not merely the same organization) — a duplicate relationship across two different programs' independent scopes is not a coherent claim, and restricting to same-program is the stricter, safer reading where `DOMAIN.md` is silent. Self-duplication is rejected. The target report's *own* status is deliberately unrestricted (it need not already be `ACCEPTED`/`RESOLVED`) — `DOMAIN.md` does not require this, and inventing it would add a rule the domain never asked for. A nonexistent target and a target in a different program produce the identical `INVALID_DUPLICATE_TARGET` message, for the same enumeration-safety reason `0008` collapsed "no scope match" and "explicit exclusion" into one message.

## Information requests and the researcher's response

`request_information(report_id, reason)` requires a non-empty reason (stored in `reports.information_request_reason`, the *current* reason — not appended to a history, since audit already preserves every prior one) and is legal from `NEW`, `TRIAGING`, or `ACCEPTED` (exactly the three left-hand sides `DOMAIN.md`'s table lists `NEEDS_INFORMATION` as a target for). `respond_to_information_request(report_id, response)` is the "minimum structured response" the task asked for, not chat: one overwritable text field, legal only while `status = 'needs_information'`, requiring the researcher's participation to still be *active* (not merely that they were once authorized) — reading your own historical report should always work; acting on it requires current standing, the same distinction `submit_report` already draws. Responding never changes `status` — `DOMAIN.md` says researchers cannot change report state, and this holds exactly: a triager must separately call `start_triage` (a legal move from `NEEDS_INFORMATION`) after reviewing the response.

## No dedicated report-history table — audit_logs already is the "event record"

The task asked whether a structured `report_status_events`-style table is warranted, separate from `audit_logs`. It is not, here: `audit_logs` already carries `actor_id`, `action`, `entity_type`, `entity_id`, `metadata` (jsonb: `previous_status`, `reason`, etc. per event), and `created_at` — exactly the "actor, action, reason, timestamp" shape the task described, and exactly what `SECURITY.md` already requires of every sensitive mutation. Building a second table that writes the *same* fact in the *same* transaction would be the literal duplication the task told this slice not to create. `reports.status` is the answer to "what is true now"; `audit_logs` filtered to `entity_type = 'report' and entity_id = X` is the answer to "what happened" — both exist, neither substitutes for the other, satisfying the task's "both are required" instruction without a redundant table. `resolution_summary` and `information_request_reason`/`researcher_response` are the exception: these *are* first-class, `DOMAIN.md`-relevant current-state fields (resolution is explicitly named in `DOMAIN.md`'s field list), not audit trail, so they live as real columns on `reports`, not buried in jsonb.

## Concurrency

Every triage mutation locks the report row (`SELECT ... FOR UPDATE`) before validating the transition. Under Postgres's default `READ COMMITTED` isolation, a second concurrent transition blocks on that lock until the first commits, then re-reads the *already-updated* row before evaluating `private.is_valid_report_transition` — so a race between two different target transitions (e.g., `accept_report` vs. `mark_duplicate` on the same report) always produces exactly one winner and one clean `INVALID_TRANSITION` rejection for the loser, never a lost update and never an impossible combined state. Repeating an already-applied transition (e.g., calling `accept_report` twice) is *not* treated as a safe no-op — it fails with the same `INVALID_TRANSITION` error, a deliberate choice: silently succeeding on a replayed call could mask a real client bug in a security-relevant state machine, where "did this actually happen once or twice" should never be ambiguous. Verified live under genuine concurrency (see the engineering report).

## Program and researcher lifecycle interaction

Triage is **not** blocked by program status (`draft`/`review`/`active`/`paused`/`closed`) — unlike submission, which is blocked while `paused`/`closed`. A paused or closed program may still have reports awaiting a decision, and disabling triage because new submissions are disabled would strand them. A suspended or revoked researcher's historical reports remain fully visible to them (the existing `reports` RLS policy has no dependency on current participation status) and fully triageable by managers (triage authorization never depended on the researcher's status either) — only the researcher's own *response* action requires current active standing, per the read-vs-act distinction above. Nothing cascades: revoking a researcher never deletes, hides, or auto-resolves their reports.

## Confidentiality

A researcher sees: current status, its meaning, `information_request_reason` (when relevant), `resolution_summary` (when resolved), and `confirmed_severity` (transparency about the organization's assessment is not itself sensitive). A researcher does **not** see the raw `audit_logs` trail for their report — who took which internal action and when is manager-facing context, per the task's explicit "a manager's internal action metadata may be sensitive." No new RLS policy was needed on `reports` itself: the existing row-level policy (researcher's own row, org admin, or program manager) already covers every new column identically, since RLS is row-scoped, not column-scoped — the confidentiality boundary above is enforced in the read service/UI layer, choosing which columns to surface to which viewer, the same pattern `getReport`'s `isOwnReport` branch already established in `0008`.

## Deferred, explicitly

Comments/chat, attachments, bounty, payments, reputation, notifications, AI triage, public disclosure, advanced search, analytics, integrations, bulk triage — all named out of scope by the task. Report assignment and researcher-proposed severity, named above.
