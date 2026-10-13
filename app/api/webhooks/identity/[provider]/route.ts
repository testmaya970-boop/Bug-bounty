import { NextResponse, type NextRequest } from "next/server";
import { withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { logIntegrationEvent } from "@/lib/integrations/common";
import { identityProviderByName } from "@/lib/integrations/identity";
import { readBodyWithin } from "@/lib/read-body";

// Identity verification results (Persona / Cashfree). The provider's signature is the only
// authority: an unsigned or stale request changes nothing. Retries are harmless -- the first
// final result for a session wins (complete_identity_verification).
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: name } = await params;
  const provider = identityProviderByName(name);
  if (!provider) return new NextResponse("Unknown provider", { status: 404 });

  // Provider events are a few KB; never buffer an unbounded body before the signature check.
  const raw = await readBodyWithin(request, 256 * 1024);
  if (raw === null) return new NextResponse(null, { status: 413 });
  const rawBody = raw.toString("utf8");
  let result;
  try {
    result = await provider.parseWebhook(rawBody, request.headers);
  } catch (error) {
    await logIntegrationEvent("identity", name, "webhook", "rejected", error instanceof Error ? error.message : "bad request");
    return new NextResponse("Invalid signature", { status: 400 });
  }
  if (!result) return NextResponse.json({ ok: true, ignored: true });

  try {
    await withServiceRoleTransaction((client) => callRpc(client, "public.complete_identity_verification", [name, result.reference, result.status, result.reason ?? null]));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logIntegrationEvent("identity", name, "webhook", "error", message);
    // Unknown session: acknowledge so the provider stops retrying; anything else: retry later.
    return message.startsWith("NOT_FOUND") ? NextResponse.json({ ok: true, ignored: true }) : new NextResponse("Retry later", { status: 500 });
  }
  await logIntegrationEvent("identity", name, "webhook", "ok", result.status);
  return NextResponse.json({ ok: true });
}
