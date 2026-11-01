# 0003: Organization creation — atomic RPC, auto-generated slug, real idempotency, dual invitation-discovery paths

Date: 2026-08-26
Status: Accepted

## Context

Phase 2 built the entire organization-membership lifecycle (invite, accept, suspend, reactivate, remove, role change) and Phase 2.5 added authentication — but no organization could ever come into existence in the first place. A freshly signed-up user reached `/organizations` and saw a placeholder saying creation wasn't part of that release. This closes that gap: the first-run journey (sign up → create or join an organization → reach the Organization Control Center) is now complete and verified end to end in a real browser.

## The creation transaction

`create_organization(org_name, p_idempotency_key)` — one `SECURITY DEFINER` function, one transaction: derive the actor from `auth.uid()` (never a parameter), validate the name, check for an idempotent replay, generate a unique slug (retrying with a random suffix on collision), insert the organization, insert the owner membership, insert the `organization.created` audit event, return the organization. All of it commits together or none of it does — there is no code path that creates an organization without an owner, an owner without an organization, or either without the audit event, because the whole sequence is one function call, and one function call is one Postgres transaction.

## Authorization

Any authenticated user can create an organization and becomes its owner. There is no approval step and no per-user limit — nothing in `DOMAIN.md` or the existing schema restricted this, and this document is where that's now made explicit rather than left implicit. The client can only ever supply a name and an idempotency key; `created_by`, the owner role, and the audit actor are all derived from `auth.uid()` server-side, confirmed both by static review (the function's parameter list literally has no `created_by`/`role`/`actor_id` argument — enforced by a permanent regression test in `tests/unit/migration-security.test.ts`) and by live testing (anonymous calls are rejected before the function body even runs, since `EXECUTE` was never granted to `anon`).

## Slug and name

Routing is UUID-based (`/organizations/[organizationId]/...`), so a human-typed slug would add a form field and a uniqueness-conflict UX problem for zero product benefit — the slug is generated server-side from the name (ASCII-normalized, lowercase, collision-resolved with a random suffix) and is not exposed as something the user sets. `name` is never altered beyond trimming — DESIGN.md's principle of not silently rewriting user-visible text applies here the same as it does to report content. Organization names are not unique (nothing in the domain requires it); only the generated slug is.

## Idempotency

A client-generated idempotency key (one per dialog session, not per submit) is enforced by a real database constraint — `unique (created_by, idempotency_key) where idempotency_key is not null` — not just a disabled submit button. A replayed key returns the organization already created for it instead of creating a second one, including under genuine concurrency: two simultaneous requests carrying the same key both return the identical organization id, proven with two parallel background HTTP calls against a real Postgres instance, not simulated sequentially. This directly answers the double-submission/duplicate-organization risk named as a specific concern for this slice.

## Multiple organizations per user

Deliberately allowed. `organization_members`' composite primary key already supported it, and nothing in `DOMAIN.md` said otherwise — restricting it would have been inventing a rule the domain doesn't state. Tested live: the same authenticated user successfully created two distinct organizations in the same session.

## Invitation discovery without an admin's help

Two additions close a real gap: an invitee previously had no way to see their own pending invitations in-app (the existing `organization_invitations` RLS policy is admin-only, and `organizations`' own policy requires active membership an invitee doesn't have yet). `list_my_pending_invitations()` is a new `SECURITY DEFINER` function scoped to the caller's own email, returning the organization name safely. `accept_organization_invitation_by_id(invitation_id)` accepts without the raw token, gated by the identical accepting-account-email-must-match-invitation-email check the token-based path already used — this is not a weaker authorization boundary, since the token's actual role was always "how did you find out about this," not an independent proof beyond what email-matching already provides. `cancel_organization_invitation` was widened to let the invitee decline their own invitation (reusing the existing `revoked_at` mechanism, not inventing a new "declined" state `DOMAIN.md` doesn't define).

## Two real bugs found during live verification, both fixed before this shipped

1. `create_organization`'s idempotency-key parameter shared its literal name with the `organizations.idempotency_key` column, making every bare reference to it inside the function ambiguous to Postgres. Fixed by prefixing the parameter (`p_idempotency_key`).
2. `list_my_pending_invitations`'s `RETURNS TABLE(id uuid, ...)` made `id` an output-parameter-like variable in scope across the whole function body, colliding with an unrelated, earlier query. Fixed by qualifying that reference.

Neither was security-relevant (both were fail-closed 400/500 errors, not silent bypasses) and neither was visible from source review — both were caught only because this session had a real, working local Postgres instance to run the functions against. See `docs/security/phase-2-rpc-review.md` for the full detail and every other live-verified property of these functions (anonymous rejection, cross-tenant isolation of the new RPCs, real concurrent idempotency, audit-transaction atomicity).

## Deferred lifecycle operations

Only `CREATED`/`ACTIVE` exist today (organizations are created directly at `ACTIVE`; `CREATED` is reserved for a future review/provisioning step this slice doesn't need). Organization deletion, suspension, and archival are explicitly out of scope — `status` is already a real enum column on the table, so adding a `SUSPENDED`/`ARCHIVED` state later needs no schema redesign, only new transitions and their own authorization/audit rules.

## What remains unverified

Everything a hosted (non-local) Supabase project would need independently confirmed — see `docs/security/phase-2-rpc-review.md`'s existing "what remains genuinely unverified" list, which applies here unchanged.
