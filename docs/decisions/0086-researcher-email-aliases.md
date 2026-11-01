# 0086 — Researcher email aliases (Hostinger Email, IMAP + SMTP)

Status: accepted (2026-10-08) · Migrations: `202610080001_researcher_email_aliases.sql`,
`202610080002_email_alias_retries.sql`

## Decision

Every researcher can create one alias, `<username>@<ALIAS_EMAIL_DOMAIN>` (e.g.
`alice@alias.netras.ai`), like HackerOne's `@wearehackerone.com` and Bugcrowd's
`@bugcrowdninja.com`, for registering test accounts on program targets.

- **All on Hostinger.** The alias domain is added to the Hostinger Email plan, with one
  mailbox (e.g. `forwarder@alias.netras.ai`) set as its **catch-all**, so mail to any
  `<username>@` lands there. Hostinger has no inbound webhook, so nothing is exposed
  publicly: `workers/alias-mail` (`npm run worker:alias-mail`) logs into that mailbox.
- **Inbound:** the worker polls INBOX over IMAP (default every 30 s), reads the alias from
  `Delivered-To` / `X-Original-To` / `To` / `Cc`, and files each handled message under
  `Processed`.
- **Forwarding:** sent over Hostinger SMTP from the catch-all mailbox itself (so SPF/DKIM
  pass for the domain), with the original sender in the display name and `Reply-To`. The
  researcher's real address is never shown to the sender.
- **Rules:** researcher accounts only; one stable alias per researcher (lower-cased
  username, numeric suffix on collision); `+tags` accepted and ignored; suspended or
  deactivated accounts stop forwarding; 200 forwards per alias per 24 h; mail from the
  alias domain itself is never forwarded (loop guard).
- **Reliability:** every delivery is logged (`email_alias_forwards`, visible to the
  researcher), keyed by `Message-ID|alias` (a content hash when there's no Message-ID), so
  a re-polled message is never forwarded twice. A temporary SMTP failure leaves the
  message unread and the next poll retries it on the same log row (202610080002); a
  permanent one is logged as failed and filed.

## Not done here

- Organizations can't yet see which of their users signed up with an alias.
- Researchers can't disable or rotate their alias themselves.
- Hostinger's own sending limits apply to the forwarded copies (per-mailbox daily cap).
- The first real delivery should be checked by hand once the mailbox is configured.
