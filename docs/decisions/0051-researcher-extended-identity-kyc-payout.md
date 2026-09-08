# 0051 — Extended researcher identity: professional details, interests, KYC, payout details

Related: [[0049-researcher-identity-audit]], [[0050-signup-identity-and-business-email]].

## The request, and where it conflicted with prior decisions

The user attached screenshots from an unrelated competitor ("Com Olho") showing a full
onboarding wizard: personal info, KYC (Aadhaar/PAN/passport/phone verification via
DigiLocker), hacking tools/interests/security focus, certifications & shipping, bank
details, email preferences. Asked to implement "everything," "don't be generic."

This directly reopened ground 0049 had explicitly closed (skills/interests/certifications/
demographics rejected as "social profile filler") and introduced two categories this
project had not touched before: real government-ID data and real payout/bank data. Rather
than build it wholesale, three scoping questions were put to the user before writing any
code, because:

- A "Verify via DigiLocker" / "Verify PAN" button with no real government-ID-verification
  provider behind it would be fabricated security theater -- exactly what 0016/0042/0043
  already rejected once, just in a new shape.
- Storing raw bank account numbers with nothing reading them yet is new compliance surface
  that deserved a deliberate yes, not an inferred one.
- Interests/tools/demographics were rejected once already; reopening that needed a real
  reason, not just "the reference screenshot has it."

The user's answers: **real KYC fields, no fake verification, admin-reviewed**; **real,
encrypted payout fields, disclosed as not yet wired to an actual payout mechanism**; and
**interests/tools/security-focus, justified specifically because they now power a real
recommendation feature** (a literal focus-area match against what a program declares,
never a fabricated model) -- not a reinstated vanity/credibility flex. Certifications,
"shipping details" (this is a bug bounty platform, not a merch store), and email
preferences were not requested in the follow-up and were not built.

## What was built

**Migration `202609010004_researcher_extended_identity_kyc_payout.sql`**:

- 9 new enums (gender, age group, experience level, employment status, focus area, tool
  category, security focus, KYC status, payout method).
- `researcher_profiles` (public-read, same tier as biography) gains qualification,
  experience_level, employment_status, linkedin_url, resume_url, hacking_interests,
  hacking_tools, security_focus -- via `update_my_professional_details`.
- New `researcher_personal_details` (gender/age group) -- self-only, zero policies, zero
  grants to authenticated/anon, every access through `get_my_personal_details`/
  `upsert_my_personal_details`. Deliberately NOT on the public-read table: no organization
  has a legitimate reason to see a researcher's gender or age.
- New `researcher_kyc` (phone/Aadhaar/PAN/passport) -- values encrypted at rest via
  pgcrypto (`pgp_sym_encrypt`/`pgp_sym_decrypt`, schema-qualified as `extensions.*` --
  `pgcrypto` installs into Supabase's `extensions` schema, confirmed live, not assumed).
  `get_my_kyc_status()` returns booleans/statuses only, never the value. `upsert_my_kyc`
  is write-only from the client's perspective. `admin_decrypt_kyc_field` and
  `review_kyc_field` are platform-admin-only (`private.is_platform_admin()`, 0027) and both
  write a permanent `audit_logs` row -- decrypting a government ID number, and the
  verify/reject decision itself, are each real, logged actions.
- New `researcher_payout_details` (bank transfer / PayPal) -- same privacy tier as KYC,
  account number encrypted, only the last 4 digits kept in plaintext for display.
- `programs.focus_areas` (same enum as `hacking_interests`) + `set_program_focus_areas`
  (manager-only) + `list_recommended_programs()`: a literal `&&` array-overlap query
  against the researcher's own declared interests, excluding programs they're already in,
  never a fabricated ranking or "AI model."

**Real bug found and fixed via live testing, not caught by typecheck/lint/unit tests**:
the encryption helpers initially called `pgp_sym_encrypt`/`pgp_sym_decrypt` unqualified;
every function in this file runs `set search_path = ''` (this schema's own convention), so
the bare call silently failed to resolve -- a live PAN submission returned "The request
could not be completed" instead of succeeding. Fixed by schema-qualifying both calls as
`extensions.pgp_sym_encrypt`/`extensions.pgp_sym_decrypt`, confirmed against a live query
of `pg_extension`/`pg_namespace` (not assumed), then re-verified with a real PAN submission
succeeding end to end.

**TypeScript/UI**: `types/researcher-identity.ts`, `lib/researcher-identity-labels.ts`,
`components/ui/form.tsx`'s new `CheckboxGroup`, `components/ui/badge.tsx`'s new
`KycStatusBadge`. Five new settings sections wired into `/settings`
(`ProfessionalDetailsSettings`, `PersonalDetailsSettings`, `KycSettings`,
`PayoutDetailsSettings`, alongside the existing `ProfileSettings`). `/programs` gains a
"Recommended for you" section (only rendered when a real match exists). Program managers
get a `ProgramFocusAreasPanel` on their program's overview page. `/platform/kyc` is the
real review queue (same `notFound()`-for-non-admin convention as `/platform/needs-recovery`,
0027).

## Tests, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1054/1054, 66 files) all pass, including
two new test files (`researcher-identity-ui.test.tsx`, `researcher-identity-actions.test.ts`)
that specifically assert: no "Verify via DigiLocker"/"Verify PAN" text ever renders, the
full bank account number is never re-displayed after submission (only the last 4 digits),
and interests are framed as recommendation input rather than a score/leaderboard.

Live, against a real reset local database (real accounts, real Postgres, real encryption):
a fresh researcher account submitted professional details, personal details, a PAN number,
and bank payout details -- each persisted and reloaded correctly, the PAN showing "Pending
review" and the account number showing only "···· 6789" after reload. A second account,
granted `platform_admins` membership, saw Riley's submission on `/platform/kyc`, verified
it, and a real `audit_logs` row (`kyc.field_reviewed`) was confirmed via direct query.
Riley's own Settings then showed "Verified." A program tagged with `focus_areas` matching
a researcher's declared interests appeared under "Recommended for you" on `/programs`, with
the matching interest named in the row -- confirmed via a direct database check plus a live
screenshot, not assumed from the code alone.

## What was deliberately not built

- **Real government-ID verification** (an actual DigiLocker/PAN-verification API
  integration) -- would need a real provider contract and credentials; out of scope for
  this session, and building the UI without it would have been the fabricated feature this
  slice specifically avoided.
- **A real payout mechanism reading `researcher_payout_details`** -- `services/
  payments.ts`'s `activePaymentProvider` is unchanged; this table exists for future use,
  disclosed, not silently treated as already wired up.
- Certifications, "shipping details," email notification preferences, avatar upload
  (already disclosed-deferred in 0049) -- not requested in the final scoping answers, not
  built.
- Overlap-ranked recommendation ordering (e.g. "3 of 3 interests matched" sorted above "1
  of 3") -- `list_recommended_programs` orders by `updated_at` only, the same honest,
  unranked ordering `list_public_programs` already uses; adding a real overlap-count sort
  is a small, separable follow-up if it turns out to matter at real volume.

Per standing instruction, `npm run build` was not run for this iteration.
