import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { RoleBadge, ToneBadge, organizationStatusTone } from "../../components/ui/badge";
import { RegistryList } from "../../components/ui/security-primitives";
import { CreateOrganizationDialog } from "../../components/organizations/create-organization-dialog";
import { PendingInvitationCard } from "../../components/organizations/pending-invitation-card";
import { listCurrentUserOrganizations, listMyPendingInvitations } from "../../services/organizations";
import { getCurrentUser } from "../../lib/auth/current-user";

export default async function OrganizationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/organizations" as Route);

  const [organizations, invitations] = await Promise.all([listCurrentUserOrganizations(user.id), listMyPendingInvitations()]);

  return (
    <AppShell title="Organizations" user={user}>
      <div className="space-y-8">
        {invitations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-ink">Pending invitations</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {invitations.map((invitation) => (
                <PendingInvitationCard key={invitation.id} invitation={invitation} />
              ))}
            </div>
          </div>
        )}

        {organizations.length === 0 ? (
          <div className="space-y-4">
            <EmptyState title="You don't belong to an organization yet">
              An organization is Unpatched&apos;s security and authorization boundary. Invite your team, run programs, and triage reports once you create or join one.
            </EmptyState>
            <div className="flex justify-center">
              <CreateOrganizationDialog />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Your organizations</h2>
              <CreateOrganizationDialog triggerLabel="Create another organization" />
            </div>
            <RegistryList>
              {organizations.map((organization) => (
                <li key={organization.id}>
                  <Link
                    href={`/organizations/${organization.id}` as Route}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold text-ink">{organization.name}</span>
                      <span className="mt-0.5 block font-mono text-xs text-ink-muted">@{organization.slug}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <ToneBadge tone={organizationStatusTone[organization.status]}>
                        {organization.status === "suspended" ? "Suspended" : organization.status === "created" ? "Created" : "Active"}
                      </ToneBadge>
                      <span className="opacity-75">
                        <RoleBadge role={organization.role} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </RegistryList>
          </div>
        )}
      </div>
    </AppShell>
  );
}
