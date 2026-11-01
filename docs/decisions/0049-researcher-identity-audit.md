# 0049 — Researcher identity audit, vs. HackerOne, and the self-service slice implemented

Related: [[0016-reputation-ledger-foundation]], [[0038-researcher-discovery-product-model]],
[[0039-trust-based-researcher-discovery-strategy]], [[0042-researcher-product-completion]],
[[0047-report-composer-weakness-impact-severity]].

This started as an audit-only request and ended with one real, evidence-justified
implementation slice (self-service display name + biography editing) once the audit
concluded it was the one genuinely safe, high-value, low-risk gap. Everything else the
HackerOne screenshot showed was evaluated and, in every other case, rejected or
explicitly deferred with a stated reason -- not silently skipped.

## A. Current Unpatched researcher model (verified against the live schema, not inferred)

- `public.users`: `id`, `username` (auto-derived at signup, e.g. `shiva_a3f9e2` --
  never chosen, never editable by anyone before this slice), `display_name` (also
  auto-derived from the email prefix, editable by no one before this slice),
  `platform_role`, `email`.
- `public.researcher_profiles`: `user_id`, `biography`, `avatar_path`,
  ~~`reputation_score`~~ (dropped this slice -- see D). **This table existed since the
  very first migration and was, until this slice, completely dead**: zero services,
  actions, or components anywhere in the codebase ever read or wrote it; the signup
  trigger (`handle_new_auth_user`) only ever inserts into `public.users`; no INSERT RLS
  policy existed even if a client had tried to create its own row.
- `public.reputation_ledger` (0016): the real "verified research history" --
  fact-based, per-outcome, no score. This is Unpatched's actual answer to HackerOne's
  reputation/impact tables, and it was already correct; this audit did not touch it.
- No public per-researcher profile route exists (`/researchers` is strictly self-only --
  confirmed by reading the route directly, not inferred). No organization can view any
  researcher's identity beyond `report.researcherName` (a bare display name) on a report
  they submitted to that organization's own program.
- Researcher invitation (`invite_researcher_to_program`) is pure cold-email: "The
  researcher does not need an existing Unpatched account." Zero identity/history is
  visible to an organization before inviting someone. This matches 0038/0039's own
  earlier, deliberate conclusion (a narrow, org-scoped signal only -- not a directory)
  and this audit did not find new evidence to reopen that call.

## B. HackerOne model extracted from the screenshot

Avatar upload, Name, Username (permanent-until-cooldown, public URL slug), Website,
Location, Country, Language + Proficiency (repeatable), About me / Intro (markdown),
"Open for employment" toggle, five external platform handles (Bugcrowd/Cobalt/GitHub/
GitLab/LinkedIn/X/HackTheBox), explicit "this appears on your public profile, next to
your comments, and in reports you submit" framing.

## C. KEEP / ADAPT / REJECT

| Capability | Verdict | Why |
| --- | --- | --- |
| Display name | **ADAPT** | Real, already existed as a column, was uneditable -- implemented this slice. |
| Avatar | **ADAPT (deferred)** | `avatar_path` column is real and ready; actual image upload/storage is a separable slice (needs a bucket, size/type validation, UI) -- not built here, disclosed, not half-built. |
| Biography / About me | **ADAPT** | Real, already existed, was unreachable -- implemented this slice, shown to organizations on the report they're triaging. |
| Username (editable, public) | **REJECT (for now)** | Real gap (auto-generated, ugly, never chosen), but editable-username-as-public-identifier is its own product decision (collision handling, public-profile-URL implications) entangled with the REJECTed public-directory question below -- not a small addition. |
| Public profile page / directory | **REJECT** | 0038/0039 already researched and explicitly rejected a directory/marketplace; this audit found no new evidence to reopen that call. A stranger being able to browse every researcher is a different privacy posture than Unpatched has chosen. |
| Location / Country | **REJECT** | Explicitly forbidden by 0042's own researcher-profile constraint; no security-research purpose it serves that scope/program targeting doesn't already cover. |
| Languages + proficiency | **REJECT** | Same reasoning as location -- social-profile filler, not a security-research fact. |
| "Open for employment" | **REJECT** | A hiring-marketplace feature; Unpatched is not building one. |
| External platform handles (Bugcrowd/GitHub/etc.) | **REJECT** | Unverifiable self-reported claims with zero real data behind them -- exactly the "fake reputation adjacent" pattern 0016/0039 already rejected once. |
| Reputation/Impact/Signal tables | **KEEP (already correct)** | `reputation_ledger` is Unpatched's real, fact-based equivalent -- already built, already right, not touched. |
| Skills & Interests, certifications | **REJECT** | Explicitly forbidden by 0042. |
| Leaderboard | **REJECT** | Explicitly forbidden by 0016/0042/0043, repeatedly. |

