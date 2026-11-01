# 0063 — Real payment processing and tax-form compliance (scoping only, not built)

## Status

Scoped, not implemented. This document is the concrete plan for closing the researcher-growth
gap identified in the HackerOne/Bugcrowd feature-parity review: Unpatched cannot actually pay a
researcher today. It intentionally stops short of wiring a real external payment provider,
because that requires business decisions (which provider, which currencies/countries to support
first, who holds the compliance relationship) and real API credentials that only the product
owner can supply — not something to decide or fake inside a coding session.

## Why this is scoped, not built, in this pass

`lib/payment-provider.ts` already defines the exact seam a real provider plugs into
(`PaymentProvider.createPayment`/`getPaymentStatus`/`cancelPayment`), and its own comment states
the intent plainly: *"Adding Stripe/Razorpay later means writing a new PaymentProvider
implementation and changing which RPC(s) the service layer calls."* Building a real integration
means:

- Choosing a provider (see "Provider choice" below) — a business decision, not an engineering one.
- Creating real provider accounts, agreeing to their terms, and generating real API keys — cannot
  be done from inside this session.
- Deciding which countries/currencies launch first — bank transfer coverage, payout minimums,
  and compliance requirements vary enormously by provider and by country.
- Standing up webhook infrastructure with a real public endpoint, which this local/dev
  environment cannot expose to a real provider's webhook delivery.

Faking any of this (e.g. a "Stripe-shaped" provider that always returns success) would be exactly
the failure mode `lib/payment-provider.ts`'s own comment already calls out: *"faking success here
is the exact failure mode this abstraction exists to prevent."* So this stays a plan.

## Provider choice

Recommend **Stripe Connect (Express accounts)** for the first real provider, for these reasons
specific to this product:

- Stripe Connect Express is purpose-built for "platform pays many independent recipients"
  (exactly Unpatched's researcher-payout shape), with Stripe handling KYC/identity verification,
  tax-form collection (see below), and payout scheduling.
- Stripe's idempotency-key mechanism maps directly onto `PaymentProvider.createPayment`'s existing
  `idempotencyKey` parameter — no interface change needed.
- Stripe Connect supports 40+ countries for payouts, meaningfully wider than PayPal Payouts API's
  practical business-payout coverage, and wider than a bank-transfer-only aggregator (Wise) alone.
- Stripe issues 1099-K/1099-NEC (US) automatically for connected accounts crossing IRS thresholds,
  which materially reduces the amount of tax-compliance code Unpatched has to build itself (see
  "Tax form handling" below).

A second provider (PayPal Payouts API, as an alternative payout *method* Stripe Connect doesn't
cover well — e.g. a researcher without a bank account) can be added later as a second
`PaymentProvider` implementation without touching the domain layer, exactly as the existing
abstraction promises.

## What has to be built, in order

### 1. Schema: `payout_accounts` table (new)

One row per researcher per provider, holding the *link* to the researcher's own account at the
provider — never card/bank numbers themselves (those live at Stripe, not in Unpatched's
database, exactly like `components/settings/payout-details-settings.tsx`'s existing comment
already anticipates: *"real fields, encrypted at rest"* — a real provider account reference is
the same category of sensitive-but-necessary data).

```sql
create table payout_accounts (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null references auth.users(id),
  provider text not null,               -- 'stripe_connect' initially
  provider_account_id text not null,    -- Stripe's acct_... id
  onboarding_status text not null,      -- 'pending' | 'restricted' | 'enabled'
  payouts_enabled boolean not null default false,
  tax_form_status text not null,        -- 'not_submitted' | 'submitted' | 'verified'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (researcher_id, provider)
);
-- RLS: researcher_id = auth.uid() for select; no update/delete from the client at all --
-- every mutation goes through a webhook-driven RPC (see below), matching payment_obligations'
-- own "no client-side status mutation" discipline.
```

`onboarding_status`/`payouts_enabled`/`tax_form_status` are **read from Stripe via webhook**, never
set by the client — the same "server/provider is the only source of truth for money-adjacent
state" discipline `payment_attempts` already uses (a human/provider confirms, the client never
asserts).

### 2. Onboarding flow

1. Researcher clicks "Set up payouts" (replaces the current static `PayoutDetailsSettings` form).
2. Server Action calls Stripe's `accounts.create` (Express) + `accountLinks.create`, returns a
   Stripe-hosted onboarding URL.
