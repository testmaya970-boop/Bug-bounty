import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SignedXml } from "xml-crypto";
import type { CacheProvider } from "@node-saml/node-saml";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({ withServiceRoleTransaction: vi.fn() }));
const { samlFor, profileEmail, profileValues, assertionId, spUrls } = await import("../../lib/auth/saml");

// Real signed SAML responses from a throwaway identity provider, through the exact SP
// configuration production uses (lib/auth/saml.ts). Every forged or replayed variant must fail.

const ORIGIN = "https://app.unpatched.test";
const CONN = { id: "11111111-1111-4111-8111-111111111111", organization_id: "o", idp_entity_id: "https://idp.acme.test", idp_sso_url: "https://idp.acme.test/sso", idp_certificate: "" };

function keyPair(dir: string, name: string) {
  const key = path.join(dir, `${name}.key`);
  const cert = path.join(dir, `${name}.crt`);
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=test-idp"], { stdio: "ignore" });
  return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8") };
}

function memoryCache(): CacheProvider & { keys: string[] } {
  const m = new Map<string, string>();
  return {
    get keys() {
      return [...m.keys()];
    },
    async saveAsync(k, v) {
      m.set(k, v);
      return { value: v, createdAt: Date.now() };
    },
    async getAsync(k) {
      return m.get(k) ?? null;
    },
    async removeAsync(k) {
      if (k) m.delete(k);
      return k;
    },
  };
}

function response(o: { requestId: string; audience: string; email: string; notOnOrAfter?: Date; assertionId?: string }) {
  const now = new Date();
  const later = o.notOnOrAfter ?? new Date(now.getTime() + 5 * 60_000);
  const before = new Date(now.getTime() - 60_000);
  const { acsUrl } = spUrls(ORIGIN, CONN.id);
  const aid = o.assertionId ?? `_a${Math.random().toString(16).slice(2)}`;
  return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${Math.random().toString(16).slice(2)}" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${acsUrl}" InResponseTo="${o.requestId}"><saml:Issuer>${CONN.idp_entity_id}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="${aid}" Version="2.0" IssueInstant="${now.toISOString()}"><saml:Issuer>${CONN.idp_entity_id}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${o.email}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${o.requestId}" NotOnOrAfter="${later.toISOString()}" Recipient="${acsUrl}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before.toISOString()}" NotOnOrAfter="${later.toISOString()}"><saml:AudienceRestriction><saml:Audience>${o.audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="groups"><saml:AttributeValue>sec-team</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>`;
}

function sign(xml: string, key: string): string {
  const sig = new SignedXml({ privateKey: key, canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#", signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" });
  sig.addReference({ xpath: "//*[local-name(.)='Assertion']", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"], digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256" });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" } });
  return sig.getSignedXml();
}

const post = (xml: string) => ({ SAMLResponse: Buffer.from(xml).toString("base64") });

describe("SAML sign-in", () => {
  let idp: { key: string; cert: string };
  let rogue: { key: string; cert: string };
  beforeAll(() => {
    const dir = mkdtempSync(path.join(tmpdir(), "saml-"));
    idp = keyPair(dir, "idp");
    rogue = keyPair(dir, "rogue");
  });

  async function freshRequest() {
    const cache = memoryCache();
    const saml = samlFor({ ...CONN, idp_certificate: idp.cert }, ORIGIN, cache);
    const url = await saml.getAuthorizeUrlAsync("", undefined, {});
    expect(url.startsWith(CONN.idp_sso_url)).toBe(true);
    return { saml, requestId: cache.keys[0] };
  }

  it("accepts a signed response to our own request, and reads the email, groups and assertion id", async () => {
    const { saml, requestId } = await freshRequest();
    const { profile } = await saml.validatePostResponseAsync(post(sign(response({ requestId, audience: spUrls(ORIGIN, CONN.id).entityId, email: "Alice@Acme.com", assertionId: "_fixed" }), idp.key)));
    expect(profileEmail(profile!)).toBe("alice@acme.com");
    expect(profileValues(profile!, "groups")).toEqual(["sec-team"]);
    expect(assertionId(profile!)).toBe("_fixed");
  });

  it("refuses an assertion edited after signing (e.g. a different email)", async () => {
    const { saml, requestId } = await freshRequest();
    const signed = sign(response({ requestId, audience: spUrls(ORIGIN, CONN.id).entityId, email: "alice@acme.com" }), idp.key).replace("alice@acme.com", "ceo@acme.com");
    await expect(saml.validatePostResponseAsync(post(signed))).rejects.toThrow();
  });

  it("refuses another audience, an unsolicited response, a different signing key, and no signature", async () => {
    const aud = spUrls(ORIGIN, CONN.id).entityId;
    let r = await freshRequest();
    await expect(r.saml.validatePostResponseAsync(post(sign(response({ requestId: r.requestId, audience: "https://other-sp.example", email: "a@acme.com" }), idp.key)))).rejects.toThrow();
    r = await freshRequest();
    await expect(r.saml.validatePostResponseAsync(post(sign(response({ requestId: "_never_asked", audience: aud, email: "a@acme.com" }), idp.key)))).rejects.toThrow();
    r = await freshRequest();
    await expect(r.saml.validatePostResponseAsync(post(sign(response({ requestId: r.requestId, audience: aud, email: "a@acme.com" }), rogue.key)))).rejects.toThrow();
    r = await freshRequest();
    await expect(r.saml.validatePostResponseAsync(post(response({ requestId: r.requestId, audience: aud, email: "a@acme.com" })))).rejects.toThrow();
  });

  it("a response can't be used twice, and an expired one is refused", async () => {
    const aud = spUrls(ORIGIN, CONN.id).entityId;
    const { saml, requestId } = await freshRequest();
    const signed = sign(response({ requestId, audience: aud, email: "a@acme.com" }), idp.key);
    await saml.validatePostResponseAsync(post(signed));
    await expect(saml.validatePostResponseAsync(post(signed))).rejects.toThrow(); // the request id was consumed
    const r = await freshRequest();
    const expired = sign(response({ requestId: r.requestId, audience: aud, email: "a@acme.com", notOnOrAfter: new Date(Date.now() - 10 * 60_000) }), idp.key);
    await expect(r.saml.validatePostResponseAsync(post(expired))).rejects.toThrow();
  });
});
