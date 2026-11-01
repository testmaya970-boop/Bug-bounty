# 0041 — Public program discovery: one program, one researcher journey (implemented)

Related: [[0037-program-discovery-access-model]], [[0038-researcher-discovery-product-model]],
[[0039-trust-based-researcher-discovery-strategy]], [[0040-public-program-discovery-foundation]].

Builds directly on 0040's research; this slice implements exactly the scope 0040's
"implementation slice #1" recommended, plus the anonymous-facing listing/detail routes
and the real submission path 0040 deliberately deferred to its own, later, more carefully
reviewed slice -- reviewed here, in this one.

## A. Exact files changed

**New migration**: `supabase/migrations/202608310002_public_program_discovery_foundation.sql`
-- `program_visibility` enum, `programs.visibility`/`programs.description` columns, a
partial index, a new `program_access_source` value (`'public'`), and six new RPCs:
`list_public_programs`, `get_public_program`, `list_public_program_scope` (anon+
authenticated), `set_program_visibility`, `update_program_description`,
`join_public_program` (authenticated only).

**Types**: `types/program.ts` (`ProgramVisibility`, `PublicProgramSummary`,
`PublicProgramScopeEntry`), `types/researcher.ts` (`ProgramAccessSource` widened).

**Services**: `services/programs.ts` (`setProgramVisibility`, `updateProgramDescription`,
`listPublicPrograms`, `getPublicProgram`, `listPublicProgramScope`, `joinPublicProgram`).

**Actions**: `actions/programs.ts` (`setProgramVisibilityAction`,
`updateProgramDescriptionAction`, `joinPublicProgramAction`).

**New components**: `components/programs/public-program-list.tsx`,
`components/programs/join-public-program-button.tsx`,
`components/programs/program-visibility-panel.tsx`.

**Modified pages**: `app/programs/page.tsx` (anonymous branch: real public listing,
replacing the old unconditional sign-in redirect), `app/organizations/[organizationId]/
programs/[programId]/page.tsx` (anonymous branch showing the public program detail view;
a new authenticated branch for a signed-in visitor with no relationship yet to a public
program; the `ProgramVisibilityPanel` wired in for managers).

**Marketing copy**: `components/marketing/program-discovery-preview.tsx` and
`app/page.tsx`'s header nav updated from "coming" language / an in-page anchor to the
real `/programs` route, now that it exists.

**Tests**: `tests/unit/public-program-discovery-ui.test.tsx` (new),
`tests/unit/marketing-ui.test.tsx` (updated for the new copy).

**Nothing else changed** -- `submit_report`, existing RLS policies, the lifecycle state
machine, and every pre-existing authenticated page/component are byte-for-byte unchanged.

## B. Visibility model

`programs.visibility`: two values, `'private'` (default) / `'public'`. No third
`invite_only` value -- already fully expressed as `private` + the existing, unchanged
invitation mechanism.

## C. Lifecycle interaction (exact rule implemented)

`active + public` -> discoverable, full detail, scope, and open submission.
`active + private` -> invisible (unchanged behavior). `draft`/`review` -> never
discoverable regardless of visibility (both new anon RPCs filter `status in ('active',
'paused')`, so a value stored during draft has no effect until the program actually goes
live). `paused + public` -> **remains listed and its detail page remains accessible**,
scope shown for reference, but the "How to participate" section explicitly states
"Reports cannot be submitted while this program is not active" and no join action is
offered. `closed` -> excluded from both new RPCs entirely for this slice (the task's own
explicit instruction: "do not expose as an active opportunity in the initial MVP") --
richer "stays visible as an archived record" behavior remains a real, deliberately
deferred future extension (per 0040), not built here.

## D. RLS / security model

No new RLS policy on `programs`/`program_scope_entries` -- the existing policies are
completely unchanged. Anonymous and not-yet-related-authenticated reads go exclusively
through three new SECURITY DEFINER RPCs, each with an explicit column projection (never
`select *`) and each independently re-verifying `visibility = 'public' and status in
('active','paused')` -- `list_public_program_scope` does this itself rather than trusting
a caller who already checked `get_public_program`, since it is directly reachable on its
own. A private, draft, or genuinely nonexistent program id all produce the identical
empty/not-found result; nothing distinguishes them. `join_public_program` never silently
reactivates an existing suspended/revoked `program_researchers` row -- a manager's
removal decision cannot be undone by the same researcher re-clicking a public join
button.

**One real bug found and fixed during verification, not before**: `list_public_program_
scope`'s own `RETURNS TABLE` declared an output column named `id`, which collided with
`programs.id` inside its own authorization check (`where id = target_program_id` was
ambiguous) -- the exact "0003-class collision bug" an earlier migration's own comment
already named and warned against, which I repeated here and only caught live. Fixed by
table-aliasing the check (`where p.id = target_program_id`), applied directly to the
running local database and corrected in the migration file itself before this report.

