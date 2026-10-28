import { SAML, ValidateInResponseTo, type CacheProvider, type Profile } from "@node-saml/node-saml";
import { withServiceRoleTransaction } from "@/lib/db/pool";

// SAML 2.0 service provider for one organization's connection (202610290006). Signature,
// audience, destination, validity window and InResponseTo are checked by @node-saml/node-saml;
// request ids live in the database (sso_auth_requests) so any server instance can validate the
// response, and every accepted assertion id is recorded so it can't be replayed.

export type SsoConnectionRow = { id: string; organization_id: string; idp_entity_id: string; idp_sso_url: string; idp_certificate: string };

export function spUrls(origin: string, connectionId: string) {
  const base = `${origin.replace(/\/$/, "")}/api/sso/saml/${connectionId}`;
  return { entityId: `${base}/metadata`, acsUrl: `${base}/acs`, metadataUrl: `${base}/metadata` };
}

function dbCache(connectionId: string): CacheProvider {
  return {
    async saveAsync(key, value) {
      await withServiceRoleTransaction((c) => c.query("insert into public.sso_auth_requests (request_id, connection_id) values ($1, $2) on conflict do nothing", [key, connectionId]));
      return { value, createdAt: Date.now() };
    },
    async getAsync(key) {
      const r = await withServiceRoleTransaction((c) =>
        c.query<{ request_id: string }>("select request_id from public.sso_auth_requests where request_id = $1 and connection_id = $2 and created_at > now() - interval '10 minutes'", [key, connectionId]).then((x) => x.rows[0]),
      );
      return r ? r.request_id : null;
    },
    async removeAsync(key) {
      if (!key) return null;
      await withServiceRoleTransaction((c) => c.query("delete from public.sso_auth_requests where request_id = $1", [key]));
      return key;
    },
  };
}

/** cache: the database-backed request store in production; tests pass an in-memory one. */
export function samlFor(conn: SsoConnectionRow, origin: string, cache: CacheProvider = dbCache(conn.id)): SAML {
  const urls = spUrls(origin, conn.id);
  return new SAML({
    entryPoint: conn.idp_sso_url,
    issuer: urls.entityId,
    callbackUrl: urls.acsUrl,
    audience: urls.entityId,
    idpCert: conn.idp_certificate,
    idpIssuer: conn.idp_entity_id,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: 10 * 60_000,
    cacheProvider: cache,
    acceptedClockSkewMs: 120_000,
    maxAssertionAgeMs: 10 * 60_000,
    signatureAlgorithm: "sha256",
    digestAlgorithm: "sha256",
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    disableRequestedAuthnContext: true,
  });
}

/** The email the IdP asserted: an email attribute, or an email-formatted NameID. */
export function profileEmail(p: Profile): string | null {
  const candidates = [p.email, p.mail, p["urn:oid:0.9.2342.19200300.100.1.3"], p["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"], p.nameID];
  const found = candidates.find((v): v is string => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v));
  return found ? found.toLowerCase() : null;
}

export function profileValues(p: Profile, attribute: string | null): string[] {
  if (!attribute) return [];
  const v = p[attribute];
  return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");
}

export function assertionId(p: Profile): string | null {
  const id = (p.ID as string | undefined) ?? (p.getAssertion?.() as { Assertion?: { $?: { ID?: string } } } | undefined)?.Assertion?.$?.ID;
  return typeof id === "string" && id.length <= 200 ? id : null;
}
