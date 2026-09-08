# 0042 — Researcher product completion (one-shot journey build)

Related: [[0009-report-triage-state-machine]], [[0010-report-evidence-and-communication]],
[[0016-reputation-ledger-foundation]], [[0017-notification-routing-and-delivery-foundation]],
[[0028-report-evidence-attachment-at-submission]], [[0041-public-program-discovery-vertical-slice]].

A HackerOne 14-screenshot walkthrough was supplied as a **product-completeness
benchmark**, explicitly not a visual-cloning reference. The task demanded the complete,
end-to-end researcher journey be genuinely usable, with no "next slice" deferral for
anything safely implementable. Before writing any code, the existing product was audited
directly (not assumed): navigation (`components/app-shell.tsx`), report detail
(`app/organizations/[organizationId]/programs/[programId]/reports/[reportId]/page.tsx`),
communication, evidence, reputation (`app/researchers/page.tsx`), and notifications
(`app/notifications/page.tsx`) were already real, RLS-backed, and well-built from earlier
tasks in this project's history. That audit reframed the actual scope of this task down
to what was genuinely missing, rather than rebuilding what already worked.

## A. HackerOne benchmark: KEEP / ADAPT / REJECT

**KEEP (already present, verified, untouched)**: report communication as a real thread
(0010), evidence attached at submission (0028), a fact-based reputation ledger with no
score (0016), a real notification center (0017), the researcher/organization auth split.

**ADAPT**: HackerOne's filterable opportunity/program grid → Sentinel's editorial registry
list (search + status filter, keyset-paginated), matching this product's existing list
grammar rather than a card wall. HackerOne's "Report Assistant" structured composer →
restructured `CreateReportForm` sections (Target / Finding / Reproduction & impact /
Evidence / Attachments / Review) over the *existing* `submit_report` contract — no new
field invented. HackerOne's empty-state screens → Sentinel's existing `EmptyState`
component, reused, not recreated.

**REJECTED outright (explicit product decisions, not oversights)**: leaderboard, hacker
rank/percentile, follower counts, badges/certifications, a skills taxonomy, fabricated
response-time/earnings/success-rate statistics, a citizenship/ID-verification flow, a
multi-step onboarding wizard collecting availability/asset-type/vulnerability-category
preferences. None of these have a backing data model in Sentinel, and inventing one to
match the benchmark would be exactly the "fabricated numbers" the task explicitly
forbade.

## B. What was actually built this task

1. **Program search and pagination** (previously: a single unfiltered, unpaginated
   `list_public_programs()`). New migration
   `supabase/migrations/202608310003_public_program_search.sql` replaces it with a
   5-parameter, keyset-paginated, server-side-filtered version
   (`p_search`, `p_status`, `p_cursor_updated_at`, `p_cursor_id`, `p_limit`), backed by a
   covering partial index on `(visibility, status, updated_at desc, id desc)`. URL is the
   only state (`?q=&status=`), so search → reload → identical results, and
   `/programs?status=paused` is bookmarkable. Reuses the project's one existing
   `encodeCursor`/`decodeCursor`/`Page<T>` convention — no new pagination scheme.
2. **A real "next action" banner on the report detail page** — previously present only as
   a quiet `MetadataPair` in the sidebar. Promoted to a prominent `Alert` for the
   submitting researcher only (`isOwnReport && !canTriage`): "Action required" (warning)
   when `needs_information`, "Resolved — no further action needed" (success) when
   terminal, "Waiting on the organization" (info) otherwise — derived from the existing
   `researcherNextActionLabel`/`REPORT_STATUS_TRANSITIONS`, never a second status
   computation, and never showing the organization-facing label ("Start triage") to a
   researcher.
3. **Composer restructuring** (`components/reports/create-report-form.tsx`) — explicit
   Target / Finding / Reproduction & impact / Evidence / Attachments / Review sections
   over the unchanged `submit_report` contract, plus a lightweight `beforeunload` guard
   (armed whenever target/title/description is non-empty and not currently submitting) —
   not an autosave backend, just stopping an accidental tab close from silently
   destroying a long report.