## E. Anonymous journey (verified live)

`/programs` shows the real listing (name, organization, status, description, "View
program →"), correctly showing only the active+public program in this slice's test
fixture and correctly excluding a draft program and an active+private program. Opening
a public program's detail page (the same, existing
`/organizations/{orgId}/programs/{programId}` URL -- no new URL scheme) shows identity,
organization, status, description, in-scope and out-of-scope targets, and a "Sign in to
participate" CTA -- with no reports, researcher roster, or manager-only section rendered
anywhere. Visiting a draft or an active-but-private program's URL directly redirects to
sign-in exactly as it did before this slice -- existence is never confirmed either way.

## F. Researcher journey (verified live, real accounts, real data)

A freshly signed-up researcher visiting the public program sees "Start researching,"
distinct from an already-participating researcher's "Report a vulnerability" and from a
suspended/revoked researcher's existing status message (both of those paths are
completely untouched). Clicking it calls `join_public_program`, then navigates to the
existing, unmodified `/reports/new` page, which independently re-verifies participation
via `getMyParticipation` exactly as it already did for invitation-based researchers.
Submitting a real report (title, description, a target matched against the real
in-scope entry) succeeded end-to-end against the actual `submit_report` RPC, scope
matching included, landing on the real report detail page. Re-visiting the program page
afterward correctly shows the normal active-researcher view.

## G. Organization publishing journey (verified live)

The program's existing detail page gained one new panel, visible only to
owners/admins/program managers: a real switch (Public/Private) and a description
textarea, each wired to its own RPC via `router.refresh()`, no new page. Toggling the
switch live, in a real browser, actually removed/restored the program from the anonymous
listing within one request -- not just a UI state change.

## H. Public program information architecture

An editorial registry (bordered list, divided rows, real `ProgramStatusBadge`), never a
card grid -- per the task's explicit instruction and matching this product's existing
visual grammar everywhere else. The detail page orders identity → status → description →
in-scope → out-of-scope → participation, reading as an engagement brief, not a generic
SaaS detail page. No fabricated researcher count, bounty range, or activity metric
anywhere.

## I. Report submission integration

`submit_report` was not modified at all. `join_public_program` only ever creates the
`program_researchers` row that authorization already required to exist -- every
downstream check (`is_researcher_authorized_for_program`, the reputation ledger,
`list_my_program_participations`) needed zero special-casing because the row it creates
is completely ordinary, distinguished only by `source = 'public'`.

## J. Evidence integration

Untouched. The report detail page's existing evidence composer (staged text/file
evidence via the existing `addResearcherEvidenceAction`/`uploadResearcherFileEvidenceAction`,
per 0028) rendered correctly on the newly-created report in live verification -- no code
path in this slice touches evidence at all.

## K. Security verification (live, not just RLS inspection)

Confirmed directly, with real accounts: anonymous cannot read a draft program, an
active+private program, or any report/researcher/manager data for the public program.
An authenticated researcher with zero relationship to an active+private program still
gets the generic "does not exist or you do not have access" message -- never a
distinguishing one. Toggling a program to private live removed it from the anonymous
listing within the same request. No count, error message, or URL anywhere in this slice
distinguishes "exists but hidden" from "does not exist."

## L. Browser verification

Real Chromium, full real accounts (org owner + a freshly-registered researcher), no
mocking. Verified at 1440/1024/768/390/320: zero horizontal overflow on both the listing
and detail pages at every width; keyboard (`Tab`) reaches the "Sign in to participate"
CTA. Screenshots reviewed directly.

## M. Tests

`npm run typecheck`, `npm run lint`, `npm test` (1007/1007), `npm run build` all pass.
35 live Playwright checks across two verification passes (24 for the core journey/
security matrix, 11 for responsive/keyboard) -- all 35 passed after fixing the one real
bug found in D.

## N. Remaining gaps (honestly disclosed)

No frontend exists anywhere in this product for the program lifecycle transitions
themselves (`submit_program_for_review`/`activate_program`/etc.) -- a pre-existing gap
from an earlier slice (0021), discovered during this task's own test setup (which had to
call those RPCs directly, since no UI button exists to click). Not this task's job to
fix, but real and worth naming rather than quietly working around without disclosure.
`closed`-program archival behavior (0040's richer recommendation) remains deferred.
Paused-program detail styling reuses the same `Alert` component as before but has not
been separately design-reviewed beyond functional correctness.

## O. Exact next slice

Build a real lifecycle-transition UI (submit for review / activate / pause / resume /
close buttons on the program management page) -- the gap named in N blocks an
organization from ever reaching `active` status through the product itself today,
which is a larger and more foundational problem than anything this slice's own scope
covers.
