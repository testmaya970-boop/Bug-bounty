import React, { Suspense } from "react";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { requireIntegrationAdmin } from "../integrations/guard";
import { AutomationCenter } from "../../../../components/organizations/automation/automation-center";

/**
 * Automation Center Page: Visual workflow automation platform for security operations,
 * automated triage, SLA enforcement, and integrations.
 */
export default async function AutomationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const { user, allowed } = await requireIntegrationAdmin(
    organizationId,
    `/organizations/${organizationId}/automation`,
  );

  if (!allowed) {
    return (
      <AppShell title="Automation Center" user={user} organizationId={organizationId}>
        <PermissionDenied>
          Only an organization owner, security admin, or authorized manager can access the Automation Center.
        </PermissionDenied>
      </AppShell>
    );
  }

  const organizations = user ? await listCurrentUserOrganizations(user.id) : [];
  const organization = organizations.find((org) => org.id === organizationId);

  return (
    <AppShell title="Automation Center" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` },
            { label: "Automation Center" },
          ]}
        />

        <Suspense
          fallback={
            <div className="rounded-xl border border-border bg-surface p-8 text-sm text-ink-muted">
              Loading automation center...
            </div>
          }
        >
          <AutomationCenter
            organizationId={organizationId}
            organizationName={organization?.name ?? "Com Olho Enterprise"}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}
