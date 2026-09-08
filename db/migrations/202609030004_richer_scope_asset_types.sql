-- Richer scope asset types: mobile apps (iOS/Android), source code repositories,
-- hardware, and AI models -- the only asset types this schema had were domain/url/ip_cidr
-- (202608260005), which cannot represent a mobile-app-only or hardware-only program's real
-- scope at all. Design decisions recorded here and expanded in
-- docs/decisions/0060-richer-scope-asset-types.md.
--
-- 1. Five new enum values, not a generic "other" catch-all -- each is a real, named
--    asset class an organization actually scopes programs to, matching this schema's own
--    existing preference for explicit taxonomy over a free-text/JSON escape hatch
--    (see report_weakness_type's own enum for the same pattern).
-- 2. All five share ONE canonicalization/matching shape (exact-string match on a trimmed
--    identifier), not five near-duplicate branches -- unlike domain (wildcard-subdomain
--    matching) or ip_cidr (CIDR containment) or url (origin+path-prefix matching), none
--    of these five have a real structural sub-match concept: an iOS app is either exactly
--    this bundle id/App Store link or it isn't; a source repo is either exactly this URL
--    or it isn't. Introducing five near-identical branches to express that would be
--    exactly the kind of duplicated-logic risk 0006's own header warns about.
-- 3. No new columns on program_scope_entries -- canonical text IS the identifier
--    (an App Store/Play Store URL, a repo URL, a hardware model string, a model
--    identifier/endpoint), stored in the existing `target`/`display_target` columns
--    exactly as domain already does. No new nullable per-type column, unlike url/ip_cidr,
--    because there is no structured sub-field to extract.
-- 4. private.canonicalize_scope_target and private.match_program_scope are redefined
--    (not duplicated) -- both are this schema's own single choke-point for this logic
--    (0006's decision 2), so a new asset type is only ever a new branch inside them, never
--    a parallel implementation.

alter type public.program_asset_type add value 'ios_app';
alter type public.program_asset_type add value 'android_app';
alter type public.program_asset_type add value 'source_code';
alter type public.program_asset_type add value 'hardware';
alter type public.program_asset_type add value 'ai_model';
