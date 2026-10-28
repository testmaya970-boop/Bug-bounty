import React from "react";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied, EmptyState } from "../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { ToneBadge, TONE } from "../../../../../components/ui/badge";
import { ActionButton } from "../../../../../components/researcher/journey-controls";
import { WebhookForm, RotateSecretButton } from "../../../../../components/integrations/integration-forms";
import { DeliveryLog } from "../../../../../components/integrations/delivery-log";
import { WEBHOOK_EVENTS, listDeliveries, listWebhookEndpoints } from "../../../../../services/org-integrations";
import { listProgramsForOrganization } from "../../../../../services/programs";
import { deleteIntegrationTargetAction, testIntegrationAction } from "../../../../../actions/org-integrations";
import { requireIntegrationAdmin } from "../guard";

const STATUS = { active: { label: "Active", tone: TONE.success }, paused: { label: "Paused", tone: TONE.muted }, disabled: { label: "Disabled", tone: TONE.danger } } as const;

/** Outbound webhooks (202610290001): signed, retried, logged. */
export default async function WebhooksPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { user, allowed } = await requireIntegrationAdmin(organizationId, `/organizations/${organizationId}/integrations/webhooks`);
  if (!allowed) {
    return (
      <AppShell title="Webhooks" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can manage webhooks.</PermissionDenied>
      </AppShell>
    );
  }
  const [endpoints, deliveries, programs] = await Promise.all([listWebhookEndpoints(organizationId), listDeliveries(organizationId, ["webhook"]), listProgramsForOrganization(organizationId)]);
  const programOptions = programs.map((p) => ({ id: p.id, name: p.name }));
  const events = WEBHOOK_EVENTS.map((e) => ({ value: e.type, label: e.label }));
  const names = Object.fromEntries(endpoints.map((e) => [e.id, e.description ?? new URL(e.url).hostname]));

  return (
    <AppShell title="Webhooks" user={user} organizationId={organizationId}>
      <div className="max-w-5xl space-y-8">
        <Breadcrumbs items={[{ label: "Integrations", href: `/organizations/${organizationId}/integrations` }, { label: "Webhooks" }]} />
        <p className="text-sm text-ink-muted">
          Unpatched POSTs JSON to your endpoint when the events you choose happen. Every request is signed (Standard Webhooks: <code className="font-mono text-xs">webhook-id</code>,{" "}
          <code className="font-mono text-xs">webhook-timestamp</code>, <code className="font-mono text-xs">webhook-signature</code>); verify it and reject anything older than five minutes.
          Payloads carry the report title, status, severity and a link, never the report body. Failed deliveries are retried for about a day; an endpoint that keeps failing is disabled.
        </p>

        <section className="space-y-3">
          <SectionLabel>Endpoints</SectionLabel>
          {endpoints.length === 0 ? (
            <EmptyState title="No endpoints yet">Add one below to start receiving events.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {endpoints.map((e) => (
                <li key={e.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-all font-mono text-sm text-ink">{e.url}</span>
                    <ToneBadge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</ToneBadge>
                  </div>
                  {e.disabledReason && <p className="mt-1 text-sm text-danger">{e.disabledReason}</p>}
                  {e.previousSecretValidUntil && new Date(e.previousSecretValidUntil) > new Date() && <p className="mt-1 text-xs text-ink-muted">The previous secret still verifies for a few hours after a rotation.</p>}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-action">Edit</summary>
                    <div className="mt-3">
                      <WebhookForm organizationId={organizationId} programs={programOptions} events={events} existing={e} />
                    </div>
                  </details>
                  <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-border pt-3">
                    <ActionButton action={testIntegrationAction.bind(null, organizationId, "webhook", e.id)}>Send test</ActionButton>
                    <RotateSecretButton organizationId={organizationId} endpointId={e.id} />
                    <ActionButton variant="destructive" action={deleteIntegrationTargetAction.bind(null, organizationId, "webhook", e.id)} confirm="Unpatched stops sending to this URL and its delivery history is removed." confirmLabel="Remove endpoint?">
                      Remove
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <SectionLabel>Add endpoint</SectionLabel>
          <WebhookForm organizationId={organizationId} programs={programOptions} events={events} />
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <SectionLabel>Recent deliveries</SectionLabel>
          <DeliveryLog organizationId={organizationId} deliveries={deliveries} targetNames={names} />
        </section>
      </div>
    </AppShell>
  );
}
