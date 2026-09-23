# 0006: Program scope & asset model — three target types, database-authoritative canonicalization, most-specific-match precedence

Date: 2026-08-26
Status: Accepted

## Context

Scope defines what a researcher may test — `SECURITY.md` treats authorization boundaries as security-critical, and `DOMAIN.md`'s conceptual path (`Researcher → Report → Program → Organization → Assets`) makes Scope/Assets the layer that makes report authorization meaningful later. `DOMAIN.md` did not previously define an asset/scope model in any detail; this document establishes it, per `AGENTS.md`'s instruction not to invent domain semantics silently.

## Smallest correct model: no global asset registry

A scope entry's canonical target lives directly on `program_scope_entries`, scoped to one program — there is no separate `assets` table shared across programs. `DOMAIN.md` does not currently require the same logical target (e.g., `api.example.com`) to carry a shared identity across two different programs, and inventing that now would be exactly the kind of global asset graph the task warned against building prematurely. If a future slice needs cross-program asset identity (e.g., asset-centric deduplication or reputation), it can be added without a breaking schema change — this decision only says it is not needed yet, not that it never will be.

## Three initial asset types

`domain`, `url`, `ip_cidr`. Chosen because they cover the overwhelming majority of real bug-bounty scope definitions and each has enough distinct semantics to be worth doing well, rather than diluting effort across ten weak target types. Deliberately deferred: mobile applications, source repositories, cloud resource identifiers, and any target type without a well-defined matching semantic yet. Adding a fourth type later means adding an enum value and a new branch in the shared canonicalization/matching functions below — the architecture does not need to change.

## Canonicalization is database-authoritative, not duplicated in TypeScript

`private.canonicalize_scope_target(asset_type, target_input)` is the **only** place canonicalization and validation logic exists. `add_scope_entry` and `evaluate_program_scope` (below) both call it; the TypeScript layer does not reimplement any of these rules — the same reasoning `create_organization`'s slug generation already established (server-side, authoritative, not trusted from the client), and the same reasoning that keeps `services/authorization.ts`'s role-capability model as Sentinel's only source of truth for its domain. Client-side validation stays intentionally shallow (non-empty, a generous max length) — the RPC's `INVALID_TARGET: <message>` error is what the UI actually surfaces, mirroring exactly how `createProgramSchema`/`createOrganizationSchema` behave today. This avoids the two-sources-of-truth drift risk that produced real bugs in the organization-creation migration (0003) — there is only one implementation to keep correct.

### Domain canonicalization

Lowercased; a single trailing FQDN root dot is stripped (`example.com.` → `example.com`); a wildcard is exactly one leading `*.` label, nothing else (`*.example.com` valid, `**.example.com` and `a.*.example.com` are not); no scheme, port, or path is accepted (reject, never silently strip — silently discarding a scheme or path the user typed would be exactly the "silent canonicalization of user-visible values" the task prohibited). At least two labels are required (a bare TLD like `com` is rejected). **Deferred, explicitly**: internationalized domain names / punycode. Non-ASCII input fails the hostname regex and is rejected with `INVALID_TARGET` rather than silently mishandled — this is an honest limitation, not a hidden gap, and needs a real punycode-encoding decision (and likely a dependency) when it's actually needed.

### URL canonicalization

