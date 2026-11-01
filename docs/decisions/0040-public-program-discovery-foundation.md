# 0040 — Public program discovery: core marketplace foundation (research only)

Related: [[0004-program-authorization]], [[0005-program-lifecycle]], [[0007-researcher-access]],
[[0021-program-lifecycle-transitions]], [[0037-program-discovery-access-model]],
[[0038-researcher-discovery-product-model]], [[0039-trust-based-researcher-discovery-strategy]].

Per the explicit stop condition: no migration, RLS, RPC, or UI was written this pass.

## 1. Exact root cause of current absence of public discovery

Confirmed directly from schema, not inferred: `public.programs` has no `visibility`
column at all (`202608260004_program_foundation.sql:47-59`, unmodified by any later
migration), its SELECT policy is `to authenticated` only with no `anon` grant anywhere
(`202608260002_data_api_table_grants.sql:20-22` explicitly states "`anon` gets nothing"),
and `ProgramDiscoveryPreview` performs zero data fetching -- it is a static disclosure
paragraph. There is no code path, partial or broken, to disable -- the capability simply
does not exist yet, exactly as `0024`/`0025`/`0026` already documented.

## 2. Competitor public-program mechanics (freshly researched)

| Platform | Anonymous discovery? | Anonymous detail page? | Public info | Stays private | Public still restricts participation? | Paused behavior | Closed behavior |
|---|---|---|---|---|---|---|---|
| HackerOne | Yes (public program pages exist, e.g. Cloudflare's) | Yes | Scope, rules, payout ranges | Report content, researcher identity | **Yes** -- "open to any *eligible* researcher," disclosure-guideline agreement required even for public programs | Not directly confirmed by search this pass | Not directly confirmed this pass |
| Bugcrowd | Public listing exists | Yes, via the "Program Brief" | Company overview, in-scope target groups, reward structure | Report/researcher detail | Implied yes (brief-gated understanding before testing) | Not confirmed this pass | Not confirmed this pass |
| **Intigriti** | Yes, for `public`-type programs | Yes, fully | **All details, no login required** for true `public` programs | For the separate `application`-type program, only description + bounty level are public; full scope requires login + application | **Yes, explicitly** -- Intigriti has a *distinct* `application` visibility tier where public listing and full access are deliberately decoupled | N/A found | N/A found |
| YesWeHack | Yes -- "you can fetch all public programs directly without authentication" (direct API-level confirmation) | Yes | Scope, exclusions, bounty ranges | Private-program details (JWT-gated) | Account required to actually participate (registration, not application) | N/A found | N/A found |
| Immunefi | Yes | Yes | Assets, impacts, scope, payout terms, all defined upfront | Report content | Account implied for submission | N/A found | N/A found |

**The single most useful finding**: Intigriti is the only platform whose documentation
explicitly names *two independent axes* the way this task's brief does --  a fully
`public` tier (open, no gate) and a separate `application` tier (public listing, gated
detail/participation). This is the strongest real-world confirmation that "publicly
listed" and "immediately able to submit" are not the same thing and should not be
modeled as one flag.

## 3. Unpatched's current program authorization model (confirmed exact)

`programs` SELECT (`202608260004...sql:112-117`): `has_org_role(organization_id,
['owner','security_admin']) or is_program_member(id)`. `program_scope_entries` SELECT
(`202608260005...sql:156-161`): identical predicate shape, `organization_id`/`program_id`
substituted. Both `to authenticated` only. Report-submission authorization
(`is_researcher_authorized_for_program`, `202608260006...sql:92-101`) requires an active
`program_researchers` row -- the *only* path into that table today is
`accept_program_invitation[_by_id]`. No `anon` grant exists on any of these tables
(`202608260002...sql:20-22`).

## 4. Recommended visibility model

**`programs.visibility` as a two-value enum, `'private' | 'public'`, default
`'private'`.** No third `invite_only` value -- confirmed unnecessary: "invite-only" is
already fully expressed as `visibility = 'private'` plus the existing, unchanged
invitation mechanism (`program_invitations`/`program_researchers`). Adding a third value
would duplicate a behavior the schema already has under a different name, which is
exactly the "unnecessary enum" the brief warned against.

## 5. Lifecycle × visibility matrix

| Lifecycle | Visibility | Anon discover (listed)? | Anon detail page? | Researcher detail? | Accepts reports? | Access path |
|---|---|---|---|---|---|---|
| draft | private | No | No | No (unless already a member) | No | Invitation only |
| draft | public | **No** (value may be *stored* as the org's stated intent, but has no visible effect) | No | No | No | N/A |
| review | private | No | No | No | No | Invitation only |
| review | public | **No** (same reasoning as draft -- not yet launched) | No | No | No | N/A |
| active | private | No | No | Only if already a member | Yes (from members) | Invitation only |
| **active** | **public** | **Yes** | **Yes** | Yes | **Yes** | Open (see §12) or invitation |
| paused | private | No | No | Only if already a member | No | Invitation only (existing members retain read access, cannot submit -- unchanged from today) |
| paused | public | **Yes, remains listed** | Yes, with an explicit "Paused -- not currently accepting reports" state | Yes | No | None (existing members only, no new access grantable while paused) |
| closed | private | No | No | Only if already a member | No | None |
| closed | public | **Yes, remains listed as an archived/closed record** | Yes, marked "Closed" | Yes | No | None |

**Why draft/review + public has no effect**: `202608260004`'s own header (line 32)
already states "a draft program has no public/researcher-facing exposure -- no such
surface exists yet regardless." Letting visibility take effect before a program reaches
`active` would let an unfinished, possibly-scopeless program leak publicly -- a real risk
the matrix closes by making the public query itself require `status in ('active',
'paused','closed')` in addition to `visibility = 'public'`, never relying on visibility
alone.

**Why closed stays visible, not hidden**: this platform's own, already-established design
philosophy (the entire audit-trail/lifecycle-transition architecture, `0021`) treats
history as something that is recorded and never quietly removed. Hiding a closed program
from discovery would contradict that philosophy and would also remove the one thing a
closed program's public page can honestly still provide: a verifiable track record.

**Why paused stays visible with a distinct state, not hidden**: matches how paused
already behaves for existing members today (visible, cannot submit) -- extending that
same shape to public visitors rather than inventing a second, different paused behavior
for anonymous vs. authenticated visitors.

## 6. Anonymous access model

Can discover public programs: yes, `active`/`paused`/`closed` + `visibility='public'`
only. Can open the detail page: yes, same set. Can see scope: yes (scope entries carry
no PII -- confirmed in §9). Can submit a report: **no** -- submission requires an
account, always (matches every competitor researched; Unpatched's own `submit_report`
already requires `auth.uid()`). Can apply: not in the MVP (§12). Can sign up: yes,
unchanged, existing flow.

## 7. Researcher access model

Same discovery as anonymous, plus: can submit directly to an `active + public` program
without a prior invitation (§12's "open" model), can still receive/accept invitations to
`private` programs exactly as today, and can still see any program (regardless of
visibility) it already has an active `program_researchers` row for -- unchanged.

## 8. Organization access model

An org's own programs, at any visibility/status, remain fully visible to that org
exactly as today (existing policy, unmodified). A stranger organization gets nothing
beyond what any anonymous/researcher visitor would see for that org's `public` programs
-- no elevated access merely for being an organization.

## 9. Public-safe data model

| Field | Exists? | Public-safe? | Needs new RLS? | Needs new schema? | Why |
|---|---|---|---|---|---|
| Program name | Yes (`programs.name`) | Yes | Yes (new RPC path, see §11) | No | Already exists, already validated (1-160 chars) |
| Organization name/slug | Yes (`organizations.name`/`slug`) | Yes, if column-projected explicitly (never `select *` -- the row also carries `created_by`, `idempotency_key`) | Yes | No | Confirmed safe; no PII on these two columns |
| Program status | Yes | Yes | Yes | No | Needed to render paused/closed states honestly |
| **Program description / policy text** | **No** | N/A yet | N/A | **Yes -- genuine gap** | No field exists anywhere for org-authored narrative (company overview, submission instructions, out-of-scope rules) -- every competitor researched has this and Unpatched has nothing equivalent |
| Scope (in-scope/out-of-scope targets) | Yes (`program_scope_entries`) | Yes, `status='active'` rows only | Yes | No | This *is* the thing a public program must disclose; no PII on the table (confirmed: only free text is a 500-char org-authored `description` per entry, not contact/researcher info) |
| Scope entry `description` | Yes | Yes (org-authored, same trust level as the targets themselves) | Yes | No | |
| Program access model (open/invite) | Derivable from `visibility` | Yes | Yes | No new field -- `visibility` alone implies it per §12's MVP scope | |
| Last updated | Yes (`updated_at`) | Yes | Yes | No | |
| Organization members, other researchers, reports, evidence, communication, bounty/payment history | Exists, but out of scope for a public program page entirely | **Never public** | N/A | N/A | Not requested by this task and no competitor exposes this either |

## 10. Privacy / security boundaries

Confirmed nothing on `program_scope_entries` is sensitive beyond the org's own authored
text (§9) -- no contact info, no internal notes column exists at all. The real risk is
not a field-level leak, it's an **existence-oracle leak**: a public RPC must return the
identical "not found" result for (a) a genuinely nonexistent program id, (b) a real but
`private` program id, and (c) a real but not-yet-active public-flagged program id --
never distinguishing "exists but you can't see it" from "doesn't exist," matching the
generic-`NOT_FOUND` discipline already used elsewhere in this schema (e.g.
`lock_and_authorize_program_for_lifecycle`'s `PROGRAM_NOT_FOUND`, which is already
audience-appropriate since that function is authenticated-only; the *new* anonymous path
needs its own version of the same discipline).

## 11. RLS design

**Not a new RLS policy on the base tables.** The established, consistent pattern in this
schema is unambiguous and total: `anon` has zero grants on any table
(`202608260002...sql:20-22`, "anon gets nothing," deliberately), and the one existing
anon-reachable capability in the whole codebase
(`check_sign_in_rate_limit`) is a thin `SECURITY DEFINER` RPC wrapper, never a direct
table policy. A new permissive `anon` SELECT policy on `programs`/
`program_scope_entries` would be a first-of-its-kind exception to that pattern and
strictly riskier (harder to audit exactly which columns are exposed, easier to
accidentally widen later). **Recommendation: two new SECURITY DEFINER RPCs**,
`list_public_programs()` and `get_public_program(program_id)`, granted to `anon` and
`authenticated`, each explicitly column-projecting only the fields in §9's "public-safe"
rows, each internally filtering `visibility = 'public' and status in
('active','paused','closed')` before returning anything, and each returning the
identical not-found shape for every other case (§10).

## 12. Access-after-discovery model -- smallest initial model

Evaluated: **PUBLIC + OPEN** (any authenticated researcher can submit once they find the
program), **PUBLIC + APPLICATION** (Intigriti's richer tier -- review/approve before full
access), **PUBLIC + INVITATION** (contradiction -- if it still requires an invitation it
isn't meaningfully more discoverable than private), **PUBLIC + ELIGIBILITY** (requires a
reputation-gating mechanism `0039` already found immature). **Recommended: PUBLIC +
OPEN**, as the smallest model, matching the *default* behavior of four of the five
platforms researched (only Intigriti has a distinct gated tier, and only for a named
program subtype, not its baseline public model). Application-based access is explicitly
deferred, not rejected -- §17.

## 13. Anonymous vs. authenticated (restated precisely)

Anonymous: discover, open detail, see scope -- cannot submit, cannot apply (no
application model in MVP), can sign up. Researcher: same discovery, plus can submit
directly to `active+public` programs and retains all existing private-program behavior
unchanged. Organization: unchanged, full visibility into its own programs regardless of
status/visibility; sees nothing extra for other orgs' `public` programs beyond the same
public view anyone gets. Stranger organization: identical to anonymous/researcher for
programs they don't belong to. Platform admin: unchanged -- via the existing, separately
audited `platform_admins` SECURITY DEFINER surface only, never a direct grant.

## 14. Required schema changes

1. `programs.visibility public.program_visibility not null default 'private'` (new
   two-value enum, §4).
2. `programs.description text` (new, nullable, with a reasonable length cap matching this
   schema's existing conventions -- e.g. the 5000-char cap `researcher_profiles.biography`
   already uses) -- the genuine gap found in §9.
3. `program_access_source` enum (`202608260006...sql:23`, currently `('invitation')`)
   gains a second value, `'public'` -- so a researcher who submits to an open public
   program gets a normal `program_researchers` row with `source = 'public'`, and every
   downstream authorization/reputation-ledger check that already keys off
   `program_researchers` membership (unchanged) continues to work with zero special-casing.
4. A new composite index, e.g. `programs(visibility, status, created_at desc)` -- §15.

No change to `program_scope_entries`, `program_invitations`, or any existing RLS policy.

## 15. Required RPC/service changes

New: `list_public_programs()`, `get_public_program(program_id)` (§11). A public-program
submission path either reuses `submit_report` with a widened authorization check (accept
either an existing `program_researchers` row *or* `visibility='public' and status
='active'`), or -- the cleaner option, avoiding a fork in `submit_report`'s own logic --
a small new step that creates the `program_researchers(source='public')` row
transparently on first submission, after which `submit_report`'s existing authorization
check needs no modification at all. The second option is recommended: it keeps
`submit_report` itself completely unchanged.

## 16. Required frontend surfaces (not designed, named only)

A public programs listing route and a public program detail route, both reachable
anonymously; a visibility toggle in the organization's own program management UI; the
existing `ProgramDiscoveryPreview` component's copy changes from "coming" to real, once
this ships -- not before.

## 17. Marketplace information architecture (conceptual)

Per §9's field table, a listing row needs: program name, organization name, status (with
paused/closed rendered honestly, never hidden), and a one-line reason to care (the new
`description` field, truncated). A detail page needs: full description, full active
scope (in/out), organization name, status, last updated, and a clear call to action
("Submit a finding" if open+active, "Not accepting reports" if paused, "Program closed"
if closed). No fabricated statistics, no researcher counts, no fake activity --
consistent with every prior marketing-page decision in this project.

## 18. Search/filter recommendation

**None initially.** At any realistic near-term program volume, a status filter
(active/paused/closed, or simply "hide closed by default") is sufficient; a search box or
category/technology/industry filter has no data to filter on yet (no category taxonomy
exists, `0039` already deferred inventing one) and would be premature infrastructure for
a listing that may contain a handful of programs at launch. Revisit only once real volume
justifies it.

## 19. Public-program participation model

Confirmed in §12: PUBLIC + OPEN. A researcher who submits to a public+active program
receives a normal `program_researchers` row (`source='public'`) at the moment of their
first submission -- not before, not as a separate "join" action requiring its own UI.

## 20. Migration strategy

Additive only, in the order §14 lists: add the `visibility` enum/column (default
`'private'`, so every existing program stays exactly as private as it is today --
zero behavior change on deploy), add `description` (nullable, no default needed), widen
`program_access_source`, add the new index. No existing row's behavior changes until an
organization explicitly flips a program to `public` -- the migration itself is a pure
no-op for every program that exists today.

## What NOT to build (restated, satisfied)

No researcher matching, recommendations, leaderboard, directory, or scoring (per
`0038`/`0039`, unchanged). No application/approval workflow in the MVP (deferred, not
rejected). No search/filter backend (§18). No new program category taxonomy. No
migration, RLS change, RPC, or UI was written this pass.

## Marketplace strategy -- brutal answer, challenging the stated assumption

Is a public program marketplace *core*? **Yes, but "core to Unpatched's eventual identity"
is not the same claim as "must ship immediately," and the honest sequencing matters more
than the yes/no.** The liquidity argument is real and not just competitor-mimicry: an
invite-only-forever platform has a genuine two-sided cold-start problem --
`0038`/`0039` already established organizations have no way to find new researchers, and
symmetrically, researchers have no way to find new organizations either. Growth under
the current model depends entirely on organizations already knowing who to invite, which
does not scale past an organization's existing network. A real public tier is the only
mechanism researched, across all five competitors, that breaks that specific
bottleneck. That makes it strategically necessary eventually, not optional forever.

But this audit also found concrete, real prerequisites missing today that have nothing
to do with the visibility flag itself: no `description` field (§9/§14), no anonymous-
traffic rate-limiting infrastructure at any layer (confirmed: middleware has none, and
the only anon-reachable RPC pattern is keyed by email, not by IP, which a public listing
endpoint has no equivalent of), and no supporting index (§15). "Core" should be read as
"the foundation this document specifies is worth building soon," not "build the whole
marketplace experience at once" -- the smallest correct slice (§ next) is still
substantially smaller than a full marketplace launch.

## Exact implementation slice #1 (recommended, not started)

The four additive schema changes in §14, plus the two read-only RPCs in §11/§15,
plus the org-side visibility toggle and `description` field on the existing program
management page -- **without** the public submission path (§12/§19) and **without** any
new frontend listing/detail route yet. This lets an organization set a program public and
write a real description, and lets this be verified end-to-end at the data layer, before
committing to the anonymous-facing surface and the submission-authorization change in the
same slice. Splitting it this way means the highest-risk piece (a new anonymous entry
point into report submission) is its own, later, more carefully-reviewed slice, not
bundled into the same change as the schema foundation.
