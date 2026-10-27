# 0088: Scope requires proof of ownership; public contact page

Date: 2026-10-26. Migrations 202610260008, 0009, 0010.

## Problem

Any owner or security admin could put any target in scope, including a live program, and it
authorized testing at once. An organization could therefore send researchers to attack a
third party's domain under Unpatched's safe harbor.

## Decision

Every scope entry carries a `clearance`, computed by a trigger, so every write path is covered.
Only cleared entries take part in scope matching (so no report can be filed against an
uncleared one). They also appear in the public scope list and are the only ones researchers
can read (restrictive RLS). A program cannot enter review or go live without at least one
cleared in-scope asset.

| Asset | Cleared when |
|---|---|
| domain, url | The host is the domain, or a subdomain of it, and the organization verified that domain with a DNS TXT record `_unpatched-challenge.<domain>` = `unpatched-verification=<token>`. The server performs the lookup, and only the service role can mark a domain verified. Removing the domain revokes the clearance. |
| reserved names (`.example`, `.test`, `.invalid`, `.localhost`, `example.com/net/org`), documentation IP ranges | Always. Nobody owns them. |
| IP ranges, apps, repositories, hardware, AI models | A platform admin approves them at `/platform/scope-review`. DNS cannot prove ownership of these. |
| out of scope | Always. An exclusion authorizes nothing. |

Existing entries were re-evaluated by the same rules when the migration ran. Live programs
whose only scope is an unverified real domain stay live, but researchers no longer see or
match that scope until the domain is verified.

## Contact page

`/contact` is public. Messages are written only by the server (`submit_contact_request` is
service_role only). The server first applies a honeypot, a work-email check and the captcha
when one is configured. Messages are rate limited per hashed client IP and per email.
Platform staff read them and mark them handled at `/platform/contact-requests`.

## Open

There is no email notification to staff for a new contact message yet; the inbox is the
only channel. Domain re-verification on a schedule is not built: a domain stays verified
until it is removed.
