import React from "react";
import { notFound } from "next/navigation";
import { requireResearcherSettings } from "../../../../lib/auth/account-type";
import { sandboxAllowed } from "../../../../lib/integrations/common";
import { SandboxIdentityDecision } from "../../../../components/settings/identity-verification";

/** Stands in for a provider's hosted verification page when IDENTITY_PROVIDER_* = sandbox.
 * Never reachable in production. */
export default async function SandboxIdentityPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  if (!sandboxAllowed()) notFound();
  await requireResearcherSettings();
  const { ref } = await searchParams;
  if (!ref?.startsWith("sbx_idv_")) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        <strong>Sandbox.</strong> No documents are checked here. In a live setup this page belongs to the verification provider, and the result arrives by its signed webhook.
      </p>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Identity verification (sandbox)</h1>
        <p className="mt-1 text-sm text-ink-muted">Choose the result the provider would send back.</p>
      </div>
      <SandboxIdentityDecision reference={ref} />
    </div>
  );
}
