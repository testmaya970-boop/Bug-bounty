# 0037 — Program discovery / access model audit (research only, no implementation)

Related: [[0004-program-authorization]], [[0005-program-lifecycle]], [[0007-researcher-access]],
[[0021-program-lifecycle-transitions]], [[0024-three-perspective-product-model]],
[[0025-platform-operations-gap-audit]], [[0026-unpatched-product-strategy-and-10x-gap-analysis]].

Per the task's explicit stop condition: **no migration, no RLS change, no new column, no
UI was written for this document.** Every claim below is cited against the live schema.

## 1. Exact root cause of current behavior

A researcher's `/programs` page and a newly-created program are connected by exactly
**one** table: `program_researchers`. Nothing else links them.

- `create_program` (`supabase/migrations/202608260004_program_foundation.sql:131-193`)
  inserts the new row with `status = 'draft'` (line 170) and adds only the **creator** to
  `program_members` (org-side manager role, line 185) -- it touches `program_researchers`
  not at all.
- The `programs` SELECT policy (`...202608260004...:112-117`) grants access via
  `has_org_role(...)` (org owner/admin) **or** `is_program_member(id)` (org-side program
  managers). Neither predicate can ever be true for a researcher.
- A second, additive SELECT policy from a later migration grants access via
  `private.is_researcher_authorized_for_program`, which is `exists(select 1 from
  program_researchers where program_id = ... and user_id = auth.uid() and status =
  'active')` (`202608260006_researcher_access_foundation.sql:92-101`).
- A `program_researchers` row is created by exactly one path: `accept_program_invitation[_by_id]`
  (same migration, lines 231-306), which requires a prior `program_invitations` row whose
  `email` exactly matches the accepting account.

**Root cause, precisely**: creating a program performs zero writes to
`program_invitations` or `program_researchers`. Until an organization explicitly calls
`invite_researcher_to_program` for that specific researcher's email, and that researcher
accepts, no row exists that either RLS policy or either researcher-facing query can match.
This is not a query bug, not a missing join, not a wrong RLS predicate -- it is the
system doing exactly what its own schema comments say it does.

## 2. Is this correct for a draft program? Is active-program invisibility a gap?

This is where the schema itself answers the question, and the answer is genuinely
surprising: **status plays no role in this pipeline at all, for either draft or active.**
`202608260006`'s own header comment, item 4, states this explicitly and deliberately:
*"Researcher invitation is NOT gated by program.status... gating this on anything but
'draft' would make the entire slice permanently unreachable."* An organization can invite
(and a researcher can be granted access to) a program in **any** status, draft included.
And `202608300001`'s header, item 7, confirms lifecycle transitions were built without
touching this: *"invite_researcher_to_program's existing lack-of-lifecycle-gating...
left exactly as 0007 built it, not silently changed."*

So: "researcher can't see this draft program" and "researcher can't see this active
program" are, today, **the identical case** -- both are explained entirely by "no
invitation exists yet," and lifecycle status is not a variable in the equation either
way. That is itself the real finding: Unpatched has never actually modeled "discovery" as
a concept distinct from "access." There is exactly one axis today (membership), and the
task's own instinct to ask "are these being conflated?" is correct -- they aren't
conflated so much as one of the three axes (discovery) simply doesn't exist yet.

## 3. Competitor mechanics (freshly researched, mechanics only)

| Platform | Default state for a new program | Discoverability mechanism |
|---|---|---|
| HackerOne | **All programs begin private.** ~80% stay that way permanently. | Reputation/Signal/Impact-gated: qualifying researchers see it under "Available private opportunities" on their own Opportunities page, or are individually invited. Volume of invites scales with the program's own report volume. |
| Bugcrowd | Private by default; "the majority... are private, invite only." | Eligibility thresholds (recent submission activity, ≥50% validity rate, priority-score band) determine who *can* be invited; invitations are still individually issued, not self-serve. |
| Intigriti | "Typically launched Privately," starting with ~15-20 researchers. | **"Private Programs are not visible to anyone on our platform"** -- explicit confirmation that private means truly hidden, not merely access-gated. Graduates to "application basis" or fully public later, as a deliberate choice. |
| YesWeHack | Private; "only thoroughly vetted and high-ranking hunters are eligible." | KYC verification + skill-challenge performance are prerequisites *before* a hunter is even eligible to be privately invited. Programs "usually start in private before ramping up to public." |
| Immunefi | Public bug bounty is the norm for the main product, but a distinct **"Invite-Only Program"** product exists for curated, time-bound engagements. | Selection is need/skill-matched by Immunefi itself, not self-serve; separately, the **Vaults** system makes a project's bounty funding transparently visible to researchers as a trust signal, independent of program listing. |

