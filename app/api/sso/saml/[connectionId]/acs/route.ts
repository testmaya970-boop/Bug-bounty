import { NextResponse, type NextRequest } from "next/server";
import { completeSsoLogin } from "@/services/sso";

// The SAML Assertion Consumer Service (HTTP-POST binding). The identity provider's signed
// response is the only credential; services/sso.ts validates it (signature, audience,
// InResponseTo, replay) before anything else happens.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const fail = (message: string) => {
    const back = new URL("/sign-in/sso", origin);
    back.searchParams.set("sso_error", message);
    return NextResponse.redirect(back, 303);
  };
  if (!UUID.test(connectionId)) return fail("Unknown single sign-on connection.");
  const form = await request.formData().catch(() => null);
  const samlResponse = form?.get("SAMLResponse");
  if (typeof samlResponse !== "string" || samlResponse.length > 512 * 1024) return fail("The identity provider sent no sign-in response.");
  const result = await completeSsoLogin(connectionId, { SAMLResponse: samlResponse });
  if ("error" in result) return fail(result.error);
  return NextResponse.redirect(new URL(`/organizations/${result.organizationId}`, origin), 303);
}
