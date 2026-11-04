import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { OrganizationRole } from "@/types/auth";
import type { OrganizationStatus, PendingInvitationForUser } from "@/types/organization";
import type { OrganizationSettings, OrganizationSettingsRecord } from "@/lib/organization-settings";
import { toSettingsPayload } from "@/lib/organization-settings";

export type OrganizationSummary = { id: string; slug: string; name: string; role: OrganizationRole; status: OrganizationStatus; createdAt?: string };

type OrganizationRow = { role: OrganizationRole; id: string; slug: string; name: string; status: OrganizationStatus; created_at: string | Date };

/** Organizations the signed-in user actively belongs to. Never a query parameterized by a client-supplied user id -- the userId param here is only ever the already-verified caller's own id (see callers), RLS still independently scopes this to rows `organization_members.user_id = auth.uid()` regardless. */
export async function listCurrentUserOrganizations(userId: string): Promise<OrganizationSummary[]> {
  try {
    const rows = await withActorTransaction(userId, (client) =>
      client.query<OrganizationRow>(
        `select m.role, o.id, o.slug, o.name, o.status, o.created_at
         from public.organization_members m
         join public.organizations o on o.id = m.organization_id
         where m.user_id = $1 and m.status = 'active'`,
        [userId],
      ).then((r) => r.rows),
    );
    return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, role: row.role, status: row.status, createdAt: new Date(row.created_at).toISOString() }));
  } catch {
    throw new Error("Organizations could not be loaded.");
  }
}

/**
 * A cheap existence check, not a full list -- used purely to decide whether the
 * "Organization" nav group has anything real to lead to at all (see AppShell). A
 * researcher with no organization membership has no use for "Organizations"/"Settings"
 * in their nav: both routes' own empty states already just point back at "create one," so
 * showing them as persistent chrome to every researcher is noise, not a real capability.
 * `limit 1` makes this a real LIMIT-1 index lookup, not a full count -- existence, not a
 * total.
 */
export async function hasAnyOrganizationMembership(userId: string): Promise<boolean> {
  try {
    const rows = await withActorTransaction(userId, (client) =>
      client.query("select organization_id from public.organization_members where user_id = $1 and status = 'active' limit 1", [userId]).then((r) => r.rows),
    );
    return rows.length > 0;
  } catch {
    throw new Error("Organization membership could not be checked.");
  }
}

/**
 * `idempotencyKey` should be generated once per form mount (not per submit) so a
 * double-click or a network-retry-after-timeout replays the same key and returns the
 * organization already created, rather than creating a second one -- enforced by a real
 * unique constraint in the database (202608260003), not just a disabled button.
 */
export async function createOrganization(name: string, idempotencyKey?: string): Promise<OrganizationSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ id: string; slug: string; name: string }>(client, "public.create_organization", [name, idempotencyKey ?? null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return { id: row.id, slug: row.slug, name: row.name, role: "owner", status: "active" };
}

type PendingInvitationRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: OrganizationRole;
  invited_by_name: string | null;
  expires_at: string;
  created_at: string;
};

function mapPendingInvitationRow(row: PendingInvitationRow): PendingInvitationForUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
    invitedByName: row.invited_by_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Invitations addressed to the signed-in user's own email, across every organization.
 * No userId parameter (unlike its siblings above) -- list_my_pending_invitations matches
 * by the caller's own auth.uid() email inside the RPC itself, with no id-based filter
 * this function could apply client-side, so there is nothing here to thread through. */
export async function listMyPendingInvitations(): Promise<PendingInvitationForUser[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<PendingInvitationRow>(client, "public.list_my_pending_invitations"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapPendingInvitationRow);
}

/** The organization's own free-text description -- a real, minimal identity field
 * (202609220001), read by any active member (same "members read organization roster"
 * visibility tier the rest of Settings already uses). Null both when never set and when
 * the organization doesn't exist/isn't visible to this actor -- identical, honest
 * degradation, no distinguishing existence-leak. */
export async function getOrganizationDescription(organizationId: string): Promise<string | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<{ description: string | null }>("select description from public.organizations where id = $1", [organizationId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.description ?? null;
}

/** Owner/security_admin only -- enforced inside update_organization_description itself
 * (private.has_org_role), not re-checked here; this function trusts the RPC to be the
 * one real authorization boundary, the same pattern every other org-admin mutation in
 * this service layer already follows. */
export async function updateOrganizationDescription(organizationId: string, description: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.update_organization_description", [organizationId, description]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

type SettingsRow = {
  default_language: OrganizationSettings["defaultLanguage"]; time_zone: string; date_format: OrganizationSettings["dateFormat"]; currency: "USD" | "INR";
  business_hours_start: string; business_hours_end: string; support_email: string | null; country: string | null; working_days: number[];
  default_visibility: "public" | "private"; default_first_response_hours: number; default_triage_hours: number; default_resolution_days: number;
  default_reward_currency: "USD" | "INR"; default_safe_harbor: boolean; default_disclosure_days: number; default_hall_of_fame: boolean;
  updated_by: string | null; updated_at: string | Date;
};

function mapSettings(r: SettingsRow, updatedByName: string | null): OrganizationSettingsRecord {
  return {
    defaultLanguage: r.default_language, timeZone: r.time_zone, dateFormat: r.date_format, currency: r.currency,
    businessHoursStart: r.business_hours_start.slice(0, 5), businessHoursEnd: r.business_hours_end.slice(0, 5),
    supportEmail: r.support_email ?? "", country: r.country ?? "", workingDays: r.working_days.map(Number),
    defaultVisibility: r.default_visibility, defaultFirstResponseHours: r.default_first_response_hours, defaultTriageHours: r.default_triage_hours,
    defaultResolutionDays: r.default_resolution_days, defaultRewardCurrency: r.default_reward_currency, defaultSafeHarbor: r.default_safe_harbor,
    defaultDisclosureDays: r.default_disclosure_days, defaultHallOfFame: r.default_hall_of_fame,
    updatedAt: r.updated_by ? new Date(r.updated_at).toISOString() : null, updatedByName,
  };
}

/** Any active member; the row is created with platform defaults on first read. */
export async function getOrganizationSettings(organizationId: string): Promise<OrganizationSettingsRecord> {
  const actor = await getCurrentUser();
  let result;
  try {
    result = await withActorTransaction(actor?.id ?? null, async (client) => {
      const [row] = await callRpc<SettingsRow>(client, "public.get_organization_settings", [organizationId]);
      const name = row.updated_by ? (await client.query<{ display_name: string }>("select display_name from public.users where id = $1", [row.updated_by])).rows[0]?.display_name ?? null : null;
      return mapSettings(row, name);
    });
  } catch (error) {
    mapError(error as { message: string });
  }
  return result;
}

/** Owner/security_admin only, enforced inside update_organization_settings. */
export async function updateOrganizationSettings(organizationId: string, settings: OrganizationSettings): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.update_organization_settings", [organizationId, JSON.stringify(toSettingsPayload(settings))]));
  } catch (error) {
    mapError(error as { message: string });
  }
}
