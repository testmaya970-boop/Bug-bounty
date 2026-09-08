# 0007: Researcher access — invitation-only participation, a third and separate authorization domain from organization/program management

Date: 2026-08-27
Status: Accepted

## Context

`DOMAIN.md`'s conceptual path is `Researcher → Report → Program → Organization → Assets`, and its "Actors and relationships" section already names Researcher as a first-class actor, distinct from Organization Member. Every Sentinel account already defaults to `platform_role = 'researcher'` at signup (`202608250001`'s `public.users` default) — "researcher" is the ordinary baseline identity of any Sentinel user, not a special account type someone opts into. What has never existed until now is a way for a specific researcher to become *authorized to participate in a specific program*, and for the system to answer that question reliably for future report authorization to depend on.

## Three distinct authorization domains, never merged

1. **Organization membership** (`organization_members`) — internal staff, five roles, org-wide.
2. **Program management** (`program_members`) — who *manages* a specific program (currently one role, `manager`).
3. **Researcher participation** (`program_researchers`, new in this migration) — who is *authorized to test* a specific program, as an external actor with no organization relationship at all.

A researcher authorized for a program never gains organization membership and never gains access to a different program in the same organization merely because they share it — `program_researchers` is scoped by `(program_id, user_id)`, exactly as narrow as `program_members` already is, and carries no path into `organization_members` or `organizations` (see "RLS" below for the exact boundary this produces).

## Chosen access model: invitation only

Of the task's named options (invitation, application, organization approval, public enrollment, private invitation, or a combination), this slice implements **invitation only** — a program manager identifies a specific researcher by email and invites them, mirroring `invite_organization_member`'s already-proven shape exactly (token generated client-callable-once, SHA-256 hashed at rest, expiring, single-use, email-bound). Application (researcher self-initiates, manager approves) and public self-enrollment are real, deferred capabilities, not accidentally-missing ones:

- **Application** requires the researcher to already know a program exists, which today only happens through an invitation anyway — building a second workflow that produces the identical outcome (a `program_researchers` row) would add real complexity for zero reachable behavior difference until public/private program *discovery* exists.
- **Public enrollment** requires public program discovery, which this task explicitly defers, and a self-enrollment eligibility model `DOMAIN.md` does not yet define.

Both remain straightforward additions later: `program_access_source` (below) already anticipates a second value.

## Program visibility is a real, separate concept — deliberately not added as a column yet

`DOMAIN.md`'s "Programs" section names four program types (public, private, invite-only, vulnerability disclosure) — a real distinction the task asked this slice to define separately from *access*. This slice's only functional access path (invitation) behaves identically regardless of what a program's eventual visibility classification would be: a manager can invite a specific researcher to a program whether it is meant to end up public, private, or invite-only. No code in this migration reads or branches on a visibility value, so adding a `programs.visibility` column now would be schema with no consumer — exactly the kind of speculative addition `ARCHITECTURE.md`'s "add only with a documented reason" principle warns against. The distinction becomes behaviorally relevant the moment a future slice adds public discovery or self-service application; that is the right point to add the column, informed by what that consumer actually needs. Not deciding this now is the explicit decision, not an oversight.

## Program lifecycle interaction: not gated

Scope mutation is gated to `program.status = 'draft'` (0005/0006) because scope defines what becomes authorized once a program is live and should stabilize before publication. Researcher invitation is **not** lifecycle-gated in this migration, for a concrete, current reason: no status-transition RPC exists yet (0005-program-lifecycle.md), so every program that can exist today has `status = 'draft'` and always will until a future slice adds transitions. Gating researcher invitation to, say, `active` would make this entire slice permanently unreachable through the product's own creation flow — not a defensible outcome for a slice whose purpose is exercising this workflow end-to-end. Whether `review`/`active` should matter here is a real open question for whichever slice adds status transitions; deciding it now, before a single transition exists to observe the consequence of, would be inventing a rule the task explicitly warned against.

## Researcher participation state machine

`program_researchers.status`: `active`, `suspended`, `revoked`. No `pending`/`invited` status on this table, for the identical reason `organization_members` has none (`DOMAIN.md`'s "Organization membership" section): a person cannot participate in a program before accepting, so the pending phase is represented entirely by an unresolved `program_invitations` row, and accepting is exactly the transition that creates (or reactivates) the `program_researchers` row at `active`. `revoked` is not terminal — a revoked researcher regains access only through a fresh invitation cycle (the accept RPC's `ON CONFLICT` reactivation path already handles this), never through a "reinstate" RPC, which only ever moves `suspended → active` — the identical asymmetry `reactivate_member`/`remove_member` already establish for organization membership, extended here rather than reinvented.

