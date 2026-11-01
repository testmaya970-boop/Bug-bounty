import "server-only";
import { Resolver } from "node:dns/promises";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { txtRecordsContainToken } from "@/lib/domain-verification";

// Verified domains (202610260008): an organization proves it controls a domain before any of its
// hosts can authorize testing. Only the server marks a domain verified (record_domain_check is
// service_role only), and only after it performed the DNS lookup itself.

export type OrganizationDomain = {
  id: string;
  domain: string;
  token: string;
  status: "pending" | "verified";
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckError: string | null;
};

type Row = { id: string; domain: string; token: string; status: OrganizationDomain["status"]; verified_at: string | null; last_checked_at: string | null; last_check_error: string | null };
const map = (r: Row): OrganizationDomain => ({
  id: r.id,
  domain: r.domain,
  token: r.token,
  status: r.status,
  verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
  lastCheckedAt: r.last_checked_at ? new Date(r.last_checked_at).toISOString() : null,
  lastCheckError: r.last_check_error,
});

async function actorId(): Promise<string> {
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  return actor.id;
}

/** RLS: any active member of the organization can read its domains. */
export async function listOrganizationDomains(organizationId: string): Promise<OrganizationDomain[]> {
  const id = await actorId();
  const rows = await withActorTransaction(id, (c) =>
    c.query<Row>("select * from public.organization_domains where organization_id = $1 order by domain", [organizationId]).then((r) => r.rows),
  );
  return rows.map(map);
}

export async function addOrganizationDomain(organizationId: string, domain: string): Promise<OrganizationDomain> {
  const id = await actorId();
  try {
    const rows = await withActorTransaction(id, (c) => callRpc<Row>(c, "public.add_organization_domain", [organizationId, domain]));
    return map(rows[0]);
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function removeOrganizationDomain(domainId: string): Promise<void> {
  const id = await actorId();
  try {
    await withActorTransaction(id, (c) => callRpc(c, "public.remove_organization_domain", [domainId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

async function lookupTxt(name: string): Promise<{ records: string[][]; error: string | null }> {
  const resolver = new Resolver({ timeout: 4000, tries: 2 });
  try {
    return { records: await resolver.resolveTxt(name), error: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { records: [], error: code === "ENOTFOUND" || code === "ENODATA" ? "No TXT record found yet. DNS changes can take a few minutes to appear." : "The DNS lookup failed. Try again in a minute." };
  }
}

/** Authorize as the caller (owner/security admin), look the record up from the server, then
 * record the outcome as the service role. Returns the updated domain. */
export async function checkOrganizationDomain(domainId: string): Promise<OrganizationDomain> {
  const id = await actorId();
  let d: Row;
  try {
    d = (await withActorTransaction(id, (c) => callRpc<Row>(c, "public.get_domain_for_verification", [domainId])))[0];
  } catch (error) {
    mapError(error as { message: string });
  }
  if (d.status === "verified") return map(d);
  const { records, error } = await lookupTxt(`_unpatched-challenge.${d.domain}`);
  const found = txtRecordsContainToken(records, d.token);
  const rows = await withServiceRoleTransaction((c) =>
    callRpc<Row>(c, "public.record_domain_check", [domainId, found, found ? null : (error ?? "A TXT record exists but its value does not match. Copy the value exactly."), id]),
  );
  return map(rows[0]);
}
