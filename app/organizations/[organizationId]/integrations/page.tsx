import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../../components/ui/badge";
import { PageSummary } from "../../../../components/ui/page-summary";
import { GitBranch, KeyRound, MessageSquare, Ticket, Webhook, Wrench, type LucideIcon } from "lucide-react";
import { listChatConnections, listWebhookEndpoints } from "../../../../services/org-integrations";
import { getCodeHostState } from "../../../../services/code-hosts";
import { getServiceNowConnection } from "../../../../services/servicenow";
import { getSsoConnection } from "../../../../services/sso";
import { getJiraConnection } from "../../../../services/jira";
import { requireIntegrationAdmin } from "./guard";

type Card = { href: string; title: string; category: string; icon: LucideIcon; body: string; status: string; on: boolean };

// Named connectors not built yet; shown so teams know they're planned, never as connectable.
const COMING_SOON: { title: string; category: string }[] = [
  { title: "Azure DevOps Boards", category: "Issue tracking" },
  { title: "Linear", category: "Issue tracking" },
  { title: "Bitbucket Cloud", category: "Source control" },
  { title: "Discord", category: "Chat" },
  { title: "Splunk", category: "SIEM" },
  { title: "Microsoft Sentinel", category: "SIEM" },
  { title: "Datadog", category: "SIEM" },
];

/** Every integration and whether it is connected. Each card's page owns its own settings. */
export default async function IntegrationsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { user, allowed } = await requireIntegrationAdmin(organizationId, `/organizations/${organizationId}/integrations`);
  if (!allowed) {
    return (
      <AppShell title="Integrations" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can manage integrations.</PermissionDenied>
      </AppShell>
    );
  }
  const base = `/organizations/${organizationId}`;
  const [hooks, chats, code, sn, sso, jira] = await Promise.all([
    listWebhookEndpoints(organizationId),
    listChatConnections(organizationId),
    getCodeHostState(organizationId),
    getServiceNowConnection(organizationId),
    getSsoConnection(organizationId),
    getJiraConnection(organizationId),
  ]);
  const activeHooks = hooks.filter((h) => h.status === "active").length;
  const providers = code.connections.map((c) => (c.provider === "github" ? "GitHub" : "GitLab"));
  const cards: Card[] = [
    { href: `${base}/integrations/webhooks`, title: "Webhooks", category: "Events", icon: Webhook, body: "Signed event notifications for your SIEM, SOAR or internal tools.", status: hooks.length ? `${activeHooks} of ${hooks.length} active` : "Not set up", on: activeHooks > 0 },
    { href: `${base}/integrations/chat`, title: "Slack and Teams", category: "Chat", icon: MessageSquare, body: "Alerts for new reports, critical findings, status changes and SLA breaches.", status: chats.length ? `${chats.length} channel${chats.length === 1 ? "" : "s"}` : "Not set up", on: chats.some((c) => c.status === "active") },
    { href: `${base}/integrations/code`, title: "GitHub and GitLab", category: "Source control", icon: GitBranch, body: "Issues for accepted reports, in private repositories only.", status: providers.length ? providers.join(" and ") : "Not connected", on: providers.length > 0 },
    { href: `${base}/integrations/servicenow`, title: "ServiceNow", category: "ITSM", icon: Wrench, body: "Remediation tickets in your own instance.", status: sn ? sn.instanceUrl.replace(/^https?:\/\//, "") : "Not connected", on: Boolean(sn) },
    { href: `${base}/integrations/jira`, title: "Jira Cloud", category: "Issue tracking", icon: Ticket, body: "Two-way issue sync.", status: jira ? jira.projectKey : "Not connected", on: Boolean(jira) },
    { href: `${base}/integrations/sso`, title: "Single sign-on", category: "Identity", icon: KeyRound, body: "SAML sign-in and SCIM provisioning with your identity provider.", status: sso ? (sso.status === "active" ? (sso.enforced ? "Required" : "On") : "Set up, off") : "Not set up", on: sso?.status === "active" },
  ];

  const connected = cards.filter((c) => c.on);
  const available = cards.filter((c) => !c.on);
  const grid = (list: Card[]) => (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map((c) => (
        <li key={c.title}>
          <Link prefetch={false} href={c.href as Route} className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-ink"><c.icon aria-hidden className="size-4" /></span>
                <span>
                  <span className="block font-semibold text-ink">{c.title}</span>
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-muted">{c.category}</span>
                </span>
              </span>
              <ToneBadge tone={c.on ? TONE.success : TONE.muted}>{c.status}</ToneBadge>
            </div>
            <p className="mt-3 text-sm text-ink-muted">{c.body}</p>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <AppShell title="Integrations" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <PageSummary
          description="Send reports, alerts and remediation tickets to the tools your team already uses. Each integration has its own settings page."
          metrics={[
            { label: "Connected", value: `${connected.length} of ${cards.length}`, detail: connected.length ? connected.map((c) => c.title).join(", ") : "Nothing connected yet" },
            { label: "Active webhooks", value: String(activeHooks), detail: `${hooks.length} configured` },
            { label: "Chat channels", value: String(chats.filter((c) => c.status === "active").length), detail: `${chats.length} configured` },
            { label: "Single sign-on", value: sso ? (sso.status === "active" ? "On" : "Off") : "--", detail: sso ? (sso.enforced ? "Required for members" : "Optional for members") : "Not set up", tone: sso?.status === "active" ? "success" : "neutral" },
          ]}
        />

        {connected.length > 0 && (
          <section aria-labelledby="connected-heading" className="space-y-3">
            <h2 id="connected-heading" className="text-base font-semibold text-ink">Connected</h2>
            {grid(connected)}
          </section>
        )}

        {available.length > 0 && (
          <section aria-labelledby="available-heading" className="space-y-3">
            <h2 id="available-heading" className="text-base font-semibold text-ink">Available</h2>
            {grid(available)}
          </section>
        )}

        <section aria-labelledby="soon-heading" className="space-y-3">
          <h2 id="soon-heading" className="text-base font-semibold text-ink">Coming soon</h2>
          <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {COMING_SOON.map((c) => (
              <li key={c.title} className="rounded-xl border border-dashed border-border bg-surface-muted px-3.5 py-3">
                <span className="block text-sm font-medium text-ink">{c.title}</span>
                <span className="block text-[11px] text-ink-muted">{c.category} · Coming soon</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
