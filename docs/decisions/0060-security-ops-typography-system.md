# 0060 — Security-ops typography system (post-hoc)

Related: [[0035-unpatched-visual-identity-system]], [[0043-researcher-visual-identity-pass]].

## Why this doc exists

`app/layout.tsx` has cited "docs/decisions/0062-security-ops-redesign.md"
for the app's current type-system choice since before this numbering slot
existed. That file was never written. This doc records, post-hoc, what the
cited code already does, and the in-code comment is corrected to point here.

## What the code actually does

`app/layout.tsx` loads two Google fonts once, at the root, as CSS
variables — never re-imported per component:

- **Space Grotesk** (weights 500/600/700) → `--font-space-grotesk`, consumed
  as `--font-display` in `app/globals.css`'s `@theme inline` block. Used for
  display/heading weight across the authenticated product.
- **Inter** (weights 400/500/600/700) → `--font-inter`, consumed as
  `--font-sans`. Used for UI and body text.

Both load with `display: "swap"`. This is the app-wide default type system;
it is distinct from `docs/decisions/0056`'s page-scoped Plus Jakarta Sans
override on the public homepage's `PublicHome`, which remains a deliberate,
disclosed exception scoped to that one file's own `next/font/google` call,
not a change to this root-level pairing.

## Verification

No behavior changed by writing this doc. `app/layout.tsx`'s dangling
`docs/decisions/0062-security-ops-redesign.md` comment is updated to cite
`0060` in the same pass that authored this file.
