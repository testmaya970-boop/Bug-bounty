import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { RewardGroupsBoard } from "../../../../components/rewards/reward-groups";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../services/organization-members";
import { listRewardGroups } from "../../../../services/reward-groups";

/** Reward groups (202610300001): named categories of assets, each with its own bounty table. */
export default async function RewardGroupsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/rewards` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || actor.role === "billing_admin") {
    return (
      <AppShell title="Reward groups" user={user} organizationId={organizationId}>
        <PermissionDenied>Reward groups are available to the organization&apos;s security team.</PermissionDenied>
      </AppShell>
    );
  }
  const { groups, canManage } = await listRewardGroups(organizationId);
  return (
    <AppShell title="Reward groups" user={user} organizationId={organizationId}>
      <div className="max-w-6xl space-y-5">
        <Breadcrumbs items={[{ label: "Rewards" }, { label: "Reward groups" }]} />
        <p className="max-w-3xl text-sm text-ink-muted">
          Group your assets by how much they matter: Core Platform, Payments, Public Website. Each group has its own bounty table, and every asset belongs to one group.
          A report on an asset is paid from its group&apos;s table; new assets join the default group.
        </p>
        <RewardGroupsBoard organizationId={organizationId} groups={groups} canManage={canManage} />
      </div>
    </AppShell>
  );
}
