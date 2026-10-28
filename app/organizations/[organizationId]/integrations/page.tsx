import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../../components/ui/badge";
import { listChatConnections, listWebhookEndpoints } from "../../../../services/org-integrations";
import { getCodeHostState } from "../../../../services/code-hosts";
import { getServiceNowConnection } from "../../../../services/servicenow";
import { getSsoConnection } from "../../../../services/sso";
import { getJiraConnection } from "../../../../services/jira";
import { requireIntegrationAdmin } from "./guard";

type Card = { href: string; title: string; body: string; status: string; on: boolean };

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
    { href: `${base}/integrations/webhooks`, title: "Webhooks", body: "Signed event notifications for your SIEM, SOAR or internal tools.", status: hooks.length ? `${activeHooks} of ${hooks.length} active` : "Not set up", on: activeHooks > 0 },
    { href: `${base}/integrations/chat`, title: "Slack and Teams", body: "Alerts for new reports, critical findings, status changes and SLA breaches.", status: chats.length ? `${chats.length} channel${chats.length === 1 ? "" : "s"}` : "Not set up", on: chats.some((c) => c.status === "active") },
    { href: `${base}/integrations/code`, title: "GitHub and GitLab", body: "Issues for accepted reports, in private repositories only.", status: providers.length ? providers.join(" and ") : "Not connected", on: providers.length > 0 },
    { href: `${base}/integrations/servicenow`, title: "ServiceNow", body: "Remediation tickets in your own instance.", status: sn ? sn.instanceUrl.replace(/^https?:\/\//, "") : "Not connected", on: Boolean(sn) },
    { href: `${base}/settings#integrations`, title: "Jira Cloud", body: "Two-way issue sync.", status: jira ? jira.projectKey : "Not connected", on: Boolean(jira) },
    { href: `${base}/integrations/sso`, title: "Single sign-on", body: "SAML sign-in and SCIM provisioning with your identity provider.", status: sso ? (sso.status === "active" ? (sso.enforced ? "Required" : "On") : "Set up, off") : "Not set up", on: sso?.status === "active" },
  ];

  return (
    <AppShell title="Integrations" user={user} organizationId={organizationId}>
      <ul className="grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <li key={c.title}>
            <Link prefetch={false} href={c.href as Route} className="block h-full rounded-lg border border-border p-5 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">{c.title}</span>
                <ToneBadge tone={c.on ? TONE.success : TONE.muted}>{c.status}</ToneBadge>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{c.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
