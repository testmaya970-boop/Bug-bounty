# 0068 — Mobile app (scoping only, not built)

## Status

Scoped, not implemented. The feature-parity review found no confirmed official mobile
app on either HackerOne's or Bugcrowd's public app-store listings — the only "HackerOne"
Android app found was an unofficial third-party APK, not a first-party product. This
makes mobile the lowest-priority gap of the five in this pass: it is not a place either
competitor is visibly ahead, so building it is not closing a real competitive gap the way
badges/CVSS/templates are — it is a genuinely new bet, not a catch-up.

## Whether a dedicated app is the right investment at all

Before scoping "how would we build a mobile app," the more important question is whether
a researcher's actual mobile use cases are better served by a responsive web app than a
native one:

- **What a researcher plausibly needs on mobile**: checking notifications (a report
  moved to `needs_information`, a bounty was finalized), reading/responding to report
  communication, glancing at the leaderboard/their own reputation score, browsing public
  programs. None of these need native-only capability (camera, biometrics, background
  location) — they are all read-and-respond flows a well-built responsive web session
  already handles.
- **What a researcher does NOT plausibly do on mobile**: write a multi-thousand-character
  report with code evidence, upload large file attachments during active testing, or
  perform any of the actual security-testing work itself. The core value-creating action
  on this platform is not a mobile use case for either competitor either — which is
  likely *why* neither has invested in a full native app publicly.

**Recommendation**: rather than a native app, verify and harden the existing responsive
web experience for the mobile-appropriate subset above (notifications, report
communication, leaderboard/profile, program browsing) before considering a native build.
This is explicitly a recommendation to reconsider the premise, not a refusal to scope the
literal ask — if a native app is still wanted after that, the plan below is the concrete
path.

## If a native app is still wanted: the real build

- **Technology**: React Native (or Expo) over a fresh native rewrite — this codebase's
  domain logic already lives entirely behind Supabase RPCs and the Supabase JS client,
  which has first-class React Native support; a mobile client would call the exact same
  RPCs (`get_my_reputation_summary`, `list_my_reports`, `post_researcher_message`, etc.)
  the web app already uses, with zero backend changes required to support it.
- **Scope for a v1**: notifications (real push notifications would be the one genuinely
  mobile-native capability worth the investment — the existing `bounty_activity`/
  `report_activity` notification categories already have the right shape, they just need
  a push-delivery provider added alongside the existing dev-only email provider in
  `lib/email-provider.ts`'s pattern), report list + report detail (read + reply, not
  full report *creation* — matching the "core testing work isn't a mobile use case"
  reasoning above), the public leaderboard/profile pages (already genuinely public,
  unauthenticated pages that would work in a mobile webview with zero new backend work
  even before a native shell exists), and program browsing (read-only).
- **Explicitly out of scope for v1**: report submission, evidence/file upload, payment
  method setup, KYC submission — all of these involve either large-input flows or
  sensitive-data entry that are better done on a full-size screen with a real keyboard,
  matching how neither HackerOne nor Bugcrowd's own (unconfirmed) mobile presence
  attempts them either.
- **Auth**: Supabase Auth's session/refresh-token model already supports a long-lived
  mobile session cleanly; no new authentication mechanism is needed, only a mobile-
  appropriate token storage layer (secure device keychain/keystore instead of a browser
  cookie).

## What this document does not do

Does not commit to React Native over any alternative without a real team skill-set
input (a team already fluent in Swift/Kotlin might reasonably choose native over
React Native despite the shared-logic argument above). Does not build a push-notification
provider, does not create a mobile project scaffold, and does not change any existing
RPC or notification-category shape — every one of those is a real, separate decision to
make only once "build a mobile app" survives the reconsideration above.