**The consistent mechanic across all five**: private/invite-only is the default and the
overwhelming majority state, at every one of these platforms, indefinitely -- not a
temporary "review" phase. Where a discovery layer exists, it is never "anyone can see any
active program"; it is either (a) a fully public opt-in graduation the organization
chooses, or (b) an eligibility-gated listing shown only to researchers who already clear
a reputation/vetting bar. None of the five make "program is active" by itself sufficient
for a researcher to discover it.

## 4. Lifecycle vs. discovery vs. access -- and why they must stay separate

- **Lifecycle** (`draft→review→active→paused→closed`) answers: *is this program ready
  for **any** work to happen on it at all* (scope frozen, reports acceptable, etc.).
- **Discovery** answers: *can a researcher who has not been individually granted access
  find out this program exists.*
- **Access** (`program_researchers`) answers: *can this specific, identified researcher
  read/act on this specific program right now.*

Collapsing these would break real, already-shipped behavior: 0007 explicitly built
invitations to work against a `draft` program on purpose (so an organization can line up
its first researcher before formally going live), and every competitor researched treats
"discoverable" as a status a program earns/chooses, wholly independent of whether it is
actively receiving reports. A single combined status could not represent "active, fully
running, and still deliberately invite-only forever" -- which, per the research above, is
not an edge case; it is the default, majority state industry-wide.

## 5. Access models evaluated

