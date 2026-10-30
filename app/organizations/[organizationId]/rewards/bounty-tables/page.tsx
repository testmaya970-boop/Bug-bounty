import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../components/ui/feedback";
import { BountyTablesMatrix } from "../../../../../components/rewards/reward-groups";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../../services/organization-members";
import { listRewardGroups } from "../../../../../services/reward-groups";

/** Every reward group's bounty table side by side. */
export default async function BountyTablesPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/rewards/bounty-tables` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || actor.role === "billing_admin") {
    return (
      <AppShell title="Bounty tables" user={user} organizationId={organizationId}>
        <PermissionDenied>Bounty tables are available to the organization&apos;s security team.</PermissionDenied>
      </AppShell>
    );
  }
  const { groups, canManage } = await listRewardGroups(organizationId);
  return (
    <AppShell title="Bounty tables" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-5">
        <Breadcrumbs items={[{ label: "Rewards" }, { label: "Bounty tables" }]} />
        <p className="max-w-3xl text-sm text-ink-muted">
          What each reward group pays per severity. When a report is accepted, its asset&apos;s group and severity decide the suggested reward; you finalize the exact amount within the range.
        </p>
        <BountyTablesMatrix organizationId={organizationId} groups={groups} canManage={canManage} />
      </div>
    </AppShell>
  );
}
