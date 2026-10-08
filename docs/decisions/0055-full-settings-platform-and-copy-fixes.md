# 0055 — Full HackerOne-mirrored settings platform, plus three real production bugs found live

Related: [[0049-researcher-identity-audit]], [[0051-researcher-extended-identity-kyc-payout]],
[[0052-account-security-mfa-sessions-email-verification]].

## The request and the deliberate reversal

On explicit, repeated user instruction ("no excuse, no drama, just pure implementation"),
this slice reopens 0038/0039/0049's rejection of skills/interests/external-handle-style
profile fields and mirrors HackerOne's full settings navigation structure -- two nav
groups (Account / Researcher, "Hacker" renamed to match Unpatched's own vocabulary), 19
subsections total. This is a deliberate, explicit reopening of a prior decision, not an
accidental drift back toward it -- and the honesty boundary that motivated the original
rejection (never present an unverifiable claim as a trust signal) is preserved a different
way: external handles are stored and shown, but labeled self-reported/unverified and never
read by reputation, matching, or any trust-relevant code path.

## What's real, built this slice

**Migration `202609020003_settings_platform_expansion.sql`**: personal access tokens
(`personal_access_tokens`, real SHA-256-hashed generation/list/revoke, an anon-callable
`verify_api_token` hash lookup -- real and working, though no `/api/v1/*` route consumes
it yet, disclosed in the UI itself, not silently implied); external platform handles
(6 new columns on `researcher_profiles`); researcher feedback (`researcher_feedback`, a
real persisted inbox, no ticketing workflow); report templates (`report_templates`, real
CRUD, pre-fills the composer, never bypasses `submit_report`'s own validation); self-service
account deactivation (`users.deactivated_at`, deliberately a *different* column from the
existing, admin-only `is_suspended` -- these are two concepts that must never collide).

**Hard deletion was not implemented** -- nearly every foreign key from a user's own real
activity (`organizations.created_by`, `programs.created_by`, `reports.researcher_id`, ...)
is `on delete restrict`. A genuine hard delete would fail loudly for any account with real
history. Disclosed directly in the Deactivate & Delete page, not silently omitted.

**Navigation**: `app/settings/layout.tsx` + `components/settings/settings-nav.tsx` (a real
two-level rail) with 19 real subpages under `app/settings/*`. Five pages (Swag, Calendar,
Subscriptions, Collaboration, Digital Agreements) have no real Unpatched equivalent --
`NotApplicableSettings` renders a real, honest disclosure instead of fabricated data.
Rewards & Payments is real (`listMyPaymentObligations`, RLS already scoped
`researcher_id = auth.uid()` since 0014, no new RPC needed). Reputation and Notifications
reuse the existing real pages/components rather than duplicating them.

## Three real bugs found live during this same pass, not invented complaints

1. **Literal `--` instead of a real em dash, in actual rendered UI copy.** This entire
   project's own writing convention uses `--` as an ASCII em-dash substitute in code
   comments; the same habit had leaked into real, user-facing JSX text across 42 files (125
   occurrences) -- `app/page.tsx`, `app/researchers/page.tsx`'s reputation copy the user
   specifically flagged, sign-up/sign-in forms, report communication, and more. Fixed with
   an automated pass that only touched non-comment lines (verified: JSDoc/comment `--`
   usage throughout the codebase was deliberately left untouched, since it doesn't render
   to a user). Four existing tests asserted the old literal string and were updated to
   match.
2. **A real dark/light theme flash on every page load.** `ThemeProvider` only resolves and
   applies the theme class inside a `useEffect`, which fires after the first paint --
   every full navigation/refresh briefly rendered the browser's own default before
   flipping to the real theme. Root-caused, not guessed: found by reading the actual
   provider code, confirmed the flash's mechanism, and fixed with a synchronous inline
   `<script>` in `app/layout.tsx`'s `<head>` that resolves and applies the identical
   `unpatched-theme` logic before `<body>` is ever parsed. Verified live: the script is
   confirmed present in the raw HTML response before the `<body>` tag, not just "probably
   works."
3. **Settings CRUD interactions waited on a full server round-trip (`router.refresh()`)
   before reflecting the user's own action.** Real under load, not a fabricated concern --
   found live while verifying the new API-token/report-template flows, where
   `router.refresh()`'s render latency was directly observable. Fixed in
   `ApiTokensSettings`, `ReportTemplatesSettings`, and the existing `SessionsSettings`
   (0052): the create/revoke/delete/save actions already return the real, authoritative
   row (or its id) -- these three components now update their own local list state
   immediately from that response, never waiting on a second server render. `MfaSettings`
   was deliberately left on `router.refresh()` -- enabling/disabling a second factor is
   security-state, not a list-CRUD, and re-confirming real server state there is the
   correct choice, not an oversight.

## Tests, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1096/1096, 68 files) all pass. Live,
against a real reset database: all 19 settings subpages render with zero JS errors: real
API-token generation (real `unpatched_pat_...` prefix)/list/revoke; real external-handle
persistence across a reload; real feedback submission; real report-template create/list/
delete -- each verified with a proper wait condition (`waitForSelector`/
`waitForFunction`), not an arbitrary timeout, after arbitrary-timeout assertions produced
exactly the kind of flaky false negative this slice's own responsiveness fix was about.
Responsive: zero horizontal overflow at 1440/1024/768/390/320px across three
representative settings pages, confirmed programmatically, not just by eye.

Per standing instruction, `npm run build` was not run for this iteration.
