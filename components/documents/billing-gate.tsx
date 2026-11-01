import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../app-shell";
import { PermissionDenied } from "../ui/feedback";
import { getCurrentUser } from "../../lib/auth/current-user";
import { canManagePayments } from "../../services/authorization";
import { getActorMembership } from "../../services/organization-members";
import type { AuthenticatedUser } from "../../types/auth";

/** Billing documents are for an organization's owner, security admin and billing admin (the
 * database functions check the same roles). Returns the user, or the page to show instead. */
export async function billingGate(organizationId: string, path: string, title: string): Promise<{ user: AuthenticatedUser; denied?: never } | { denied: React.ReactElement; user?: never }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=${encodeURIComponent(path)}` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManagePayments(actor.role)) {
    return {
      denied: (
        <AppShell title={title} user={user} organizationId={organizationId}>
          <PermissionDenied>Only an owner, security admin, or billing admin can view this organization&apos;s billing documents.</PermissionDenied>
        </AppShell>
      ),
    };
  }
  return { user };
}
