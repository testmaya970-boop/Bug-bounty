# 0050 — Sign-up cards match the reference screenshots; business-email-only for organizations

Related: [[0035-authentication-experience-visual-design]], [[0049-researcher-identity-audit]].

## Request

Three attached screenshots: HackerOne's real researcher sign-up card (Name/Username/
Email/Password), a different app's organization sign-up card (Company name/Work email/
Password), and Sentinel's own `/settings` page. The ask: make Sentinel's researcher and
organization sign-up cards look like the references, restrict organization signup to
business email, and investigate a reported "bug in researcher settings, organisation
creation."

## What the "bug" actually was

Live reproduction of `/settings` (both light/dark) rendered identically to the user's own
screenshot -- no rendering defect. `CreateOrganizationDialog` had no code-level bug either.
The real gap was a workflow one: `SignUpForm` collected only email/password regardless of
intent, so a researcher couldn't choose a name or username at signup (silently got
`email-prefix_xxxxxx` forever, uneditable until 0049), and an organization-intent signup
required a redundant second step -- sign up, then separately open the dialog and retype
the same organization name. That gap is what this slice closes.

## Changes

**Migration `202609010003_signup_identity_choice.sql`**: `handle_new_auth_user` now reads
an optional `username` from signup metadata (`raw_user_meta_data ->> 'username'`) and uses
it if it matches `^[a-z0-9_]{3,32}$` and isn't already taken; any collision or invalid
format falls straight through to the existing auto-derived fallback, inside the same
`insert`'s exception handler -- signup itself can never fail because of a username race.
Deliberately not a separate `check_username_available` RPC callable pre-signup: that would
need `EXECUTE` granted to `anon`, which is otherwise zero everywhere in this schema (0049).
`display_name` needed no backend change -- the trigger already read it.

**`lib/auth/business-email.ts`**: `isBusinessEmail(email)` -- a blocklist of ~20 known
free/consumer webmail domains (gmail, yahoo, outlook, icloud, protonmail, etc.), not an
allowlist, so any real company domain this list has never heard of is accepted.

**`services/auth.ts`**: `signUpWithPassword` takes an optional `{ displayName, username }`
and passes it as Supabase Auth signup metadata -- it never writes `public.users` directly.

**`actions/auth.ts`**: `signUpAction` gained `displayName`/`username`/`companyName`, all
optional, zod-validated. Re-checks `isBusinessEmail` server-side for `intent:
"organization"` (defense in depth -- the client check is never the actual boundary). On a
signed-in organization-intent signup with a company name, calls the existing, unmodified
`createOrganization` RPC right away and redirects into `/organizations/{id}/members`;
best-effort -- if that call fails, the account is not lost, the user simply lands on
`/organizations` exactly as before this slice, where "Create organization" is still the
next visible action.

**`components/auth/sign-up-form.tsx`**: wrapped the form in a real bordered/shadowed card
(`rounded-xl border border-border bg-surface p-6 shadow-sm`) inside the existing 0035
two-column `AuthLayout` shell (kept as-is -- it was already a deliberate, good design, not
a bare centered card like the references, and the "card" quality the screenshots show is
achieved by framing the form itself, not by discarding that layout). Researcher intent
gets "Your name" (required) and "Username" (optional, helper text explains the fallback);
organization intent gets "Organization name" (required) and an inline "Use your work
email" helper plus an immediate client-side rejection (no round trip) for a
known-personal-email domain, mirrored by the server-side check above.

## What was deliberately not built

- Live username-availability checking before submit (would need an anon-callable RPC,
  which nothing else in this schema grants -- see above). The trigger's silent-fallback
  approach gets the same practical outcome (no failed signups) without that exposure.
- A "Confirm password" field or terms checkbox on the organization card, even though the
  second reference screenshot shows both -- there is no terms-of-service page for a
  checkbox to link to, and fabricating one to match a screenshot would be exactly the kind
  of "generic clone" feature the project has repeatedly rejected.

## Tests, live verification

`npm run typecheck`, `npm run lint`, `npm test` (1034/1034, 64 files) all pass, including
new/extended coverage in `auth-ui.test.tsx` (SignUpForm's intent-specific fields, the card
wrapper, `isBusinessEmail`) and `auth-signin-signup-routing.test.ts` (personal-email
rejection before `signUpWithPassword` is ever called, organization auto-creation and its
redirect, the metadata pass-through, and the best-effort fallback when auto-creation
fails).

Live Chromium, real accounts, real database: a researcher signup with a chosen name and
username redirects to `/programs`, and the chosen display name is confirmed on `/settings`
by reading the actual input's `value` after reload. An organization signup with a gmail.com
address is blocked client-side with no request sent. The same form resubmitted with a real
work-email domain creates the account, auto-creates "Acme Security" through the existing
`create_organization` RPC, and lands on its real Members page -- confirmed visually,
including the real `organization.created` audit-log entry.

Per standing instruction, `npm run build` was not run for this iteration.

## Addendum: the real Settings complaint

After delivering the above, the user flagged `/settings`'s "Organization" section itself:
for a researcher with zero organizations, it showed "You don't belong to an organization
yet. Go to Organizations →". Live reproduction (real zero-org account, 20+ automated
clicks) found the link itself navigates correctly every time -- not a broken link. Asked
the user directly what was wrong; they confirmed it's the first reading from 0044/0047's
own established pattern this session (the "Manage an organization instead?" dead-end, the
researcher-facing "Reports" tab): this content has no place on a pure researcher's own
settings page at all, regardless of whether the underlying link works.

**Fixed** in `app/settings/page.tsx`: the entire "Organization" section (heading and body)
is now only rendered when `organizations.length > 0` -- a zero-org researcher's Settings
page ends at Biography, exactly like every other researcher-only surface this session.

This does narrow discovery of `create_organization` for an existing researcher-only
account down to zero in-app surfaces (0030 documented this Settings link as the
deliberate, single remaining path for that cross-over case) -- disclosed, not silently
dropped: `/organizations/sign-up` remains the real, intended path for someone starting an
organization account, and `create_organization`'s own authorization is completely
unchanged. If a real need for in-product researcher-to-organization discovery resurfaces,
it should be a deliberate decision, not a UI teaser buried in Settings.
