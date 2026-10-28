import { redirect } from "next/navigation";
import type { Route } from "next";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../services/organization-members";
import type { AuthenticatedUser } from "../../../../types/auth";

/** Every integrations page: signed in, and an active owner or security admin of this
 * organization (the same rule every integration database function enforces again). */
export async function requireIntegrationAdmin(organizationId: string, path: string): Promise<{ user: AuthenticatedUser; allowed: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=${path}` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  return { user, allowed: Boolean(actor && actor.status === "active" && (actor.role === "owner" || actor.role === "security_admin")) };
}