Scheme restricted to `http`/`https` (lowercased); host validated with the same hostname rule as `domain` (no wildcard hosts for URLs in this slice — wildcarding a URL's host is a real future capability, not built now); default ports (`:80` for http, `:443` for https) are stripped since they are semantically identical to omitting them, any other port is kept; **a query string or fragment causes the entire input to be rejected** with `INVALID_TARGET`, not silently discarded — query/fragment are not part of scope identity, and silently stripping them would hide from the user that their input was reinterpreted. Path defaults to `/` when omitted. The canonical form is split and stored as two columns, `url_origin` (`scheme://host[:port]`) and `url_path`, specifically so `evaluate_program_scope`'s matching query never has to re-parse a stored string at query time.

**Known, documented limitation**: path-prefix matching (below) is asymmetric with respect to a trailing slash on the *stored entry itself* — an entry stored as `/admin/` will not match a later evaluation of the bare `/admin` (though the reverse, an entry stored as `/admin` matching an evaluated `/admin/`, works correctly, since `/admin/` — trailing slash and nothing else — falls inside `/admin`'s own prefix boundary). This is a real, narrow gap, disclosed here rather than silently left for someone to discover later; a full fix (normalizing a trailing-only slash at storage time) is deferred rather than rushed into this already-large slice.

### IP/CIDR canonicalization

Stored as Postgres's native `cidr` type, not a hand-rolled string/regex implementation — the task explicitly asked to evaluate a native network type before writing custom logic, and `cidr` is exactly right here: a bare IP (`203.0.113.5`) is automatically treated as a single-host network (`/32` or `/128`), and critically, **`cidr` rejects a range whose host bits are set beyond its prefix** (`203.0.113.5/24` is invalid — Postgres itself raises an error, since bits are set past the /24 boundary) — this is a real, free validation guarantee a string-based implementation would have had to hand-build and could easily have gotten wrong. IPv4 and IPv6 both work through the same `cidr` cast.

## Scope precedence: most-specific match wins; ties are structurally prevented, not just documented

For a given evaluated target, the single most-specific matching active scope entry decides the result; no match means **not in scope** (default-deny, never default-allow). Specificity:

- **Domain**: an exact hostname match outranks any wildcard match; among wildcard matches, the longer (more specific) suffix wins (`*.admin.example.com` outranks `*.example.com` for a target like `foo.admin.example.com`). A wildcard `*.example.com` matches only **strict** subdomains — it does not match the bare apex `example.com` itself, and it cannot match `evil-example.com` (matching is done via a validated `%.<suffix>` boundary check, never a raw `endsWith`/prefix string comparison, so a domain that merely ends with the same characters without a real label boundary can never match).
- **URL**: origin (scheme+host+port) must match exactly; among path matches, the longer path prefix wins, and a prefix only counts at a real `/`-delimited boundary — `/admin` never matches `/admin-secret`, only `/admin` itself or anything under `/admin/...`.
- **IP/CIDR**: Postgres's native `>>=` (contains-or-equal) operator decides containment; among containing entries, the smallest matching range (largest prefix length, via `masklen()`) wins.

The database's own per-program uniqueness constraint (`(program_id, asset_type, target)` where active) makes a true tie between two *identically specific* entries structurally impossible for domain and URL matching in practice — two entries can only be equally specific by having the identical canonical target, which the constraint already forbids. The evaluation query still orders by `scope_state = 'out_of_scope' desc` as a final, defensive tie-break (explicit exclusion wins if a tie were ever somehow reached), documented here precisely because it should never actually be exercised.

## Scope entries are never physically deleted

"Remove" is `status = 'active' → 'removed'` (with `removed_at`/`removed_by`), the same pattern `organization_members` already established for suspension/removal. A future report tied to a scope entry that has since been marked out of scope, or removed, must still be able to point at a real historical row — physically deleting it would make that impossible. RLS still allows an authorized program's own admins/managers to read removed rows (for audit purposes); the Control Center's primary scope list shows only `active` entries.

## Authorization

Reuses `0004-program-authorization.md`'s exact two-path check — organization Owner/Security Admin (oversight) or a `program_members` row for that program — for every scope mutation (`add_scope_entry`, `update_scope_entry`, `remove_scope_entry`) and for the read-only `evaluate_program_scope`. No new permission concept was invented; scope management is treated as part of "managing this program," which is already what a `program_members` `manager` row means.

## Duplicates are a real error, not a silent success

Unlike organization/program creation's idempotency-key pattern (which exists to protect a single *intentional* action from an accidental retry), adding a scope entry that already exists (after canonicalization) returns `DUPLICATE_TARGET`, not the existing row. These are different situations: a client-generated idempotency key represents "I meant to do this exactly once"; re-submitting an identical target with no such key represents a genuine ambiguity (did the user mean to check its current state, or did they forget it was already there?) that is safer to surface as an explicit, clear error than to paper over. The database's partial unique index (`(program_id, asset_type, target) where status = 'active'`) is what actually enforces this, including under genuine concurrency — the loser of a race gets `DUPLICATE_TARGET`, and the database ends up with exactly one logical row either way.

## Lifecycle interaction

Every scope mutation requires `program.status = 'draft'`. Today this check is unconditionally true (no transition RPC exists yet — see `0005-program-lifecycle.md`), so it is a forward-looking guard, not a currently-observable restriction — but it is real, tested code, not a comment promising future behavior. Whether `review` or `active` should also permit scope changes (and if so, which ones) is an open question for whichever slice actually adds status transitions; deciding it now, before a single transition exists, would be inventing domain rules the task explicitly warned against.

## `evaluate_program_scope`: the internal scope-decision boundary, not a researcher-facing API

A new `public` `SECURITY DEFINER` RPC, authorized by the identical two-path check every other scope operation uses — **not** a researcher-facing endpoint (researchers are not organization members and this check would reject them entirely, by design; a genuinely researcher-facing "is my target in scope" surface is future work once researcher access exists at all). Its purpose today is to give program managers/admins one authoritative, centralized place to ask "does my scope configuration actually cover this target the way I intend" — the same canonicalization and matching logic that will eventually gate report submission, exercised now so it is proven correct before anything depends on it. `services/scope.ts`'s `evaluateProgramScope` is a thin wrapper around it.

## Deferred, explicitly

- ~~Bulk/CSV import~~ — see `docs/decisions/0006a-scope-bulk-import-export.md`.
- ~~Editing a scope entry's underlying target/type~~ — superseded: `db/migrations/202609090009_editable_scope_target.sql` widens `update_scope_entry` to accept a new `asset_type`/target, re-running the same `canonicalize_scope_target` `add_scope_entry` uses. This was a deliberate override of the original decision above, made directly with the product owner — not a silent reversal. The audit-ambiguity cost this paragraph warned about is real and only partially mitigated: the `scope.asset_updated` audit row for the edit itself now carries both the previous and new target, but no earlier `audit_logs` row referencing the old target is rewritten, so a row from before the edit can still name a target that no longer exists on any current entry.
- IDN/punycode domains, wildcard URL hosts, a global cross-program asset registry, and status-transition-aware scope-editing rules — all named above, all real gaps, none silently pretended to be solved.
