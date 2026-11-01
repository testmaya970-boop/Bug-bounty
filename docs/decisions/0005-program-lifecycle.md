# 0005: Program lifecycle — created at draft, no transitions in this slice, no slug

Date: 2026-08-26
Status: Accepted

## Context

`DOMAIN.md` already specifies the Program lifecycle, unlike Organization's simpler `CREATED -> ACTIVE`: "Their lifecycle is `DRAFT -> REVIEW -> ACTIVE -> PAUSED -> CLOSED`; permitted transitions will be implemented server-side with authorization and audit events." Program Foundation only needs the first state to exist; this document is where that's made explicit rather than left to be inferred from what the migration happens to implement.

## Status at creation

Every program is created at `draft`, unconditionally — `create_program` does not accept a status parameter, so there is no client-controlled way to create a program at any other state. This directly satisfies the task's requirement that creation must not imply public visibility, researcher eligibility, or report eligibility: a `draft` program has none of those, and no code path in this slice can produce a program in any other state.

## No transition RPC in this slice

`review`/`active`/`paused`/`closed` exist in the `program_status` enum (all five of `DOMAIN.md`'s states are implemented at the type level, per the task's instruction not to invent states, but also not to leave the domain's own documented states out) but nothing in this slice can move a program between them. Publishing a program to `review` or `active` is a meaningfully different, separate capability — it is the moment scope, policy, and eligibility rules start to matter, none of which exist yet. Building a transition RPC now would either be a no-op stub (a fake capability, which `AGENTS.md`'s "Product integrity" section forbids) or would have to invent the very rules `DOMAIN.md` defers. This is deferred, not missing.

## No slug

Organization creation (`0003-organization-creation.md`) already established the reasoning this reuses: routing is UUID-based, so a slug's only real product purpose is a future public/researcher-facing discovery page, which does not exist for programs yet (researcher access is explicitly out of scope for this slice). `programs` has no `slug` column. If/when a public program page is built, that is the point to design normalization, uniqueness scope, collision behavior, and reserved values for a real consumer — inventing that policy now, with no actual reader of the slug, would be exactly the kind of speculative design `AGENTS.md` and `ARCHITECTURE.md` both warn against ("add ... only with a documented reliability, performance, isolation, or cost reason").

## No program name uniqueness

Mirrors the organization-creation precedent: organization names are not unique, only the (organization-scoped) slug was. Since programs have no slug, there is no uniqueness constraint on program name at all — two programs in the same organization may share a name. Nothing in `DOMAIN.md` requires uniqueness, and inventing a constraint the domain doesn't ask for would risk a false collision error for a legitimate case (e.g., two genuinely distinct engagements an organization chooses to name identically).

## Deletion

Out of scope, for the same reason organization deletion is out of scope: no lifecycle mechanism (`CLOSED`) has been wired up yet, and nothing in the schema or authorization model needs to change later to support it — `status` is already the real, typed enum column, not inferred state.

## What this enables next

Once scope/policy exists, a future slice can add `advance_program_status`-style transition RPC(s) with their own authorization (likely still Owner/Security Admin, or possibly the program's own `manager`s — an open question for that slice, not this one) and audit events, following the exact pattern `create_program` already establishes.
