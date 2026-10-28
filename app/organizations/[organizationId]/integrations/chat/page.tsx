import React from "react";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied, Alert } from "../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { ToneBadge, TONE } from "../../../../../components/ui/badge";
import { ActionButton } from "../../../../../components/researcher/journey-controls";
import { AddToSlackButton, ChatConnectionEditor, ChatConnectionForm } from "../../../../../components/integrations/integration-forms";
import { DeliveryLog } from "../../../../../components/integrations/delivery-log";
import { listChatConnections, listDeliveries, slackAppConfigured, type ChatConnection } from "../../../../../services/org-integrations";
import { listProgramsForOrganization } from "../../../../../services/programs";
import { deleteIntegrationTargetAction, testIntegrationAction } from "../../../../../actions/org-integrations";
import { requireIntegrationAdmin } from "../guard";

const STATUS = { active: { label: "Active", tone: TONE.success }, paused: { label: "Paused", tone: TONE.muted }, disabled: { label: "Disabled", tone: TONE.danger } } as const;
const ALERT_LABEL: Record<string, string> = { new_report: "new reports", critical: "critical findings", status_change: "status changes", sla_breach: "SLA breaches" };

/** Slack and Microsoft Teams alerts (202610290001). */
export default async function ChatIntegrationsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ slack?: string; slack_error?: string }> }) {
  const [{ organizationId }, { slack, slack_error: slackError }] = await Promise.all([params, searchParams]);
  const { user, allowed } = await requireIntegrationAdmin(organizationId, `/organizations/${organizationId}/integrations/chat`);
  if (!allowed) {
    return (
      <AppShell title="Slack and Teams" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can manage chat alerts.</PermissionDenied>
      </AppShell>
    );
  }
  const [connections, deliveries, programs] = await Promise.all([listChatConnections(organizationId), listDeliveries(organizationId, ["slack", "teams"]), listProgramsForOrganization(organizationId)]);
  const programOptions = programs.map((p) => ({ id: p.id, name: p.name }));
  const names = Object.fromEntries(connections.map((c) => [c.id, c.label]));
  const slackApp = slackAppConfigured();

  return (
    <AppShell title="Slack and Teams" user={user} organizationId={organizationId}>
      <div className="max-w-5xl space-y-8">
        <Breadcrumbs items={[{ label: "Integrations", href: `/organizations/${organizationId}/integrations` }, { label: "Slack and Teams" }]} />
        {slack === "connected" && <Alert tone="success" title="Slack connected." />}
        {slackError && <Alert tone="danger" title="Slack wasn't connected.">{slackError.slice(0, 200)}</Alert>}
        <p className="text-sm text-ink-muted">Alerts name the report, its program, status and severity, and link back to Unpatched. They never include the report itself.</p>

        <section className="space-y-3">
          <SectionLabel>Connected channels</SectionLabel>
          {connections.length === 0 ? <p className="text-sm text-ink-muted">No channels yet.</p> : (
            <ul className="space-y-4">
              {connections.map((c) => (
                <ConnectionRow key={c.id} organizationId={organizationId} c={c} programs={programOptions} />
              ))}
            </ul>
          )}
        </section>

        <section className="grid grid-cols-1 gap-6 border-t border-border pt-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <SectionLabel>Slack</SectionLabel>
            {slackApp ? (
              <>
                <p className="text-sm text-ink-muted">Install the Unpatched app and pick a channel. Alerts start with new reports, critical findings and SLA breaches; change them afterwards.</p>
                <AddToSlackButton organizationId={organizationId} />
                <p className="text-xs text-ink-muted">Or paste an incoming webhook URL from your own Slack app:</p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Create an incoming webhook in your Slack workspace (Slack app settings, Incoming Webhooks, Add New Webhook to Workspace) and paste its URL.</p>
            )}
            <ChatConnectionForm organizationId={organizationId} provider="slack" programs={programOptions} />
          </div>
          <div className="min-w-0 space-y-3">
            <SectionLabel>Microsoft Teams</SectionLabel>
            <p className="text-sm text-ink-muted">
              In Teams, open the channel&apos;s Workflows, choose &ldquo;Post to a channel when a webhook request is received&rdquo;, and paste the URL it gives you. Requires Microsoft 365 with Power Automate.
            </p>
            <ChatConnectionForm organizationId={organizationId} provider="teams" programs={programOptions} />
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <SectionLabel>Recent alerts</SectionLabel>
          <DeliveryLog organizationId={organizationId} deliveries={deliveries} targetNames={names} />
        </section>
      </div>
    </AppShell>
  );
}

function ConnectionRow({ organizationId, c, programs }: { organizationId: string; c: ChatConnection; programs: { id: string; name: string }[] }) {
  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{c.label}</span>
        <span className="text-xs text-ink-muted">{c.provider === "slack" ? "Slack" : "Teams"} · {c.targetHint}</span>
        <ToneBadge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</ToneBadge>
      </div>
      <p className="mt-1 text-sm text-ink-muted">Sends {c.alerts.map((a) => ALERT_LABEL[a] ?? a).join(", ")}.</p>
      {c.disabledReason && <p className="mt-1 text-sm text-danger">{c.disabledReason}</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-action">Change alerts</summary>
        <div className="mt-3">
          <ChatConnectionEditor organizationId={organizationId} connection={c} programs={programs} />
        </div>
      </details>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <ActionButton action={testIntegrationAction.bind(null, organizationId, c.provider, c.id)}>Send test</ActionButton>
        <ActionButton variant="destructive" action={deleteIntegrationTargetAction.bind(null, organizationId, c.provider, c.id)} confirm="Alerts stop going to this channel." confirmLabel="Disconnect?">
          Disconnect
        </ActionButton>
      </div>
    </li>
  );
}