| Model | Researcher experience | Org experience | Security/privacy | Abuse risk | Complexity | Unpatched fit today |
|---|---|---|---|---|---|---|
| A. Invite-only (current) | Passive; waits for an email | Full control, one at a time | Strongest -- existence itself is hidden from non-members | None | Already built | **Yes** -- matches the industry default and Unpatched's current trust/reputation maturity (none yet) |
| B. Public discovery | Browse/apply like a job board | Exposed to unsolicited traffic immediately | Program existence, scope, and org identity all become public by default | High -- no vetting means noise/low-quality submissions, and public scope disclosure itself can be a target map | High (search, filtering, abuse controls, a real public route) | **No** -- Unpatched has no researcher reputation/vetting signal at all yet; this is the mistake 0026 already named as a premature-marketplace risk |
| C. Application-based | Researcher requests access to a listed program | Org reviews/approves requests | Program must still be listed somewhere -- partial exposure | Medium -- spam applications | Medium (needs a request/review queue, still needs *some* discovery surface) | Not yet -- depends on solving discovery first |
| D. Public + application | Same as C but fully public listing | Same as B's exposure | Same as B | High | Highest | **No** |
| E. Public + invitation | Some programs public, most invite-only (HackerOne/Bugcrowd's actual shape) | Org chooses per-program | Matches researched reality exactly | Only as risky as the org's own choice | Medium-high (needs the toggle, a public route, and everything B implies for the public subset) | **Eventually, not now** -- correct long-run target, premature today |
| F. Eligibility-gated discovery (no public route) | Reputation-qualifying researchers see an "opportunities" style list; everyone else sees nothing | Org can widen exposure without going fully public | No public route to secure; only pre-vetted accounts ever see anything | Low | Medium (needs a real reputation signal to gate on -- Unpatched's reputation ledger exists per prior audits but has never been used as a gate) | **The real future direction**, once reputation is trustworthy enough to gate on |

## 6. The critical product question

*When an organization creates an ACTIVE program, should a researcher be able to discover
it?*

**No, not automatically, and not based on "active" alone.** The research is unambiguous:
every platform studied keeps the large majority of active, fully-operating programs
permanently undiscoverable to anyone not individually granted access. "Active" answers
"is work happening," not "who may know about it." Unpatched does not need a marketplace to
become a real platform -- it needs organizations to be able to run real, accountable
engagements with researchers they've chosen, which is exactly what today's invite-only
model already does correctly. Unpatched becomes a real marketplace later, the same way
every researched competitor did: by first having a trustworthy reputation signal worth
gating a discovery layer on (Model F), not by exposing everything active by default
(which none of them do either).

## 7. Recommended minimum model

**Do not add a schema column for this now.** The research does not support it: Unpatched's
current single-axis (access-only, invitation-gated) model is not a gap relative to the
industry -- it *is* the industry's own default, majority state. Adding a
`program_access_mode`/`discovery` column today would model a capability (public or
eligibility-gated discovery) that has no safe implementation yet, because it depends on a
reputation-gating mechanism Unpatched has not built or proven (Model F's prerequisite).
Building the column without the gate it needs to be safe would be exactly the
"invent a marketplace before its prerequisites exist" mistake 0026 already flagged.

The eventual correct shape, for planning only -- **not to be built now**:
`program_researcher_reputation` (or reuse the existing reputation ledger) as the gate,
plus a `programs.discovery_mode` enum (`private` default, `eligible` later, `public`
much later) fully independent of `programs.status`. This is written down here so a future
slice doesn't have to re-derive it, not as an instruction to build it.

## 8. Security / RLS by audience (current model, unchanged)

| Audience | Programs they can `select` |
|---|---|
| Anonymous | None -- no anonymous SELECT grant exists on `public.programs` at all |
| Researcher (no relationship) | None |
| Researcher (active `program_researchers` row) | Exactly that one program |
| Organization member without a role in `['owner','security_admin']` and without a `program_members` row | None (confirmed: the policy checks only those two predicates -- an ordinary `program_manager`-role org member gets no automatic program access, exactly as `0004`'s header states) |
| Organization owner/security_admin | Every program in their own organization |
| Program manager (`program_members` row) | That one program |
| Platform admin | Only via the existing, separate, explicitly-scoped `platform_admins` SECURITY DEFINER RPCs audited in 0027 -- never a direct table grant |
| Stranger organization (any role, different org) | None |

No existing query, count, or error path leaks a private program's existence, name, scope,
membership, or reports to anyone outside this table -- confirmed directly from the single
SELECT policy's predicate (there is no other path to read `public.programs`).

## 9. Researcher UX -- information architecture, not implemented

The task asks for the *correct* shape, not code. `/programs` today already correctly
separates two of the eventual three states (pending invitations, active participations);
the third ("discover") has no content to show yet and should not be built as an empty
promise. Recommended eventual IA, once Model F's gate exists:
**MY PROGRAMS** (active participation) → **INVITATIONS** (named, pending) →
**OPPORTUNITIES** (eligibility-gated, only once reputation-gating is real) -- never a
"browse all active programs" tab, per §6.

## 10. Organization UX -- information architecture, not implemented

Post-creation, today's real gap is not missing schema -- it's that a newly-created draft
program gives no in-product signal that *"nothing happens until you invite someone."*
That is a UX clarity problem solvable without touching the access model at all (see §16).

## 11. Privacy / security implications

Fully covered by §8: the current model already satisfies the task's own explicit
constraint ("private programs must not leak existence, org identity, scope, membership,
or reports") because there is no code path that exposes any of those to a non-member.
This constraint would become the hard part of building Models B/D/E later, not a concern
with the current model.

## 12. Migration strategy

None proposed. If Model F is ever greenlit, the migration shape would be additive only
(`programs.discovery_mode` with a `not null default 'private'`, a new SELECT policy
branch that only ever *adds* visibility, never removes the existing invitation-based
grant) -- explicitly deferred, not designed in detail here.

## 13. What NOT to build (restated from the stop condition, satisfied)

No `program_visibility`/`discovery_mode` column. No public marketplace route. No
application/request-access flow. No researcher directory. No change to any RLS policy.
No change to `create_program`, `invite_researcher_to_program`, or any lifecycle RPC.
Nothing in this pass wrote code.

## 14. Exact next implementation slice (recommended, not started)

Not a new access model. The actual, reproducible confusion here was an **organization
user not realizing invitation is a required, separate step after creation** -- a UX gap,
not a missing capability. The smallest correct fix: on a program's own management page,
when it has zero rows in `program_invitations`/`program_researchers`, show an explicit,
honest next-step prompt (e.g., "No researchers yet -- invite one to get started →")
instead of a silent/ambiguous empty state. This requires no schema change, no RLS change,
and no new RPC -- only a read of data the page already has access to, surfaced more
clearly. Recommend this as the next slice if the product goal is "prevent this exact
confusion from recurring."