`program_access_source` (`'invitation'` today) records how a participation record came to exist, per the task's explicit "source of access" requirement — a Postgres enum can gain values later (`'application'`, `'admin_grant'`) without a breaking migration.

## Authorization

Every researcher-management RPC (`invite_researcher_to_program`, `suspend_program_researcher`, `reinstate_program_researcher`, `revoke_program_researcher`) reuses the *exact* two-path check every other program-management operation already uses — organization Owner/Security Admin oversight, or a `program_members` row — resolved from the database, never a client-supplied organization/program id taken on faith. No new capability framework was introduced; managing researcher access is treated as part of "managing this program," the same reasoning `0006` already applied to scope management.

## `private.is_researcher_authorized_for_program`: the internal primitive, deliberately single-parameter

The task's suggested signature was `isResearcherAuthorizedForProgram(researcherId, programId)`. This implementation is `private.is_researcher_authorized_for_program(target_program_id)` — no `researcherId` parameter — because it derives the actor from `auth.uid()` internally, the same single-parameter shape `private.is_org_member`/`private.is_program_member` already use. This is not a simplification for its own sake: an RLS-context helper that accepted an arbitrary `researcherId` and answered truthfully for *any* id would recreate the exact "membership/role-existence oracle" finding documented at the top of this file's parent review (`docs/security/phase-2-rpc-review.md`) if it were ever reachable outside its intended RLS-evaluation context. Every helper in this schema answers "is the *current* caller authorized," never "is *this named person* authorized" — a deliberate, load-bearing consistency, not an accidental narrowing.

## Scope relationship stays a separate decision, on purpose

`evaluate_program_scope` (0006) answers "is this target inside the program's scope." This migration answers "is this researcher authorized to be in the program at all." The task explicitly asked these not be combined into one function, and they are not — a future report-creation check composes both (`is_researcher_authorized_for_program(program) AND evaluate_program_scope(program, target).is_in_scope`), each independently testable and independently correct, rather than one function whose failure could be ambiguous about which boundary actually failed.

## RLS: three real widenings, one real narrowing

- `programs`' SELECT policy gains a third path: `private.is_researcher_authorized_for_program(id)` — an active researcher can read the program they participate in (name, status), the same as any manager can, since there is nothing sensitive in that row itself.
- `program_scope_entries`' SELECT policy gains a *conditional* researcher path: `private.is_researcher_authorized_for_program(program_id) and status = 'active'` — a researcher sees only currently-active scope, never the `removed` history a manager can see for audit purposes. This is the real, deliberate narrowing: researcher visibility is intentionally less than manager visibility on this table, per the task's "keep manager-facing and researcher-facing data models separate" instruction.
- `program_researchers` (new): a researcher may read their own row (`user_id = auth.uid()`); the full roster remains manager-only. A researcher is explicitly **not** shown who else participates in the same program, per the task's "do not assume every program participant should see every other researcher."
- `program_invitations` (new): manager-only, identical shape to `organization_invitations`' "read by org admins" policy — no researcher-facing table read exists; a researcher's own pending invitations are served through `list_my_pending_program_invitations()`, a `SECURITY DEFINER` function scoped to the caller's own email, the exact mechanism `list_my_pending_invitations` already established for organizations and for the identical reason (the invitee has no other RLS-permitted path to the program/organization name before they have any relationship to either).

None of this grants a researcher any path into `organization_members`, `organizations`, or `users` beyond what already existed (their own profile) — confirmed live below.

## Data confidentiality

`program_researchers`/`program_invitations` carry no manager-only free-text fields beyond the existing invitation `message` (already present on the organization equivalent and already treated the same way — visible to the admin who wrote it and the invitee it's addressed to, never to other researchers). No rejection-reason or private-notes field exists in this slice — there is no rejection concept, since there is no application workflow to reject from.

## Deferred, explicitly

- Application workflow, public self-enrollment, and the `programs.visibility` column that would make either meaningful.
- A second `program_access_source` value.
- Lifecycle-gating researcher invitation once status transitions exist.
- Reports, triage, bounties, reputation, notifications — named out of scope by the task itself.
