import { NextResponse } from "next/server";

// What this SCIM server supports, for identity providers that ask before syncing.
export function GET() {
  return NextResponse.json(
    {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", description: "Per-organization token from Unpatched, Integrations, Single sign-on.", primary: true }],
    },
    { headers: { "content-type": "application/scim+json" } },
  );
}
