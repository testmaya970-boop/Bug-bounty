# 0023: Authentication experience 2026 — recovery flow, password visibility, two live-found session bugs

Date: 2026-08-30
Status: Accepted

## Context

Sign-in/sign-up existed (`docs/decisions/0002-authentication-and-backend-boundary.md`) but had no password-recovery path at all, no password-visibility toggle, and a generic-CRUD visual treatment inconsistent with the rest of the product's editorial/security-operations language. This slice redesigns the sign-in/sign-up UI within Sentinel's existing visual system, adds the missing recovery flow end to end, and — found only through live browser verification, not by inspection — fixes two real, previously-shipped session bugs in `app/auth/confirm/route.ts` that made the recovery (and, by the identical code path, signup email-confirmation) flow completely non-functional before this slice.

## 2026 authentication method ranking

| Method | Decision | Reasoning |
|---|---|---|
| Email + password | **Retain, harden** | Already the only implemented method; `check_sign_in_rate_limit` (0018) and password-reset (this slice) are the two gaps that mattered. |
| Password reset / recovery | **Implement now** | Mandatory per this slice's own task; previously entirely missing — a user who forgot their password had no way back into their account. |
| Passkeys / WebAuthn | **Defer, evidence-based** | FACT: `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts` marks `signInWithPasskey`/`registerPasskey` "experimental," gated behind `auth.experimental.passkey`. FACT: `supabase/config.toml`'s own `[auth.passkey]` section is commented out (`# enabled = false`) in this project. VENDOR CAPABILITY: exists in the installed SDK version, but explicitly not production-supported by its own vendor. DESIGN DECISION: do not enable an experimental, vendor-flagged-unstable auth path for a security product's primary login surface; do not fabricate a UI button for a backend capability that isn't safely enabled. The sign-in form's own code comment marks the exact extension point (above the divider, before the email/password form) so enabling this later needs no restructuring. |
| Magic link | **Evaluate, not implemented** | Would reuse the exact `/auth/confirm` `token_hash`/`type=magiclink` path this slice just fixed, so it's cheap to add later, but introduces a second "how do I get in" mental model alongside password + recovery without a stated product need for it this slice. |
| OAuth / OIDC (Google, GitHub, etc.) | **Do not implement** | No product requirement identified (this is a bug-bounty platform, not a consumer app where "sign in with Google" measurably reduces drop-off); adds a second credential-authority Sentinel would need to trust and a second account-linking edge case (what happens when the OAuth email doesn't match an existing account) with no current design answer. Explicitly the kind of "because competitors have it" addition this slice's task told me not to build. |
| MFA / TOTP | **Defer to its own slice** | No enrollment/verification UI or backend exists; building a UI without a real backend was explicitly disallowed this slice. A real security product should offer this eventually — named as the next recommended security slice below, not silently dropped. |

## Two real session bugs found live, not by inspection

Both were found only by actually driving the recovery flow through a real Chromium browser and inspecting real network responses and cookies — neither was visible from reading the route's own code, which looked correct and was already documented (incorrectly, as it turned out) as "Supabase's current documented pattern."

**Bug 1 — the Route Handler never persisted the verified session.** `app/auth/confirm/route.ts` called `supabase.auth.verifyOtp(...)` using the shared `createSupabaseServerClient()` (in `lib/supabase/server.ts`), whose cookie adapter writes via `next/headers`'s `cookies().set()` — a pattern that works for Server Components/Actions, but a manually-constructed `NextResponse.redirect(...)` returned from a Route Handler does not reliably carry that mutable-cookie-jar state. Verified directly: `verifyOtp` returned no error (the token was genuinely valid), yet the redirect response carried no `Set-Cookie` header at all — a real, previously-shipped bug, not a hypothetical one. **Fix**: build a request-scoped Supabase client whose cookie adapter reads from `request.cookies` and writes directly onto the `NextResponse` object this function returns, mirroring the exact pattern `lib/supabase/middleware.ts` already used successfully.

**Bug 2 — the redirect landed on the wrong hostname.** After fixing Bug 1, the cookie was set correctly but `/reset-password` still showed "This link has expired." Found live: `request.url` inside this Route Handler reports `http://localhost:3000/...` regardless of which host the client actually connected to (confirmed by comparing `request.url` against `request.headers.get("host")`, which correctly showed `127.0.0.1:3000` — a Next.js dev-server quirk in how `NextRequest.url` is constructed). Since the session cookie this route sets is host-scoped (no explicit `Domain` attribute), redirecting to a *different* hostname than the one that set the cookie meant the browser correctly refused to send it back, and the following `/reset-password` request arrived with zero cookies. **Fix**: build the redirect target from `request.headers.get("host")` (and `x-forwarded-proto`), never from `request.url`.

Both fixes are isolated to `app/auth/confirm/route.ts`; no other route, no RLS policy, no session-handling code elsewhere was touched. This also transparently fixes signup email-confirmation (`type=signup`), which shares the identical code path — currently unreachable in local dev only because `supabase/config.toml`'s `enable_confirmations = false`, but real once a deployment enables it.

## Account-enumeration safety — verified empirically

`requestPasswordResetAction` returns an identical `{ ok: true }` response (rendered as "If an account exists for {email}, we've sent instructions...") for a real account and a fabricated one, never `{ ok: false }` for "account not found." This was verified two ways: a direct script call to `resetPasswordForEmail` for both a real seeded account and a fabricated one returned byte-identical `{ error: null }` responses (Supabase's own vendor guarantee), and this slice's browser verification confirmed the *rendered page text* is identical for both cases (differing only in the email address echoed back, which is attacker-supplied input, not a leak). A genuine rate-limit response is the only path that surfaces a different message, which is itself a real, non-enumerating signal (Supabase's own `[auth.rate_limit] email_sent = 2/hour`).

## Session invalidation after reset

`resetPasswordAction` calls `signOut()` immediately after a successful `updateUser({ password })`, before the client redirects to `/sign-in?reset=success`. This is deliberate, not incidental: without it, the sign-in page's own `if (user) redirect(...)` guard would immediately bounce the still-authenticated recovery session away before the user ever saw the confirmation, and forcing a fresh sign-in with the new password is consistent with `SECURITY.md`'s existing "recovery must not weaken session invalidation" posture.

## Password strength: length-first, no fabricated composition rules

`passwordStrengthLabel` scores purely by length (8/12/16-character thresholds → Too short/Fair/Good/Strong). This matches both current OWASP/NIST guidance and this project's own real Supabase config (`password_requirements = ""` — no composition rule is enforced server-side), so the UI never invents a stricter-looking requirement the backend doesn't actually check.

## Shared primitives introduced

`lib/auth/safe-redirect.ts` (`isSafeRedirect`) — deduplicates open-redirect-guard logic previously copy-pasted in `app/sign-in/page.tsx` and `actions/auth.ts`. `components/auth/password-input.tsx` (`PasswordInput`, `passwordStrengthLabel`) — a single accessible show/hide implementation reused by sign-in, sign-up, and reset-password forms, never touching the underlying `value` and never submitting the form. `components/auth/auth-layout.tsx` was rewritten to the shared "Sentinel / Security operations" header used verbatim from `AppShell`, replacing the previous boxed-card layout — the same branding language, not a second one.

## What was live-tested (real Chromium, this slice)

New signup; existing sign-in; wrong-password (mapped error, no raw provider string); rate-limited sign-in (11 attempts against a dedicated throwaway email, confirming the real `check_sign_in_rate_limit` 10-per-15-minutes boundary from 0018 fires and shows "Too many sign-in attempts..."); enumeration-safe forgot-password for both a real and a fabricated email; the full recovery loop — request reset → real captured email via Mailpit → follow the real link → land authenticated on `/reset-password` → set new password → forced sign-out → `/sign-in?reset=success` banner → sign in with the *new* password; password-visibility toggle (real click-driven type/value/aria-pressed changes, not static markup assertions); keyboard-only navigation (email field and toggle button both reachable via Tab); responsive layout at 1440/1024/390/320px on sign-in, sign-up, and forgot-password (no horizontal overflow at any width); the intended-redirect-preservation round trip (`/organizations` while unauthenticated → `/sign-in?redirectTo=/organizations` → sign in → lands back on `/organizations`, not `/`).

## What remains genuinely unverified / deferred

Email verification UX (`app/sign-up`'s existing "confirm_email" branch) was not live-driven end to end in this slice because `enable_confirmations = false` locally — the code path is real and shares the now-fixed `/auth/confirm` route, but a live signup-confirmation click-through was not performed. Magic link and OAuth remain unimplemented per the ranking above. MFA/TOTP remains unimplemented, named as the next recommended security slice. Passkeys remain deferred pending the vendor marking `auth.experimental.passkey` non-experimental.
