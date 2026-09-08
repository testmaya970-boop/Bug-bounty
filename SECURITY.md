# Unpatched Security Constitution

Vulnerability reports, proof-of-concept material, private program and researcher data, company data, bounties/payouts, API credentials, webhook secrets, and security events are confidential by default. `ARCHITECTURE.md` defines implementation boundaries; this document defines the required security outcome.

## Authentication and sessions

Use secure server-managed sessions through Supabase Auth; support future MFA and recovery without weakening session invalidation. Never log credentials, session tokens, report contents, or secret material. Security-sensitive account/session changes require auditable server-side handling.

## Authorization and isolation

Every sensitive operation is authorized server-side. Hidden UI, disabled controls, client role checks, URL obscurity, and UUIDs are not access control. Protect against IDOR, privilege escalation, cross-tenant access, and broken object-level authorization. Researchers access only their permitted private data; organization/triage access is scoped by membership and program assignment; private program existence is not revealed to unauthorized people. RLS reinforces, but never replaces, service-level authorization.

## Inputs and attachments

Validate all untrusted input server-side and protect against XSS, injection, SSRF, CSRF where applicable, command injection, path traversal, unsafe deserialization, prototype pollution, and malicious file uploads. Attachments need type/size validation, private storage, malware-scanning architecture, and a server authorization decision before constrained retrieval. A signed URL alone is insufficient.

## Audit and finance

Sensitive mutations produce an audit event with actor, action, resource, timestamp, and relevant before/after state. This includes status, severity, bounty, membership, visibility, payout, and administrative changes. Financial records are append-oriented: bounty decision, transaction, researcher balance, and payout are separate authoritative concepts. The browser never determines a bounty amount or balance.

## Secure development bar

Use parameterized data access, least privilege, safe errors, rate-limit architecture, secret management, dependency review, and explicit negative authorization tests. When delivery speed conflicts with security correctness, security correctness wins.
