import React from "react";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { JiraConnectionSettings } from "../../../../../components/organizations/jira-connection-settings";
import { getJiraConnection, jiraWebhookUrl } from "../../../../../services/jira";
import { requireIntegrationAdmin } from "../guard";

/** Jira Cloud two-way issue sync (moved here from organization settings). */
export default async function JiraIntegrationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { user, allowed } = await requireIntegrationAdmin(organizationId, `/organizations/${organizationId}/integrations/jira`);
  if (!allowed) {
    return (
      <AppShell title="Jira Cloud" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can manage Jira.</PermissionDenied>
      </AppShell>
    );
  }
  const connection = await getJiraConnection(organizationId);

  return (
    <AppShell title="Jira" user={user} organizationId={organizationId}>
      <div className="max-w-4xl space-y-6">
        <Breadcrumbs items={[{ label: "Integrations", href: `/organizations/${organizationId}/integrations` }, { label: "Jira Cloud" }]} />
        <p className="text-sm text-ink-muted">Open a Jira issue for an accepted report and keep both sides in sync: resolving the issue in Jira marks the report resolved.</p>
        <section id="jira" aria-labelledby="jira-heading" className="space-y-3">
          <h2 id="jira-heading" className="text-base font-semibold text-ink">Jira Cloud</h2>
          <JiraConnectionSettings organizationId={organizationId} connection={connection} webhookUrl={jiraWebhookUrl(organizationId)} />
        </section>
      </div>
    </AppShell>
  );
}
