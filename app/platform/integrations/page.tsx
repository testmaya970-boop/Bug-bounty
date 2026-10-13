import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { LocalTime } from "../../../components/ui/local-time";
import { SandboxPayoutActions } from "../../../components/platform/sandbox-payout-actions";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { getIntegrationStatuses, listPendingSandboxPayouts, listRecentIntegrationEvents, type IntegrationStatus } from "../../../services/integrations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatMoney } from "../../../lib/money";

const MODULE_LABEL = { identity: "Identity verification", payments: "Payouts", phone: "Phone verification" } as const;
const MODE: Record<IntegrationStatus["mode"], { label: string; tone: string; note: string }> = {
  live: { label: "Live", tone: "bg-success/10 text-success", note: "Talking to the provider." },
  sandbox: { label: "Sandbox", tone: "bg-warning/15 text-warning", note: "Simulated in-app. Never runs in production." },
  manual: { label: "Manual", tone: "bg-surface-muted text-ink-muted", note: "A person pays outside Unpatched and records it." },
  none: { label: "Off", tone: "bg-surface-muted text-ink-muted", note: "Manual review only." },
  misconfigured: { label: "Needs setup", tone: "bg-danger/10 text-danger", note: "Selected but can't run -- see missing settings." },
};
const WEBHOOK: Record<string, string> = { persona: "/api/webhooks/identity/persona", cashfree: "/api/webhooks/identity/cashfree", razorpayx: "/api/webhooks/payouts/razorpayx", paypal: "/api/webhooks/payouts/paypal" };

/**
 * Which third-party provider each module uses, whether it can run, and what happened lately.
 * Credentials live only in the server's environment: this page names the variables a provider
 * needs, never their values.
 */
export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/integrations" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const statuses = getIntegrationStatuses();
  const [events, sandboxPayouts] = await Promise.all([listRecentIntegrationEvents(), listPendingSandboxPayouts()]);

  return (
    <AppShell title="Integrations" user={user}>
      <div className="max-w-5xl space-y-8">
        <p className="text-sm text-ink-muted">
          Each module picks its provider from server configuration (<code className="font-mono text-xs">IDENTITY_PROVIDER_IN</code>, <code className="font-mono text-xs">PAYOUT_PROVIDER_GLOBAL</code>, ...). Changing a provider is a deploy, not a click -- keys never pass through this page.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                {["Module", "Route", "Provider", "Status", "Setup"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => (
                <tr key={`${s.module}-${s.route}`} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{MODULE_LABEL[s.module]}</td>
                  <td className="px-4 py-3 text-ink-muted">{s.route}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink">{s.provider}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${MODE[s.mode].tone}`}>{MODE[s.mode].label}</span>
                    <p className="mt-1 text-xs text-ink-muted">{MODE[s.mode].note}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {s.missingEnv.length > 0 && <p className="text-danger">Missing: {s.missingEnv.join(", ")}</p>}
                    {s.requiredEnv.length > 0 && s.missingEnv.length === 0 && <p>Configured</p>}
                    {WEBHOOK[s.provider] && (
                      <p className="mt-1">
                        Webhook: <code className="font-mono">{WEBHOOK[s.provider]}</code>
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sandboxPayouts.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>Sandbox payouts waiting for a result</SectionLabel>
            <p className="text-sm text-ink-muted">In live mode the provider&apos;s webhook decides these. In the sandbox you play that part.</p>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {sandboxPayouts.map((p) => (
                <li key={p.reference} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-ink">{formatMoney(p.amountMinorUnits, p.currency)}</span>
                    <span className="ml-2 font-mono text-xs text-ink-muted">{p.reference.slice(0, 18)}…</span>
                    <span className="ml-2 text-xs text-ink-muted">
                      <LocalTime value={p.createdAt} />
                    </span>
                  </span>
                  <SandboxPayoutActions reference={p.reference} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <SectionLabel>Recent provider activity</SectionLabel>
          {events.length === 0 ? (
            <p className="text-sm text-ink-muted">No provider calls or webhooks yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className={`text-xs font-semibold ${e.outcome === "ok" ? "text-success" : "text-danger"}`}>{e.outcome === "ok" ? "OK" : e.outcome === "rejected" ? "Rejected" : "Error"}</span>
                  <span className="text-ink">
                    {MODULE_LABEL[e.module as keyof typeof MODULE_LABEL] ?? e.module} · <span className="font-mono text-xs">{e.provider}</span> · {e.kind}
                  </span>
                  {e.detail && <span className="min-w-0 truncate text-xs text-ink-muted">{e.detail}</span>}
                  <span className="ml-auto text-xs text-ink-muted">
                    <LocalTime value={e.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
