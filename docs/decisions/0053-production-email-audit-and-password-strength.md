# 0053 — Production email deployment audit (no deployment exists) + real password minimum

Related: [[0052-account-security-mfa-sessions-email-verification]],
[[0052.1-email-delivery-audit-and-resend]].

## Production deployment audit -- conclusive, not guessed

Checked every real place a deployment or a second Supabase environment would be recorded,
none inferred:

- `vercel.json`, `.vercel/`, `netlify.toml`, `Dockerfile`, `fly.toml`, `.github/workflows/`
  -- none exist anywhere in the repository.
- `.env.local` -- the only env file in the repo, contains exactly one Supabase URL
  (`http://127.0.0.1:54321`, the local stack) and the well-known, publicly-documented local
  anon/service-role demo keys (not secrets -- every `supabase init` project ships these
  same literal values).
- `supabase/.temp/` -- no `project-ref` file, meaning `supabase link` has never been run
  against this project. There is no linked Supabase Cloud project at all.
- `README.md` and the rest of the repo -- no mention of a deployed URL, hosting provider,
  or a second (Preview/Production) environment anywhere.

**Conclusion, stated exactly as asked:**

- Where is production Unpatched deployed? **Nowhere. No deployment exists.**
- Which Supabase project does it use? **None -- no Supabase Cloud project has ever been
  linked to this repository.**
- Do Production and Preview use separate Supabase environments? **N/A -- neither exists.**
- Is `enable_confirmations` on in the production Auth project? **N/A.**
- What SMTP is configured in the production Supabase project? **N/A -- there is no
  production Supabase project to configure.**
- Is a custom SMTP provider already configured? **No, anywhere in this repository or
  environment.**
- Production Site URL / redirect URLs? **N/A.**
- Does `/auth/confirm` work against the production domain? **N/A -- there is no
  production domain.**

Per the explicit instruction to stop rather than fabricate: **I did not create a
deployment, a Supabase Cloud project, or SMTP credentials.** What you need to supply,
concretely, to actually stand up production email delivery:

1. **A hosting target** for the Next.js app (Vercel is the natural fit given
   `next.config.ts`'s own shape, but any Node-capable host works) -- a real account and a
   decision on where this deploys.
2. **A Supabase Cloud project** (`supabase link` + `supabase db push` to apply every
   migration in `supabase/migrations/` against it) -- a real Supabase organization/project,
   created and paid for outside this session.
3. **A transactional email provider account and a verified sending domain** -- e.g.
   SendGrid, Postmark, Resend, or AWS SES; whichever you pick, I need real
   host/port/username/password (or API key) plus a domain you control and can add the
   provider's SPF/DKIM DNS records to. `supabase/config.toml`'s already-present, currently
   commented `[auth.email.smtp]` block is the exact real place these values go, using
   Supabase's own `env(...)` indirection so no secret is ever committed to source.
4. A decision on the **production Site URL** (e.g. `https://unpatched.yourdomain.com`) so
   `supabase/config.toml`'s `site_url`/`additional_redirect_urls` and this project's own
   confirm-route host-header logic (0023, unchanged) resolve correctly.

None of the required "verify against a real external inbox" checks (production
confirmation, password recovery, magic-link/OTP, researcher/organization routing in
production) can be performed without these four things existing first. Stating this
plainly rather than claiming any of them "work."

## What was safe to do without a deployment: local email stays correct

Nothing in `supabase/config.toml`'s `[local_smtp]` (Mailpit) section was touched -- local
development remains exactly `local Supabase Auth → Mailpit`, unchanged, still real and
verified (0052/0052.1).

## Password strength: a real, backend-matching minimum, not a fabricated composition rule

The previous minimum (8 characters, client-only) did not match the actual Supabase-enforced
minimum (6) and enforced no composition rule -- present, but not encouraging a genuinely
strong password. Raised, on both sides at once so they can never disagree (0023's own
"never imply a rule the backend doesn't check" principle, reapplied):

- `supabase/config.toml`'s `minimum_password_length`: 6 → **12** (real, server-enforced --
  verified live: a direct, client-bypassing `auth.signUp` call with an 11-character
  password is genuinely rejected by Supabase Auth itself, "Password should be at least 12
  characters").
- `actions/auth.ts`'s new `strongPasswordSchema` (12 chars, applied to signup and password
  reset only -- **never** to sign-in, which must keep accepting an existing account's
  already-chosen, possibly-shorter password; the real credential check there is Supabase
  Auth itself, this schema is just "did you type something").
- `passwordStrengthLabel`/new `passwordStrengthLevel` (`components/auth/password-input.tsx`):
  thresholds recalibrated to the real minimum (Too short <12, Fair 12-15, Good 16-19,
  Strong 20+) -- still length-first, still no fabricated composition rule
  (`password_requirements` stays `""`), per this project's own standing OWASP/NIST-based
  reasoning (0023).
- A real, literal-class (never runtime-derived, avoiding the exact Tailwind static-scan bug
  found earlier this session) segmented strength bar now renders alongside the existing
  text label on signup and reset-password -- sign-in's password field still shows neither,
  since strength is irrelevant to an already-chosen password.

## Tests, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1096/1096, 68 files) all pass. Live: an
11-character signup password is rejected client-side with the real message; a genuinely
strong password is accepted and a real signup succeeds; a direct API call bypassing the
client entirely confirms the *server* now rejects an 11-character password too (not just
the client-side check) -- re-verified after discovering `docker restart` alone does not
apply a `minimum_password_length` change (a full `supabase stop`/`start` was required,
the same lesson as 0052.1's email-template restart requirement).

Per standing instruction, `npm run build` was not run for this iteration.
