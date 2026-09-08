# 0064 — Researcher team collaboration and bounty splitting

## Status

Built, in `supabase/migrations/202609050003_report_collaboration.sql`. This closes the fifth
HackerOne/Bugcrowd feature-parity gap: `reports.researcher_id` stays the single not-null
submitter-of-record column, unchanged, exactly as planned below — collaboration is layered on
top as the new `report_collaborators` table this document specified. `components/programs/
collaboration-not-applicable.tsx` is deleted; its `/programs?tab=collaboration` tab is removed
(collaboration now lives on the report detail page itself, where a report actually exists to
collaborate on).

**One deliberate scope cut from the plan below**: bounty-split payout fan-out
(`create_payment_obligation` creating one `payment_obligations` row per collaborator) was NOT
built. `create_payment_obligation` keeps its exact original single-obligation-to-submitter
behavior, unconditionally — a collaborated report is paid out identically to an uncollaborated
one today. The reasoning in "Sequencing note" below held: splitting the payout requires relaxing
`payment_obligations`' one-row-per-decision uniqueness and reworking `services/payments.ts`,
`actions/payments.ts`, and `PaymentStatusSection`'s single-obligation assumption end to end — a
payments-side change in its own right, not something to smuggle into a collaboration-scoped
migration. This is the next natural follow-up once 0063's payout shape is settled.

**A second thing worth recording, found only during live verification, not anticipated by the
plan below**: the naive RLS design (each of `reports`/`report_collaborators`'s own SELECT policy
checking the other table with a plain `exists()` subquery) is a genuine infinite-recursion cycle,
caught live by exercising it as an actual collaborator session before shipping. Fixed the same way
`202608270003`'s own `private.is_manager_or_admin_of_my_program` precedent already fixed the
identical class of bug: a `private.is_report_collaborator(report_id)` SECURITY DEFINER helper that
bypasses `report_collaborators`' RLS internally, used by every policy that needs to ask "is this
actor a collaborator," never an inline subquery against the table directly.

## Original scoping rationale (superseded by "Status" above, kept for context)

Originally scoped, not implemented: `reports.researcher_id` was a single not-null column (one
submitter per report) and `program_researchers` was one row per `(program, researcher)` —
`components/programs/collaboration-not-applicable.tsx` correctly, honestly stated there was no
collaboration model anywhere in the schema. This document was a concrete plan for adding one,
deferred rather than built in that pass because it is a real schema change to `reports` (the most
heavily cross-referenced table in the domain — triage, evidence, communication, disclosure, and
payments all key off `reports.id`), and because the bounty-split math interacts directly with the
payment-obligation ledger 0063 was also touching. Sequencing both at once risked getting either
one wrong; that plan assumed 0063 (or at minimum the manual provider) would be stable first — see
the payout-split scope cut above for how that sequencing constraint was actually resolved.

## What HackerOne and Bugcrowd actually do (from the feature-parity research)

Both platforms support the same shape: a **submitting researcher adds up to ~10 collaborators**
to a single report; each collaborator gets visibility into the same report thread; on payout,
the bounty is split by a percentage (Bugcrowd) or weighted ratio (HackerOne) that must sum to
100%/total weight. Collaborators are locked in once the report exists (no post-hoc changes
without a support ticket on either platform) — this constraint matters for the schema design
below, since it means "who collaborated" is fixed at submission time, not a mutable membership
list.

## Design: additive, not a rewrite of `reports`

**Do not change `reports.researcher_id`.** It stays the single "submitter of record" — the
person who has the report in `list_my_reports()`, who can add evidence, who the triage state
machine addresses. Every existing RPC, RLS policy, and UI component that reads
`reports.researcher_id` keeps working unmodified. Collaboration is layered on top as a new,
optional table:

```sql
create table public.report_collaborators (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  researcher_id uuid not null references public.users(id) on delete restrict,
  bounty_split_percent numeric(5,2) not null check (bounty_split_percent > 0 and bounty_split_percent <= 100),
  added_at timestamptz not null default now(),
  unique (report_id, researcher_id)
);
-- Invariant enforced in the RPC below (a CHECK constraint can't sum across sibling rows):
-- sum(bounty_split_percent) across all rows for a report_id, INCLUDING the submitter's own
-- implicit share, must equal exactly 100.00. The submitter is not a row in this table --
-- their share is 100 minus the sum of collaborator rows, computed, never stored, so there is
-- no way for the submitter's own share and the collaborator rows to drift out of sync.
```

Why the submitter's share is computed, not stored: HackerOne's model uses explicit weights
including the submitter, but that opens a real class of bug (submitter row edited or deleted,
leaving the split summing to less than 100%). Deriving it as a remainder makes "always sums to
100%" a property of the query, not an invariant that has to be separately maintained.

### New RPC: `add_report_collaborator`

