# 0030: Public entry point and two-sided authentication

Date: 2026-08-31
Status: Accepted

## Why `/` is the anonymous entry point

Before this slice, an anonymous visit to `/` did **not** redirect to `/sign-up` — that specific claim was checked live and found inaccurate. What actually rendered was worse in a different way: the full authenticated `AppShell` chrome (a sidebar of Programs/My reports/Reputation/Notifications/Organizations/Settings links, every one of which just bounces to sign-in) around a single line of text, "Sign in to see your programs, reports, and notifications." This is not a landing page — it's an empty authenticated state wearing the wrong layout, and it explains the perception this slice's task was written against: there was no real public entry experience, whatever the exact mechanism. `/` is now the real answer to "what is Sentinel, and which side am I on" for an anonymous visitor, and the exact, unmodified, already-correct authenticated `HomePage` for everyone else — the branch is a single `if (!user) return <PublicHome />` at the top of the same file, not a new route, not a rewrite of the authenticated experience.

## Researcher vs. organization acquisition

Two dedicated routes, `/researchers/sign-up` and `/organizations/sign-up`, both nested under their existing top-level areas (`app/researchers/`, already home to the reputation page; `app/organizations/`, already the org list page) — confirmed safe against Next.js's static-route-before-dynamic-route resolution, so `/organizations/sign-up` cannot be shadowed by `/organizations/[organizationId]`. Both render the identical `SignUpForm`, parameterized by one new prop, `intent`, which affects only two things: the page's own `AuthLayout` copy (eyebrow, title, description) and which real page the account lands on immediately after signup. No new role, no new database column, no new authorization check. The neutral `/sign-up` (reached only via an old link/bookmark or the sign-in page's own "Create an account" cross-link) is no longer a form — it's the same `AudienceChoice` component the homepage uses, so a visitor who arrives there mid-journey sees the identical choice, not a third, drifting variant of it.

## Identity vs. organization membership vs. platform role — unchanged, by design

`create_organization`'s own authorization is untouched: any authenticated user can still call it (see `0024`/`0025`'s live-tested finding). This was a deliberate choice, not an oversight left uncorrected. The task's own instruction was explicit: preserve the flexibility, because a person can legitimately be a researcher and later, separately, an organization owner — collapsing that into "signing up as X permanently locks you into X" would be inventing a role model Sentinel's own schema does not have and was never asked to build. What changed is narrower and entirely front-end: choosing "researcher" at signup never leads toward organization creation (the account lands on `/programs`), and choosing "organization" leads toward it (the account lands on `/organizations`, where "Create organization" is the same explicit, already-existing action a zero-org user already saw before this slice). The route represents intent; it does not gate or grant capability. Live-tested: a fresh researcher-intent signup was confirmed to land on `/programs`, not `/organizations`, and nothing in this slice added a check that would prevent that same account from later calling `create_organization` explicitly — that remains exactly the existing, documented, deliberate flexibility.

## Sign-in routing: real relationships, never a guessed role

Previously, both `signInAction` and the sign-in page's own already-authenticated guard hardcoded `/organizations` as the destination whenever no explicit `redirectTo` was present — meaning a pure researcher account, with zero organization membership, was sent straight to "you don't belong to an organization yet," which is not that account's real context. A new shared helper, `lib/auth/default-destination.ts`'s `determineDefaultDestination()`, re-derives the account's actual, current relationships (via the existing `listCurrentUserOrganizations`/`listMyProgramParticipations` — no new query, no new RPC) and picks: organization-only → `/organizations`; researcher-only → `/programs`; both, or neither yet → `/` (where the existing, unmodified `HomePage` already handles exactly this shared context correctly). Never inferred from email, never client-supplied — both call sites recompute it fresh from the database on every sign-in. Live-tested across all four cases (organization-only, researcher-only, both, neither) plus the existing safe/unsafe `redirectTo` override paths, both live in a real browser and in a dedicated unit test suite (`tests/unit/auth-signin-signup-routing.test.ts`, 10 tests).

## Email verification journey

Unchanged. `enable_confirmations = false` locally means every signup in this environment signs in immediately (the `"signed_in"` branch), so the `"confirm_email"` branch (unaffected by this slice) remains real but currently unreachable here, exactly as `0023` already documented. Intent does not currently survive through a future real email-confirmation round trip to the eventual `/organizations` vs `/programs` destination — this is a disclosed, narrow gap (Section: newly discovered gaps), not silently ignored.

## Public-content boundary: no invented marketplace

`programs` has no visibility column — re-confirmed, not re-guessed, by the same schema audit `0024`/`0025` already performed. The public homepage states this honestly ("Programs are currently invite-only — an organization brings a researcher in directly once they're ready to test") rather than showing a fake program list or silently saying nothing. No new column, no new query, no new researcher-facing discovery surface was added — that remains `0026`'s own named next-priority gap, explicitly out of scope here.

## Competitor principles — selective, not copied

HackerOne, Bugcrowd, and Intigriti were researched specifically on their anonymous first-visit experience (a distinct research pass from the role/RBAC research `0024`/`0025` already did). The one pattern common to all three, and the one Sentinel's design directly adopts: **the researcher-vs-organization choice is encoded in which link/route a visitor picks before any form appears — never a mid-form "what's your role?" question after a generic "Sign up" click.** All three also lean heavily on quantified trust signals (logo walls, "600k+ bugs found," G2/Gartner badges, ROI stats) as their primary persuasion mechanism — deliberately not adopted here; Sentinel's homepage carries zero numbers of any kind, real or invented, matching this codebase's own established "no vanity metrics" principle rather than competing on stat density. Intigriti's organization path is not self-serve at all (invite/sales-only); Sentinel's remains self-serve, per the task's own explicit instruction to preserve existing flexibility rather than gate it further.

## Visual system

No new visual language. `PublicHome` reuses the exact header pattern `AuthLayout` already established (`Sentinel` wordmark + `Security operations` eyebrow, border-bottom, no card), the same `SectionLabel`/heading/description hierarchy every auth page already uses, and the same restrained-teal-link, no-card, no-gradient treatment `AudienceChoice`'s two entries share with the rest of the product.

## What was deliberately not touched

MFA, passkeys, OAuth, magic links (all separately, evidence-gated deferred per `0023`). The password recovery flow (unchanged, live-reconfirmed reachable from `/sign-in`). The authenticated `HomePage`'s own content (byte-for-byte unchanged). `create_organization`'s authorization (unchanged, by explicit instruction).

## Newly discovered gaps

Signup `intent` does not currently propagate through a real (currently unreachable) email-confirmation round trip to the post-verification destination — `/auth/confirm`'s `next` parameter is fixed per email template, not per-signup. Low priority: this path cannot be exercised in the current environment (`enable_confirmations = false`), and building intent-preservation for an unreachable path would be exactly the kind of speculative engineering this codebase's own conventions reject. Revisit only if/when email confirmation is actually enabled.
