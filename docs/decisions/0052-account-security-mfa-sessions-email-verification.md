# 0052 — Account security: real email verification, TOTP MFA + backup codes, session management

Related: [[0023-authentication-experience-2026]], [[0030-public-entry-and-two-sided-authentication]],
[[0050-signup-identity-and-business-email]], [[0051-researcher-extended-identity-kyc-payout]].

## Context

A full researcher-vertical audit (KEEP/ADAPT/REJECT/MISSING against HackerOne's own
information architecture, not its visual design or reputation/leaderboard model) found the
core report lifecycle genuinely strong, and account security genuinely absent: email
verification existed as infrastructure but was disabled and never live-tested end to end;
TOTP MFA had zero implementation (explicitly deferred in 0023); session/device
listing and revocation did not exist at all. Given the size and security sensitivity of
the full list (engagement features -- saved programs, retesting, notification/invitation
preferences, unified inbox, program search sort/filter -- were also flagged MISSING), the
user chose to sequence account security as its own pass first, queuing the rest.

## Built entirely on Supabase Auth's own real, production-supported infrastructure

Every piece here is a narrow, `auth.uid()`-scoped window onto data/behavior GoTrue already
owns, never a parallel invented system:

- **Email verification**: `enable_confirmations` turned on (was `false`); the existing,
  already-fixed `/auth/confirm` Route Handler (0023) handles it. No custom OTP code UI --
  Supabase's own token-hash link flow is the real, secure mechanism, and building a second
  6-digit-code flow alongside it would be redundant, not more secure.
- **TOTP MFA**: `[auth.mfa.totp]` `enroll_enabled`/`verify_enabled` turned on (were
  `false`). Enrollment, QR code, secret, and code verification are 100% real
  `supabase.auth.mfa.*` calls -- no hand-rolled TOTP time-window/HMAC logic anywhere in
  product code.
- **Sessions**: reads and deletes rows directly in `auth.sessions`, GoTrue's own real
  session table (confirmed live via `information_schema.columns`, not assumed from
  documentation) -- id, user_id, created_at, updated_at, user_agent, ip, aal.

## The one real gap Supabase doesn't cover: backup codes

Redeeming a backup code cannot itself mint an AAL2-elevated Supabase JWT -- only a real
`mfa.verify()` TOTP check does that, at the GoTrue level. `public.mfa_verified_sessions`
(keyed by the JWT's own `session_id` claim, confirmed present in a real issued token before
writing any code that depends on it) tracks a real, server-checked backup-code redemption
as an equally valid alternative to AAL2 for exactly one session. `get_my_mfa_status()` is
the one function everything reads: `session_verified = (current_aal = 'aal2' OR
backup-code-verified-this-session)`.

