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

import { IntegrationsHub } from "../../../../components/organizations/integrations/integrations-hub";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { listCurrentUserOrganizations } from "../../../../services/organizations";

/** Enterprise Integration Hub: central command center to connect, monitor, troubleshoot, and govern every external system. */
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

  const organizations = user ? await listCurrentUserOrganizations(user.id) : [];
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Integration Hub" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` },
            { label: "Integration Hub" },
          ]}
        />

        <IntegrationsHub
          organizationId={organizationId}
          organizationName={organization?.name ?? "Com Olho Cyber Corp"}
        />
      </div>
    </AppShell>
  );
}