- Callable only by `reports.researcher_id` (the submitter), and only while the report's status
  is `new` or `triaging` (matching the "locked once past a certain point" rule both competitors
  enforce, expressed through this schema's own existing status machine rather than a new flag).
- Validates the invited researcher is themselves an authorized, active participant of the same
  program (`private.is_researcher_authorized_for_program`, already exists) — a collaborator must
  be independently eligible to work that program, never smuggled in through someone else's
  invitation.
- Re-validates the running percentage sum server-side (never trust a client-computed remainder).
- Cap of 10 collaborators total (matching both competitors' stated limits), enforced as a row
  count check in the RPC, not a CHECK constraint (CHECK constraints can't count sibling rows).

### New RPC: `remove_report_collaborator`

Same authorization (submitter only, same status gate) — removing a collaborator before the
report reaches a terminal status. Once a report is in a terminal status, collaborators become
permanently locked (mirrors both competitors); no "edit split after resolution" RPC is designed
here on purpose, since a resolved report may already have started payout obligation creation.

## Bounty-split integration with `payment_obligations`

This is the part that actually depends on 0063 landing first (or on the existing manual
provider), and is the main reason this doc doesn't try to build both at once.

Today, `create_payment_obligation(target_report_id)` creates exactly one `payment_obligations`
row for the report's finalized bounty decision, owned by `reports.researcher_id` implicitly (the
obligation table doesn't even carry `researcher_id` today per `services/payments.ts`'s row
mapper — worth confirming against the actual migration before implementing, since if it's
derived via a join rather than stored, this changes how the split fans out).

Proposed change: `create_payment_obligation` becomes split-aware —

- If `report_collaborators` has no rows for the report, behavior is byte-for-byte unchanged
  (one obligation, one researcher) — this is the overwhelmingly common case and must never
  regress.
- If it has rows, `create_payment_obligation` creates **one `payment_obligations` row per
  participant** (submitter + each collaborator), each with `amount_minor_units` computed as
  `round(total_bounty_minor_units * split_percent / 100)`, and a new nullable
  `report_id, researcher_id` pair on `payment_obligations` (today it's implicitly one-obligation-
  per-report; this requires relaxing that to one-or-many, which is the one real schema
  change to the payments side this plan introduces). Rounding remainder (integer-minor-units
  math never divides evenly by an arbitrary percentage) is assigned to the submitter's row, never
  silently dropped — the sum of all split obligations must exactly equal the original bounty
  amount, verified by an assertion in the RPC.

## UI surface

- **Submission time**: `create-report-form.tsx` gains an optional "Add collaborators" step
  (visible only once a draft report exists, since a collaborator must reference a real
  `report_id`) — out of scope to add speculatively before the report exists, matching the
  existing pattern where evidence is also "its own domain concept, added via its own RPCs, never
  folded into report creation."
- **Report detail rail**: a new `ReportCollaboratorsPanel` alongside the existing evidence/
  communication sections, showing each collaborator's name and split percentage; visible to the
  submitter (edit), collaborators (read-only), and the organization (read-only, for triage
  context).
- **`CollaborationNotApplicable`** (`components/programs/collaboration-not-applicable.tsx`) is
  deleted once this ships — its entire reason to exist is disclosing the absence this plan fills.

## What this explicitly does not do

- No researcher-to-researcher "team" or persistent group entity — collaboration is scoped to one
  report at a time, matching both competitors' actual mechanics (no persistent "team" object
  exists on either platform's public docs either).
- No collaborator invitation notification/acceptance flow is designed here — v1 assumes the
  submitter adds a collaborator who is already aware and agreed out-of-band (matching how program
  researcher invitations already work via email, which this could later reuse rather than
  inventing a second invitation mechanism — flagged as a natural v2, not required for v1 parity).
- Does not touch `report_evidence`, `report_communication`, or the disclosure workflow — a
  collaborator's read access to those is granted purely by existing RLS already keying off
  `is_program_member`/`researcher_id` patterns once `report_collaborators` rows exist; no new
  columns needed there beyond an RLS policy addition allowing `EXISTS (select 1 from
  report_collaborators where report_id = ... and researcher_id = auth.uid())` as an additional
  "or" clause on the existing report/evidence/communication SELECT policies.

## Sequencing note (original plan; resolved differently -- see "Status" above)

Originally: build this **after** 0063's payout-obligation shape is settled (whether that's the
real Stripe integration or staying on the manual provider a while longer) — the
one-obligation-per-report to one-or-many-obligations-per-report schema change is the connecting
piece between the two plans, and getting it right once is better than adjusting it twice.

What actually happened: rather than wait on 0063, collaboration shipped with the payout-split
piece explicitly cut from scope (see "Status" above) — `create_payment_obligation` is untouched.
The one-obligation-per-report → one-or-many schema change described here is still exactly right
and still not yet built; it remains the required next step whenever bounty splitting across
collaborators needs to actually reach a payout.
