-- Functions created from now on in the public schema are no longer executable by PUBLIC (and
-- so by anon) by default. Every migration already grants what it means to expose; a function
-- that forgets now fails closed (permission denied in tests) instead of being callable by
-- anyone. Existing functions keep their current grants; scripts/check-authz-catalog.mjs
-- (npm run check:authz) reports any public function anon can reach that isn't public by design.
alter default privileges in schema public revoke execute on functions from public;
