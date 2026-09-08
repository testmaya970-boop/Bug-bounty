# 0004: Program authorization — creation restricted to full-access org roles, access derived from program membership, not org role

Date: 2026-08-26
Status: Accepted

## Context

Program is the next domain object after Organization, and per `DOMAIN.md`'s existing "Organization membership" section, program-level access is explicitly **not** the same concept as an organization role: "Organization-level authority and program-level access are different concepts and are never collapsed into one role field... each program membership (once programs exist) carries its own, separate program-level permissions." This document makes that separation concrete for the first time, before any Program code exists, per `AGENTS.md`'s working method (read the governing documents, decide, then implement).

## Who may create a program

Restricted to organization roles with `services/authorization.ts`'s existing "Full" `organizationAccess`: **Owner** and **Security Admin**. This is the same allowed-role set `canManageMembers` already uses for organization-membership mutations, exposed here under its own name (`canCreateProgram`) because program creation and member management are separate capabilities that happen to share an allowed-role set today, not the same capability under two names — they could diverge later without forcing an unrelated rename.

Why not Program Manager, despite the name? The org-level `program_manager` role's own documented capability is "Manage **assigned** programs" (`describeOrganizationAccess`) — assignment presupposes the program already exists and this person was granted access to it. Reading "Program Manager" as "may create any program in the organization" would grant an organization-wide creation right to a role `DESIGN.md`/`DOMAIN.md` otherwise scope to "Limited" organization access, which is inconsistent with how every other Limited-access role in this codebase behaves. Triager and Billing Admin have no program-management capability at all in the existing access summaries, so neither can create one either.

## Who manages a program once it exists

Two independent paths, both enforced server-side (RLS and the `create_program` RPC's own check), neither inferred client-side:

1. **Organization Owner or Security Admin** — full oversight and management of *every* program in their organization, regardless of whether they are individually assigned to it. This matches their existing "Full" `organizationAccess` and is the same reasoning `private.has_org_role` already expresses for organization membership.
2. **An explicit `program_members` row** — a genuinely separate, program-scoped permission, exactly as `DOMAIN.md` already specified. This slice defines one program-level role, `manager`, and grants it to the creator automatically, in the same transaction as creation.

An organization member holding the org-level `program_manager` role gets **no automatic access** to any program merely by holding that role — they need a `program_members` row, just like anyone else. This is the concrete meaning of "different concepts, never collapsed into one role field."

## Does a program have its own roles?

Yes: `program_member_role` is a new enum, deliberately starting with a single value, `manager`. It is intentionally not reused from `organization_member_role` — conflating them was the exact anti-pattern `DOMAIN.md` warns against. Additional program-level roles (e.g., a program-scoped triager once triage exists) are added when the capability they'd gate actually exists, not speculatively now.

## Can a program have multiple managers?

The schema supports it — `program_members` has a composite primary key `(program_id, user_id)`, the same shape `organization_members` already uses for the same reason. This slice does not build a way to *add* a second manager after creation (no "add program member" UI or RPC) — see "Deferred" below. The creator is never the *only possible* manager, just the only one this slice can produce.

## Do Security Admins have implicit program access?

Yes, for the same reason Owners do: both hold "Full" organization access today, and a security engagement boundary should not be invisible to the organization's own security administrators. Program Manager and Triager (org roles) do not get implicit access — theirs is scoped strictly to what `program_members` grants them, which for this slice is nothing beyond what they create.

## Tenant isolation

Every program read and write is authorized against the caller's *actual* current database state, never a client-supplied `organization_id` alone:

- `create_program(target_org_id, ...)` re-derives the actor from `auth.uid()` and calls `private.has_org_role(target_org_id, ...)` — a user from Organization A supplying Organization B's id receives the same `FORBIDDEN` error whether Organization B exists and they're not a member, or Organization B does not exist at all, so no existence oracle is created either way (see `SECURITY.md`'s "private program existence is not revealed to unauthorized people").
- The `programs` RLS policy repeats the same two-path check (`has_org_role` or `is_program_member`) independently of the RPC-level check, as defense in depth — `ARCHITECTURE.md`'s "RLS reinforces, but never replaces, service-level authorization."
- `private.is_program_member` follows the identical pattern to `private.is_org_member` (`plpgsql`, `stable`, `security definer`, `search_path = ''`, defined in the non-exposed `private` schema so it is never directly callable over the Data API as an arbitrary-program-id membership oracle) — see the 202608260001 migration's own comment for the full rationale, which applies unchanged here.

## Deferred (explicitly, not by omission)

- Adding a second program manager, or any other program member, after creation — no RPC or UI exists for this yet.
- Program-level roles beyond `manager`.
- Any transition of program status (see [[0005-program-lifecycle]]).
- Scope/assets, researcher access, reports, triage, bounties — named out of scope by the task itself.
