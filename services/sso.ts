import "server-only";
import { createHash, randomBytes, timingSafeEqual, X509Certificate } from "node:crypto";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNativeEnv } from "@/lib/env";
import { hashPassword } from "@/lib/auth/password";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { establishSessionForUser } from "@/services/auth";
import { assertionId, profileEmail, profileValues, samlFor, spUrls, type SsoConnectionRow } from "@/lib/auth/saml";
import type { OrganizationRole } from "@/types/auth";

// SAML single sign-on and SCIM provisioning (202610290006/0007). Who may sign in or be
// provisioned is decided by the database (verified domains, account type, owner protection);
// this file validates the SAML response and the SCIM token, and creates accounts when needed.

export type SsoConnection = { id: string; status: "draft" | "active"; idpEntityId: string; idpSsoUrl: string; enforced: boolean; allowJit: boolean; defaultRole: OrganizationRole; roleAttribute: string | null; roleMappings: Record<string, string>; scimTokenLast4: string | null };

const origin = () => getNativeEnv().APP_ORIGIN.replace(/\/$/, "");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  try {
    return await withActorTransaction(actor.id, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

export function ssoUrls(connectionId: string) {
  return { ...spUrls(origin(), connectionId), scimBase: `${origin()}/api/scim/v2/${connectionId}` };
}

// Admin ------------------------------------------------------------------------------------------
export async function getSsoConnection(organizationId: string): Promise<SsoConnection | null> {
  type Row = { id: string; status: SsoConnection["status"]; idp_entity_id: string; idp_sso_url: string; enforced: boolean; allow_jit: boolean; default_role: OrganizationRole; role_attribute: string | null; role_mappings: Record<string, string>; scim_token_last4: string | null };
  const r = await asActor((c) =>
    c.query<Row>("select id, status, idp_entity_id, idp_sso_url, enforced, allow_jit, default_role, role_attribute, role_mappings, scim_token_last4 from public.sso_connections where organization_id = $1", [organizationId]).then((x) => x.rows[0]),
  );
  return r ? { id: r.id, status: r.status, idpEntityId: r.idp_entity_id, idpSsoUrl: r.idp_sso_url, enforced: r.enforced, allowJit: r.allow_jit, defaultRole: r.default_role, roleAttribute: r.role_attribute, roleMappings: r.role_mappings, scimTokenLast4: r.scim_token_last4 } : null;
}

export type SsoInput = { idpEntityId: string; idpSsoUrl: string; idpCertificate: string; allowJit: boolean; defaultRole: OrganizationRole; roleAttribute: string; roleMappings: Record<string, string> };

export async function saveSsoConnection(organizationId: string, input: SsoInput): Promise<void> {
  const pem = input.idpCertificate.includes("BEGIN CERTIFICATE") ? input.idpCertificate.trim() : `-----BEGIN CERTIFICATE-----\n${input.idpCertificate.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----`;
  try {
    const cert = new X509Certificate(pem);
    if (new Date(cert.validTo) < new Date()) throw new OrganizationServiceError("That signing certificate has expired. Download the current one from your identity provider.", "INVALID_CERT");
  } catch (error) {
    if (error instanceof OrganizationServiceError) throw error;
    throw new OrganizationServiceError("That isn't a valid X.509 signing certificate.", "INVALID_CERT");
  }
  if (!/^https:\/\//.test(input.idpSsoUrl.trim())) throw new OrganizationServiceError("The sign-in URL must start with https://.", "INVALID_INPUT");
  await asActor((c) => callRpc(c, "public.save_sso_connection", [organizationId, input.idpEntityId, input.idpSsoUrl, pem, input.allowJit, input.defaultRole, input.roleAttribute, JSON.stringify(input.roleMappings)]));
}

export async function setSsoState(organizationId: string, active: boolean, enforced: boolean): Promise<void> {
  await asActor((c) => callRpc(c, "public.set_sso_state", [organizationId, active, enforced]));
}

export async function deleteSsoConnection(organizationId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.delete_sso_connection", [organizationId]));
}

/** A new SCIM bearer token, shown once; only its hash is stored. */
export async function rotateScimToken(organizationId: string): Promise<string> {
  const token = `scim_${randomBytes(32).toString("base64url")}`;
  await asActor((c) => callRpc(c, "public.set_scim_token", [organizationId, sha256(token), token.slice(-4)]));
  return token;
}

// SAML sign-in ---------------------------------------------------------------------------------------
async function connectionRow(connectionId: string): Promise<(SsoConnectionRow & { status: string; allow_jit: boolean; role_attribute: string | null; role_mappings: Record<string, string> }) | null> {
  return withServiceRoleTransaction((c) =>
    c.query("select id, organization_id, idp_entity_id, idp_sso_url, idp_certificate, status, allow_jit, role_attribute, role_mappings from public.sso_connections where id = $1", [connectionId]).then((r) => r.rows[0] ?? null),
  );
}

/** Where to send someone who chose "Sign in with SSO": their organization's IdP, found through the
 * verified domain of their email. Null when no active connection covers it. */
export async function ssoRedirectForEmail(email: string): Promise<string | null> {
  const [hit] = await withServiceRoleTransaction((c) => callRpc<{ connection_id: string }>(c, "private.sso_connection_for_email", [email.trim().toLowerCase()]));
  if (!hit) return null;
  const conn = await connectionRow(hit.connection_id);
  if (!conn || conn.status !== "active") return null;
  return samlFor(conn, origin()).getAuthorizeUrlAsync("", undefined, {});
}

const SSO_MESSAGES: Record<string, string> = {
  SSO_DOMAIN: "That email isn't on a domain this organization has verified.",
  SSO_RESEARCHER_ACCOUNT: "That email belongs to a researcher account. Researcher and organization accounts are kept separate.",
  SSO_DEACTIVATED: "That account is deactivated. Contact support.",
  SSO_SUSPENDED: "Your access to this organization is suspended.",
  SSO_NOT_MEMBER: "Ask an admin to add you to the organization first.",
  SSO_NO_ACCOUNT: "There is no account for you yet. Ask an admin to add you.",
};

/** The ACS: validate the response, refuse replays, find or create the person, start a session.
 * Returns the organization to land in, or a reason it failed. */
export async function completeSsoLogin(connectionId: string, form: Record<string, string>): Promise<{ organizationId: string } | { error: string }> {
  const conn = await connectionRow(connectionId);
  if (!conn || conn.status !== "active") return { error: "Single sign-on isn't active for this organization." };
  let profile;
  try {
    ({ profile } = await samlFor(conn, origin()).validatePostResponseAsync(form));
  } catch {
    return { error: "The sign-in response from your identity provider could not be verified." };
  }
  if (!profile) return { error: "The identity provider did not sign you in." };
  const id = assertionId(profile);
  if (!id) return { error: "The sign-in response has no assertion id." };
  const fresh = await withServiceRoleTransaction((c) =>
    c.query("insert into public.sso_assertion_replay (assertion_id, connection_id, expires_at) values ($1, $2, now() + interval '1 day') on conflict do nothing returning assertion_id", [id, connectionId]).then((r) => (r.rowCount ?? 0) > 0),
  );
  if (!fresh) return { error: "That sign-in response was already used." };
  const email = profileEmail(profile);
  if (!email) return { error: "The identity provider did not send an email address." };

  const groups = profileValues(profile, conn.role_attribute);
  const mapped = groups.map((g) => conn.role_mappings[g]).find((r): r is string => typeof r === "string") ?? null;
  const displayName = [profile.firstName, profile.lastName].filter((x): x is string => typeof x === "string").join(" ") || null;
  try {
    const userId = await provision(connectionId, email, profile.nameID, displayName, mapped, conn.allow_jit, "saml");
    await establishSessionForUser(userId);
    return { organizationId: conn.organization_id };
  } catch (error) {
    const code = error instanceof Error ? /^([A-Z_]+):/.exec(error.message)?.[1] : undefined;
    return { error: (code && SSO_MESSAGES[code]) ?? "You couldn't be signed in. Contact your organization's admin." };
  }
}

/** Creates the account first when none exists and the connection allows it; the database then
 * links it, checks the verified domain and account type, and sets up membership. */
async function provision(connectionId: string, email: string, nameId: string | null, displayName: string | null, mappedRole: string | null, allowCreate: boolean, via: "saml" | "scim"): Promise<string> {
  const existing = await withServiceRoleTransaction((c) => c.query<{ id: string }>("select id from public.users where email = $1", [email]).then((r) => r.rows[0]));
  let newUser: string | null = null;
  if (!existing && allowCreate) {
    // An unknowable password: this person signs in through their identity provider.
    const hash = await hashPassword(randomBytes(32).toString("hex"));
    const create = (name: string | null) =>
      withServiceRoleTransaction(async (c) => {
        const { rows } = await c.query<{ id: string }>("select id from public.create_user($1, $2, $3, null)", [email, hash, name]);
        await c.query("update public.users set account_type = 'organization', email_verified_at = now() where id = $1", [rows[0].id]);
        return rows[0].id;
      });
    try {
      newUser = await create(displayName);
    } catch (error) {
      // Two people at one company can share a name; display names are unique, so fall back to
      // the default (the email's local part) rather than refuse the person.
      if (!(error instanceof Error && error.message.startsWith("DISPLAY_NAME_TAKEN"))) throw error;
      newUser = await create(null);
    }
  }
  const [row] = await withServiceRoleTransaction((c) =>
    callRpc<{ sso_provision_member: string }>(c, "private.sso_provision_member", [connectionId, email, nameId, displayName, mappedRole, newUser, via]),
  );
  return row.sso_provision_member;
}

// SCIM ------------------------------------------------------------------------------------------------
export async function scimConnection(connectionId: string, authorization: string | null): Promise<{ id: string; organizationId: string; allowJit: boolean } | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const row = await withServiceRoleTransaction((c) =>
    c.query<{ id: string; organization_id: string; scim_token_hash: string | null; allow_jit: boolean }>("select id, organization_id, scim_token_hash, allow_jit from public.sso_connections where id = $1", [connectionId]).then((r) => r.rows[0]),
  ).catch(() => undefined);
  const expected = Buffer.from(row?.scim_token_hash ?? "0".repeat(64));
  const got = Buffer.from(sha256(token || "-"));
  if (!row?.scim_token_hash || !token || !timingSafeEqual(expected, got)) return null;
  return { id: row.id, organizationId: row.organization_id, allowJit: row.allow_jit };
}

export type ScimUser = { id: string; email: string; displayName: string; active: boolean; role: string };

export async function scimListUsers(organizationId: string, emailFilter: string | null, startIndex: number, count: number): Promise<{ total: number; users: ScimUser[] }> {
  return withServiceRoleTransaction(async (c) => {
    const where = "m.organization_id = $1 and m.status <> 'removed'" + (emailFilter ? " and u.email = $2" : "");
    const args: unknown[] = emailFilter ? [organizationId, emailFilter.toLowerCase()] : [organizationId];
    const total = Number((await c.query<{ n: string }>(`select count(*) as n from public.organization_members m join public.users u on u.id = m.user_id where ${where}`, args)).rows[0].n);
    const { rows } = await c.query<{ id: string; email: string; display_name: string; status: string; role: string }>(
      `select u.id, u.email, u.display_name, m.status, m.role from public.organization_members m join public.users u on u.id = m.user_id where ${where} order by u.email offset ${Math.max(startIndex - 1, 0)} limit ${Math.min(Math.max(count, 0), 200)}`,
      args,
    );
    return { total, users: rows.map((r) => ({ id: r.id, email: r.email, displayName: r.display_name, active: r.status === "active", role: r.role })) };
  });
}

export async function scimGetUser(organizationId: string, userId: string): Promise<ScimUser | null> {
  const { users } = await withServiceRoleTransaction(async (c) => {
    const { rows } = await c.query<{ id: string; email: string; display_name: string; status: string; role: string }>(
      "select u.id, u.email, u.display_name, m.status, m.role from public.organization_members m join public.users u on u.id = m.user_id where m.organization_id = $1 and u.id = $2 and m.status <> 'removed'",
      [organizationId, userId],
    );
    return { users: rows.map((r) => ({ id: r.id, email: r.email, displayName: r.display_name, active: r.status === "active", role: r.role })) };
  });
  return users[0] ?? null;
}

/** SCIM create: always allowed to create the account (the IdP admin is provisioning on purpose). */
export async function scimCreateUser(connectionId: string, email: string, displayName: string | null, active: boolean): Promise<string> {
  const userId = await provision(connectionId, email.toLowerCase(), null, displayName, null, true, "scim");
  if (!active) await scimSetActive(connectionId, userId, false);
  return userId;
}

export async function scimSetActive(connectionId: string, userId: string, active: boolean): Promise<void> {
  await withServiceRoleTransaction((c) => callRpc(c, "private.scim_set_active", [connectionId, userId, active]));
}

export async function scimRename(organizationId: string, userId: string, displayName: string): Promise<void> {
  await withServiceRoleTransaction((c) =>
    c.query("update public.users u set display_name = left($3, 120), updated_at = now() from public.organization_members m where m.user_id = u.id and m.organization_id = $1 and u.id = $2 and u.account_type = 'organization'", [organizationId, userId, displayName]),
  );
}