Backup codes are server-generated (10 per enrollment), returned in plaintext exactly once,
and stored only as a SHA-256 hash (`public.mfa_backup_codes`, same convention as
`organization_invitations`' token hashing). Generating/regenerating requires a real AAL2
session (`generate_my_mfa_backup_codes` checks `auth.jwt() ->> 'aal'` server-side) --
cannot be done on a password-only session, including by someone who merely knows the
account password.

## Enforcement: middleware, not a page-level check

`lib/supabase/middleware.ts` now calls `get_my_mfa_status()` on every authenticated
request and redirects to `/mfa/verify` (preserving the real destination) whenever an
account has a verified TOTP factor and the current session hasn't cleared it -- a
Server Component's own check can be skipped by navigating directly to a URL; middleware
cannot. `signInAction` also checks `getAuthenticatorAssuranceLevel()` right after password
verification and routes to `/mfa/verify?redirectTo=...` instead of the normal destination,
so the gate is reached immediately, not just eventually.

## Two real bugs found and fixed via live testing, not caught by typecheck/lint

1. **`AAL2_REQUIRED` never actually mapped to the client.** `services/rpc-error.ts`'s
   shared `CODE: message` parser uses `/^([A-Z_]+): (.+)$/` -- no digits allowed. A
   digit-bearing error code silently fell through to a generic "UNKNOWN" message. Caught by
   a unit test, not by inspection; renamed to `STRONG_AUTH_REQUIRED` everywhere.
2. **Every session showed `user_agent: "node"`.** Sentinel makes every Supabase Auth call
   server-side (Server Components, Server Actions, Route Handlers) -- without forwarding
   the real incoming request's `User-Agent` header, GoTrue only ever sees the Next.js
   server process's own outbound request, not the real browser/device. Found live while
   screenshotting the new Sessions settings section: two genuinely different browser
   contexts both showed "node," making "which device is this" meaningless despite
   revocation itself working correctly. Fixed at the source in all three places a
   session-creating or -refreshing request originates (`lib/supabase/server.ts`,
   `lib/supabase/middleware.ts`, `app/auth/confirm/route.ts`) by forwarding the real
   `user-agent` header via each client's `global.headers` option. Re-verified live: a new
   session now shows the real Chromium user-agent string.

Also found and fixed along the way: the confirmation email template
(`supabase/templates/confirmation.html`) hardcoded `next=/organizations`, which silently
overrode the new intent-aware, organization-auto-creating redirect logic in
`/auth/confirm` for every real (non-immediate) signup confirmation -- a real, previously
undiscovered gap 0030 had already named ("intent does not propagate through email
confirmation") that only became reachable once `enable_confirmations` was actually turned
on this slice. Removed the hardcoded `next`; the route's own metadata-driven logic (added
this slice, mirroring `signUpAction`'s immediate-sign-in branch) now runs for every real
signup confirmation.

## Tests, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1080/1080, 68 files) all pass, including
two new test files (`mfa-service.test.ts`, `mfa-actions.test.ts`) and extended coverage in
`auth-service.test.ts`/`auth-signin-signup-routing.test.ts` for the new `mfaRequired`
return shape and gate redirect.

Live, against a real reset local database, real Postgres, real GoTrue, real Mailpit-captured
email (not stubbed):

- **Email verification**: signup shows "Check your email"; sign-in before confirming is
  rejected with a real "Confirm your email" error; the real confirmation email was found
  in Mailpit and its real link followed; a researcher-intent confirmation lands on
  `/programs`, an organization-intent confirmation auto-creates the real organization and
  lands on its Members page; re-following the *same* link from a fresh, unauthenticated
  browser fails with `confirmation_failed` (real single-use token, not a client-side guess).
- **MFA enrollment**: a real TOTP secret + QR code generated by GoTrue; confirming with a
  real, locally-computed TOTP code (RFC 6238, HMAC-SHA1) succeeds; exactly 10 backup codes
  generated and shown once.
- **MFA gate**: password sign-in on an MFA-enrolled account redirects to `/mfa/verify`,
  never straight into the app; navigating directly to a protected URL while pending is
  blocked by middleware and bounced back to `/mfa/verify`; a wrong 6-digit code is
  rejected; the correct, live-computed code clears the gate.
- **Backup codes**: a fabricated code is rejected; the real saved code clears the gate;
  the identical code is rejected on a second attempt (real single-use enforcement, not
  just decoration).
- **Sessions**: two genuinely separate browser contexts signed in as the same account both
  appear in the list with real, distinct user-agent strings; revoking one from the other
  immediately invalidates it (confirmed: the revoked device is redirected to `/sign-in` on
  its very next navigation).
- **MFA disable**: clicking Disable really unenrolls the factor (confirmed via
  `/settings` state) and really deletes all remaining backup codes (confirmed via direct
  database query, count = 0); the next sign-in no longer gates through `/mfa/verify`.

## What was deliberately not built this slice

Everything else the researcher-vertical audit flagged MISSING (saved/bookmarked programs,
retesting architecture, notification/invitation preferences, a unified inbox, program
search sort/filter) -- queued for the next pass, per the user's own explicit sequencing
decision. Public researcher profiles/directory remain REJECTED (standing decision, 0038/0039/
0049, not reopened here). Passkeys and OAuth remain deferred per 0023's own ranking,
unaffected by this slice.

Per standing instruction, `npm run build` was not run for this iteration.