3. Researcher completes identity verification and **tax form submission (W-9 for US persons,
   W-8BEN/W-8BEN-E for non-US) directly on Stripe's hosted onboarding flow** — Stripe Connect
   Express includes this as a built-in step, which is why this doc doesn't design a custom
   in-house tax-form UI: reimplementing IRS-compliant W-8BEN collection and validation is
   substantial compliance surface Stripe already owns and keeps current with IRS rule changes.
4. Stripe redirects back; a webhook (`account.updated`) tells Unpatched the account's real
   `onboarding_status`/`payouts_enabled`/`tax_form_status`.

### 3. Webhook endpoint: `app/api/webhooks/stripe/route.ts` (new)

- Verifies Stripe's webhook signature (`stripe-signature` header) before touching anything —
  this is the one new trust boundary a real integration introduces, and it must be as rigorous as
  every existing RPC's own re-authorization discipline.
- Handles `account.updated` (see above) and `payout.paid`/`payout.failed` (drives
  `payment_attempts.state` via a new `record_provider_payment_result` RPC, parallel to the
  existing `record_manual_payment_result` but provider-driven instead of operator-driven).
- Idempotent by Stripe event id (store processed event ids, matching the existing
  `outbox_events` idempotency discipline from 0015).

### 4. New `PaymentProvider` implementation: `lib/payment-provider-stripe.ts`

Implements the existing interface exactly:

```ts
export const stripeConnectProvider: PaymentProvider = {
  name: "stripe_connect",
  async createPayment({ idempotencyKey, amountMinorUnits, currency }) {
    // stripe.transfers.create with idempotencyKey passed as Stripe's own Idempotency-Key header
    // returns { outcome: "requires_operator_action" } is wrong here -- a real provider call
    // either succeeds synchronously or the RESULT arrives via webhook, so this returns a new,
    // real third outcome the interface doesn't have yet: see "Interface change" below.
  },
  // ...
};
```

**Interface change required**: `PaymentProviderResult.outcome` currently has no state for "call
succeeded, but the real result arrives asynchronously via webhook" — `requires_operator_action`
is semantically wrong for this (no human needs to act; Stripe needs to finish processing). Add a
fourth outcome, `pending_confirmation`, and a matching `payment_attempts.state` value, so a real
async provider is representable without overloading the manual provider's own state. This is the
one schema/interface change this scoping doc identifies as necessary before Stripe can be wired
in — flagging it now so it isn't discovered mid-implementation.

`activePaymentProvider` in `lib/payment-provider.ts` switches from `manualPaymentProvider` to
`stripeConnectProvider` behind an environment flag (`PAYMENT_PROVIDER=stripe_connect`), so a
staged rollout (some environments still on manual) stays possible during migration.

### 5. Settings UI changes

- `components/settings/payout-details-settings.tsx`'s current static bank/PayPal-field form is
  replaced by a "Payout account status" panel: shows `onboarding_status`/`payouts_enabled` from
  `payout_accounts`, with a "Complete setup" / "Update details" button that redirects to a fresh
  Stripe-hosted `accountLinks` session (Stripe requires a fresh link per session; the URL isn't
  reusable).
- `app/bounties/page.tsx`'s real `payment_obligations` list stays exactly as-is — this work only
  changes *how* a `succeeded` obligation gets there, not the ledger itself.

## What does NOT change

- `payment_obligations`, `payment_attempts`, bounty-policy versioning, and every existing RPC
  (`create_payment_obligation`, `cancel_payment_obligation`) are untouched — this is additive
  infrastructure underneath the existing ledger, not a rewrite of it.
- The `PaymentProvider` interface's core shape (`createPayment`/`getPaymentStatus`/
  `cancelPayment`) is preserved; only the `outcome` union grows by one member.
- No mock/fixture payment data is introduced anywhere — this plan produces zero UI until a real
  provider account exists to back it, consistent with AGENTS.md's product-integrity rules.

## Compliance notes (for whoever picks this up)

- US persons: Stripe issues 1099-NEC/1099-K automatically once thresholds are crossed; Unpatched
  does not need to generate these itself.
- Non-US persons: Stripe Connect Express collects W-8BEN/W-8BEN-E during onboarding; Unpatched
  stores only `tax_form_status`, never the form content itself.
- Sanctions/restricted-country screening is handled by Stripe's own onboarding (Express accounts
  are refused in unsupported/restricted countries automatically) — Unpatched does not need a
  separate sanctions-list check.
- This is a genuine legal/compliance surface (money transmission, tax reporting) — before
  building this, route the provider choice and country-launch-order decisions through whoever
  owns compliance for this product, not through an engineering-only decision.
