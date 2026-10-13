import { NextResponse, type NextRequest } from "next/server";
import { withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { logIntegrationEvent } from "@/lib/integrations/common";
import { payoutProviderByName } from "@/lib/payment-provider";

// Payout results (RazorpayX / PayPal). Only a verified provider signature can mark a payout
// paid or failed; retries are harmless (record_provider_payment_result: first final result wins).
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: name } = await params;
  const provider = payoutProviderByName(name);
  if (!provider?.parseWebhook) return new NextResponse("Unknown provider", { status: 404 });

  const rawBody = await request.text();
  let result;
  try {
    result = await provider.parseWebhook(rawBody, request.headers);
  } catch (error) {
    await logIntegrationEvent("payments", name, "webhook", "rejected", error instanceof Error ? error.message : "bad request");
    return new NextResponse("Invalid signature", { status: 400 });
  }
  if (!result) return NextResponse.json({ ok: true, ignored: true });

  try {
    await withServiceRoleTransaction((client) =>
      callRpc(client, "public.record_provider_payment_result", [name, result.reference, result.outcome, result.failureCode ?? null, result.failureMessage ?? null]),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logIntegrationEvent("payments", name, "webhook", "error", message);
    return message.startsWith("ATTEMPT_NOT_FOUND") ? NextResponse.json({ ok: true, ignored: true }) : new NextResponse("Retry later", { status: 500 });
  }
  await logIntegrationEvent("payments", name, "webhook", "ok", result.outcome);
  return NextResponse.json({ ok: true });
}
