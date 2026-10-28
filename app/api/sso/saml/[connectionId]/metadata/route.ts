import { NextResponse } from "next/server";
import { generateServiceProviderMetadata } from "@node-saml/node-saml";
import { ssoUrls } from "@/services/sso";

// Service provider metadata for the organization's identity provider: entity id and ACS URL.
// Public by nature (it is what the IdP admin imports); contains no secrets.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  if (!UUID.test(connectionId)) return new NextResponse(null, { status: 404 });
  const urls = ssoUrls(connectionId);
  const xml = generateServiceProviderMetadata({
    issuer: urls.entityId,
    callbackUrl: urls.acsUrl,
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    wantAssertionsSigned: true,
  });
  return new NextResponse(xml, { headers: { "content-type": "application/samlmetadata+xml; charset=utf-8" } });
}
