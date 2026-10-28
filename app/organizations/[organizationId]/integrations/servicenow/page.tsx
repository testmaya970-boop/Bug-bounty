import React from "react";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { ActionButton } from "../../../../../components/researcher/journey-controls";
import { ServiceNowForm } from "../../../../../components/integrations/servicenow-forms";
import { getServiceNowConnection, servicenowWebhookUrl } from "../../../../../services/servicenow";
import { businessRuleScript } from "../../../../../lib/integrations/servicenow";
import { deleteServiceNowAction } from "../../../../../actions/servicenow";
import { requireIntegrationAdmin } from "../guard";

/** ServiceNow remediation tickets (202610290005), with the organization's own instance. */
export default async function ServiceNowPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { user, allowed } = await requireIntegrationAdmin(organizationId, `/organizations/${organizationId}/integrations/servicenow`);
  if (!allowed) {
    return (
      <AppShell title="ServiceNow" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can manage ServiceNow.</PermissionDenied>
      </AppShell>
    );
  }
  const conn = await getServiceNowConnection(organizationId);
  const hook = servicenowWebhookUrl(organizationId);

  return (
    <AppShell title="ServiceNow" user={user} organizationId={organizationId}>
      <div className="max-w-4xl space-y-8">
        <Breadcrumbs items={[{ label: "Integrations", href: `/organizations/${organizationId}/integrations` }, { label: "ServiceNow" }]} />
        <p className="text-sm text-ink-muted">
          Triage staff can open a ServiceNow record for an accepted report. Closing the report adds a work note (and resolves an incident); resolving the record in ServiceNow marks an accepted
          report resolved. Uses your own ServiceNow subscription; Security Incident Response is a separately licensed ServiceNow product.
        </p>

        <section className="space-y-3">
          <SectionLabel>Connection</SectionLabel>
          {conn && (
            <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
              <p className="text-ink">
                <span className="font-mono">{conn.instanceUrl}</span> as {conn.username} · {conn.tableName}
              </p>
              {conn.lastError && <p className="text-danger">Last error: {conn.lastError}</p>}
              <ActionButton variant="destructive" action={deleteServiceNowAction.bind(null, organizationId)} confirm="Unpatched stops creating and updating ServiceNow records." confirmLabel="Disconnect ServiceNow?">
                Disconnect
              </ActionButton>
            </div>
          )}
          <p className="text-sm text-ink-muted">Use a dedicated integration user with the itil role (incident) or sn_si.analyst (Security Incident Response), not a person&apos;s account.</p>
          <ServiceNowForm organizationId={organizationId} initial={conn} />
        </section>

        {conn && (
          <section className="space-y-3 border-t border-border pt-6">
            <SectionLabel>Resolve reports from ServiceNow (optional)</SectionLabel>
            <ol className="list-inside list-decimal space-y-1 text-sm text-ink-muted">
              <li>Create a system property unpatched.webhook_token with the token shown when you connected (connect again to get a new one).</li>
              <li>Add a Business Rule on {conn.tableName}: after update, when State changes to Resolved or Closed, with this script:</li>
            </ol>
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-muted p-3 font-mono text-xs text-ink">{businessRuleScript(hook)}</pre>
          </section>
        )}
      </div>
    </AppShell>
  );
}