## D. Two real risks found and fixed, not just documented

1. **A dead `reputation_score` integer column.** 0016's own migration comment already
   flagged it as "explicitly NOT the mechanism" the real ledger uses and warned it is
   read/written by zero application code -- a live landmine for a future accidental
   reintroduction of exactly the score/ranking model this product has repeatedly
   rejected. **Dropped outright** this slice, not merely left alone.
2. **`anon` and `authenticated` both held Supabase's default broad table grants**
   (INSERT/UPDATE/DELETE/TRUNCATE, not merely SELECT) on `researcher_profiles` --
   RLS happened to block most of that in practice (no INSERT/DELETE policy existed), but
   the raw grant itself violated this schema's own otherwise-universal documented policy
   that `anon` holds zero table grants anywhere. **Corrected**: raw grants revoked,
   re-granted narrowly (`select` to `authenticated` only), all real mutation now goes
   through two new SECURITY DEFINER RPCs -- the same "no direct table writes, only RPCs"
   convention every other mutable table in this schema already follows.

## E. What was implemented this slice

Migration `202609010002_researcher_profile_self_service.sql`: drops `reputation_score`;
hardens `researcher_profiles` grants; adds `upsert_my_researcher_profile(p_biography)`
(creates the row on first use -- no row was ever auto-created, so a plain UPDATE-only
policy could never have worked for a first edit) and `update_my_display_name
(p_display_name)`. `services/researcher-profiles.ts`, `actions/researcher-profiles.ts`,
`components/settings/profile-settings.tsx`. `/settings` gained a real, universal
"Profile" section (display name + biography) shown to every signed-in user regardless of
organization membership -- previously this route's only content was an organization
chooser/dead-end, so "Settings" is now genuinely relevant again and was restored to the
always-visible nav group (it had been correctly hidden for a user without an
organization in 0044, before it had any personal content of its own). The researcher's
biography, when set, now displays on the report detail page as a real credibility signal
for the organization triaging that report -- shown only when present, never a "no bio
yet" placeholder.

## F. Dependency order for a genuine researcher marketplace/discovery feature (not built here)

1. This slice (self-service identity) -- done.
2. A real, chosen, editable public username with collision handling -- not done, not
   started.
3. A real product decision, with the user's explicit sign-off, on whether Unpatched wants
   a public-profile/directory posture at all -- 0038/0039 already said no for now; that
   decision would need to be deliberately revisited, not incidentally reopened by a
   profile-editing slice.
4. Avatar upload (storage bucket, validation, UI) -- a separable, disclosed-deferred
   slice.
5. Only after 1-4: an actual researcher-discovery/matching surface for organizations.
   Building this before 2-3 are real product decisions (not just backend capacity) would
   be building a feature this project has twice already concluded is premature.

## G. Tests, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1022/1022, 64 files incl. the new
`researcher-profile-ui.test.tsx`) all pass. Live Chromium verification (real account):
Settings shows in the nav and the page for a researcher with zero organizations; display
name and biography fields render real values; a real biography edit persists after a
full page reload (confirmed via the textarea's actual `value`, not a text-content
heuristic); the same biography then appears on the report detail page under "About
you"/"About {name}" -- the org-facing credibility signal working end to end, from a real
edit through to a real read by a different code path.

Per explicit instruction, `npm run build` was intentionally NOT run for this iteration --
typecheck/lint/test plus live dev-server verification is the complete gate for normal
work; a full production build is reserved for an actual deploy.