4. **A real notification for `needs_information`** (found during verification, not
   planned up front — see C). New migration
   `supabase/migrations/202608310004_report_needs_information_notification.sql`.

## C. The gap this task actually found (not assumed)

Live Chromium verification (Journey B: an organization requests more information,
expecting the researcher to see a real notification-center entry) failed on the first
honest run. Investigation traced it to a genuine, pre-existing gap: `request_information`
(0009) transitions a report to `needs_information` but never wrote an outbox event, and
`route_and_create_notifications` (0017)'s `notification_type` check constraint had no
`report_needs_information` value at all — of the eight possible things that can happen to
a report, seven produce a real notification and this, arguably the single most
action-critical one for a researcher, produced none. The report detail page's own banner
(B.2 above) only helps a researcher who is already looking at that report; nothing told
them to go look. Per the task's explicit "no obvious broken connective tissue" instruction,
this was fixed rather than only disclosed:

- `notifications_notification_type_check` and `notifications_category_matches_type_check`
  widened to include `report_needs_information` (stays in the `report_activity` category
  — the same preference/delivery machinery every other report notification already uses).
- `route_and_create_notifications` redefined to accept the new type and re-verify
  provenance against `report.status = 'needs_information'`, the identical pattern every
  other type already uses.
- `request_information` redefined to add the `report.needs_information` v1 outbox event —
  **redefined from its actual current body** (the 0010-era version that posts the reason
  via `private.insert_report_message`, not the older, since-superseded version that wrote
  a since-dropped `information_request_reason` column — this was caught live, as a runtime
  "column does not exist" error, not by inspection, and fixed by reading the *current*
  migration history rather than assuming the first definition found was still current).
- `workers/outbox/handlers/index.ts` registers the new handler on the existing
  `createNotificationHandler` factory — no new handler code, one more `registerHandler`
  call, exactly the project's own documented extension point.
- `types/notifications.ts`, `lib/email-render.ts`, and
  `components/notifications/notification-list.tsx`'s label maps extended (TypeScript's
  `Record<NotificationType, string>` exhaustiveness caught every call site that needed
  updating).

No new table, no second notification system, no new delivery channel.

## D. Security boundaries (unchanged, re-verified live)

Every existing boundary from 0009/0010/0016/0017/0041 is untouched: RLS on `reports`/
`notifications` still gates strictly on `researcher_id = auth.uid()` or org
oversight/program membership; anonymous discovery still goes exclusively through
SECURITY DEFINER RPCs with explicit projections; `join_public_program` still only creates
an ordinary, unprivileged `program_researchers` row. Nothing in this task widened any
grant, added a permissive RLS policy, or introduced a client-trusted id parameter.

## E. What was deliberately not built

A researcher profile bio/avatar editor was considered and not built this task — the
dormant `bio`/`avatar` fields remain unused, and no skills/certification/location field
was added (the task's own explicit prohibition). Program lifecycle transition buttons
remain the known gap from 0041 (org owners still call the RPCs directly in this dev
environment) — unrelated to the researcher journey and not re-scoped here. Full visual
density-hierarchy documentation across every page type was not produced as a separate
artifact; the new surfaces were verified functionally and at five breakpoints, but a
dedicated design audit doc was judged lower-value than the security/functional
verification this task prioritized.

## F. Tests

`npm run typecheck`, `npm run lint`, `npm test` (1007/1007, 62 files), `npm run build` all
pass, run after a full local `supabase db reset` replayed every migration from scratch
(required once, to pick up the corrected `request_information` body — see C). 30 live
Chromium checks across Journeys A–F (fresh signup → search/filter → join → composer →
evidence → submit; organization request-info → researcher notification → reply persists
after reload; resolution → correct terminal banner; program lifecycle × visibility matrix
via direct RPC; cross-researcher/cross-org/anonymous security isolation; out-of-scope and
unauthorized-program failure states) all passed, using `waitForURL` before
`waitForLoadState`, role-scoped locators (`getByRole("textbox", {name, exact: true})`)
to avoid the ambiguous-selector class of false positive the task specifically warned
against, and reload-based persistence checks rather than in-memory-only assertions.
