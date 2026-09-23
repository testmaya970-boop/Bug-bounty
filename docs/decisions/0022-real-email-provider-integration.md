# 0022: Real email provider integration — Resend behind the existing seam, no domain changes

Date: 2026-08-30
Status: Accepted

## Context

`0017-notification-routing-and-delivery-foundation.md` built the entire notification domain — routing, preferences, the delivery state machine, and a `lib/email-provider.ts` seam — deliberately without a real provider, reasoning that "an adapter that can never be tested live is not shipped, only the interface + a safe default." This slice exists specifically to close that gap: wire a real provider behind the already-proven seam, without touching the domain, the outbox, or the delivery state machine at all.

## Provider choice: Resend, via a raw `fetch` call, not the `resend` npm package

Resend was the provider `0017`'s own research already targeted the seam's shape against (a documented `Idempotency-Key` header, a simple JSON POST endpoint). This slice confirms that choice rather than re-litigating it. The adapter calls `https://api.resend.com/emails` directly with `fetch` rather than adding the `resend` npm package as a dependency — Resend's send-email endpoint is a single POST with a JSON body and a bearer token; a dependency for one endpoint is exactly the kind of avoidable dependency this codebase's own precedent (`lib/money.ts`'s pure string-based arithmetic instead of a money library) already argues against. If Resend's API surface grows into something this project actually needs beyond sending a single plain-text message, revisit this decision then, not speculatively now.

## Abstraction: unchanged

`EmailProvider`/`EmailMessage`/`EmailSendResult` in `lib/email-provider.ts` are untouched. The notification domain (`services/notifications.ts`, `workers/outbox/handlers/notifications/notification-handler.ts`) still knows only "email provider," never a concrete SDK or HTTP detail — confirmed by grep: `lib/email-provider.ts` is imported by exactly one file outside itself, `workers/outbox/handlers/notifications/notification-handler.ts`, unchanged from before this slice. No Server Component, Server Action, or client component imports it, so the module (and any credential read inside it) never reaches a browser bundle regardless of the `server-only` guard's own bundler-dependent enforcement.

## Provider selection: `EMAIL_PROVIDER=dev|resend`, resolved once at module load

`resolveEmailProvider()` reads `EMAIL_PROVIDER`, defaulting to `"dev"` when unset — so no existing local/test environment starts sending real email merely because this feature now exists. Selecting `"resend"` reads `RESEND_API_KEY`/`EMAIL_FROM` and **throws immediately, at module load**, if either is missing — a misconfigured production deployment fails at startup with a clear error, never silently on the first real notification sometime later. This is the first provider-selection-via-environment-variable mechanism in this codebase (`lib/payment-provider.ts`'s `activePaymentProvider` has no equivalent selector, since no second payment provider exists yet) — introduced here because the task explicitly required it, not speculatively.

## Idempotency: unchanged chain, one new link

`notification_deliveries.id` (minted by `ensure_email_delivery`, before any provider call) remains the idempotency key, now passed through as Resend's own `Idempotency-Key` header — confirmed by a request-construction test asserting the header value equals the delivery id passed in. No second idempotency system was introduced. This also makes an *ambiguous* provider response safe to treat as retryable rather than agonized over: if a retry actually reaches Resend a second time for an already-succeeded send, Resend's own idempotency key — not this file — is what prevents a duplicate real message.

## Error classification

| Condition | Classification | Reasoning |
|---|---|---|
| `fetch` itself throws (DNS, connection refused, timeout) | Retryable | Nothing about the request was rejected — the request never completed a round trip. |
| HTTP 429 | Retryable | Explicit rate-limit signal. |
| HTTP 5xx | Retryable | Provider-side failure. |
| HTTP 401 / 403 | Permanent | The configured API key is rejected; every subsequent identical attempt fails identically — a configuration problem, not a transient one. |
| HTTP 400 / 422 / other 4xx | Permanent | A request Resend will never accept unchanged, regardless of retry count. |
| 2xx with no parseable `id` in the response body | Retryable | Ambiguous, not a confirmed success — see `EmailSendResult`'s own contract: never return `success: true` without a real provider reference. Safe to retry because of the idempotency-key property above. |
| Any other/unrecognized status | Retryable (conservative default) | `record_email_delivery_result`'s own `max_attempts` bound already caps how long a genuinely-permanent-but-unrecognized failure gets retried — the safe default is to let the existing bounded retry decide, never to give up on the caller's behalf from an ambiguous signal alone. |

## Authorization / privacy: unchanged

The existing flow (`notification created → ensure_email_delivery → prepare_notification_email re-verifies current authorization → only then a provider call`) is untouched — the adapter has no access to, and does not re-implement, any authorization logic; it receives only what `prepare_notification_email` already decided was safe to render. The existing regression test proving this (`tests/unit/outbox-handler-notifications.test.ts`'s "never sends an email when prepare_notification_email reports not deliverable") already covered exactly the case this slice's task asked for a new test to prove — re-confirmed passing, not duplicated.

## Delivery state machine: unchanged

`pending`/`processing`/`delivered`/`retryable_failure`/`permanent_failure` — no new state. `record_email_delivery_result`'s existing `max_attempts` logic is what ultimately decides `retryable_failure` vs `permanent_failure` for a given attempt count; this slice's adapter only supplies `p_success`/`p_permanent`/`p_provider_reference`/`p_error`, exactly as `devEmailProvider` already did.

## Development behavior: unchanged

`devEmailProvider` is untouched and remains the default. Every existing test in `tests/unit/email-provider.test.ts` covering it passes unmodified.

## What was actually live-tested

- **Real network round-trip against the real Resend API**, using an intentionally invalid API key (no valid credentials exist in this environment): a genuine HTTP 401 came back from `https://api.resend.com/emails`, correctly classified `permanent`, with the error message confirmed not to contain the key itself. This proves request construction (URL, method, headers, body shape) against the real provider, and proves the error-classification path against a real, non-fabricated response — it does **not** prove a real message was ever delivered to a real inbox.
- **Fail-fast behavior**, in a real (not mocked-in-a-unit-test) Node process: `createResendEmailProvider()` with `EMAIL_PROVIDER=resend` and no credentials throws immediately, naming the missing variable.
- **The full existing pipeline, unaffected**: a real report submitted through the real API against a real local Postgres instance, processed by the real, already-running outbox worker, produced a real `notifications`/`notification_deliveries` row that reached `state = 'delivered'` with a `dev-`-prefixed provider reference — proving this slice did not regress the proven pipeline `0017` already established.
- **Every other item in the task's own test list** (request construction, recipient/from/subject/body mapping, idempotency-key propagation, success mapping, retryable mapping across 429/5xx, permanent mapping across 400/401/403/422, missing-configuration behavior, the unauthorized-notification regression, dev-provider-unchanged) via mocked-`fetch` unit tests — the external HTTP boundary was mocked, not the Sentinel notification domain, per the task's own instruction.

## What remains genuinely unverified

**A real email was never delivered to a real inbox.** No valid `RESEND_API_KEY` exists in this environment. Claiming "production-ready email" would be exactly the unverified claim `DOMAIN.md`'s own "10× product principle" section warns against — this document does not make that claim. The adapter is implemented, fails safely without credentials, and its request/response handling was proven against the real provider's real error path; a genuine successful send, and Resend's real idempotency-deduplication behavior under a real retried request, remain dependent on a real API key being supplied to this environment.

## Deferred (explicitly, not by omission)

Sender-domain verification (SPF/DKIM) setup with Resend — an account/DNS-level concern outside this repository. Bounce/complaint webhook handling — a real inbound webhook receiver is a separate, explicitly out-of-scope slice per this task's own instructions. HTML email templates — `lib/email-render.ts`'s plain-text-only policy is untouched. A second real provider — the seam supports one without any code changing elsewhere, per `lib/payment-provider.ts`'s identical precedent.

## Addendum: Gmail SMTP (`EMAIL_PROVIDER=gmail-smtp`), local development only

Added as a second, explicit alternative for a developer who wants to see real signup-OTP/notification emails land in a real personal inbox without a Resend account — requested directly, not a silent scope expansion. `createGmailSmtpEmailProvider()` in `lib/email-provider.ts` uses `nodemailer` (the one new dependency this slice adds — the original "no new dependency for a single POST endpoint" reasoning above applied to Resend's raw-`fetch` approach specifically; SMTP has no equivalent raw-protocol shortcut, so a real SMTP client library is the honest minimal choice here) against `smtp.gmail.com:465`, authenticated via `SMTP_USER`/`SMTP_PASS` (a Google App Password — Gmail's SMTP relay has rejected plain account passwords since 2025) and `EMAIL_FROM`.

**Never the recommended or production path.** Gmail's SMTP relay is rate-limited (roughly 500 messages/day per account) and its own terms of service do not cover transactional/application email traffic — this exists solely so `EMAIL_PROVIDER=gmail-smtp` is a real, working local-dev option, the same class of convenience `devEmailProvider` already is, just one that actually reaches an inbox. Idempotency is weaker than Resend's: nodemailer/Gmail has no request-level deduplication, so a retried send after a genuinely ambiguous SMTP failure can produce a real duplicate message — the `X-Idempotency-Key` header this provider sets is for manual cross-referencing only, not a dedup guarantee, and is disclosed as such in the provider's own code comment.

**What was live-tested**: nothing yet — no real Gmail App Password exists in this environment at the time this provider was written. `createGmailSmtpEmailProvider()` throws immediately (proven live) when `SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM` are missing, matching `createResendEmailProvider()`'s identical fail-fast posture. A genuine send, and the real SMTP error codes Gmail returns for a bad app password/rate limit, remain unverified until a real credential is supplied.
