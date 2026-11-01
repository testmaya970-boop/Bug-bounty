import React from "react";
import { notFound } from "next/navigation";
import { requireResearcherSettings } from "../../../../lib/auth/account-type";
import { sandboxAllowed } from "../../../../lib/integrations/common";

/** Test mode only: stands in for PayPal's / Stripe's consent page off production. It sends the
 * researcher to the same callback URL the real provider would, with the same one-time state. */
export default async function ConnectSandboxPage({ searchParams }: { searchParams: Promise<{ provider?: string; state?: string }> }) {
  if (!sandboxAllowed()) notFound();
  await requireResearcherSettings();
  const { provider, state } = await searchParams;
  if ((provider !== "paypal" && provider !== "stripe") || !state) notFound();
  const name = provider === "paypal" ? "PayPal" : "Stripe";

  return (
    <div className="mx-auto max-w-sm space-y-5 rounded-xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-ink">Connect with {name}</h1>
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">Test mode</span>
      </div>
      <p className="text-sm text-ink-muted">Unpatched wants to send your bounty payouts to your {name} account.</p>
      <form method="get" action={`/api/payout-connect/${provider}/callback`} className="space-y-3">
        <input type="hidden" name="state" value={state} />
        <label className="block text-[13px] font-medium text-ink" htmlFor="account">
          {name} account email
        </label>
        <input id="account" name="account" type="email" required className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink" />
        <div className="flex gap-2">
          <button name="outcome" value="allow" className="min-h-11 flex-1 rounded-md bg-action px-3 text-sm font-medium text-on-action hover:bg-action-hover">
            Allow
          </button>
          <button name="outcome" value="deny" formNoValidate className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-ink">
            Cancel
          </button>
        </div>
      </form>
      <p className="text-[11px] text-ink-muted">Test mode stands in for {name}&apos;s own page. Nothing is connected to a real account.</p>
    </div>
  );
}
