import { NextResponse, type NextRequest } from "next/server";
import { logIntegrationEvent } from "@/lib/integrations/common";
import { cardProviderByName } from "@/lib/integrations/card";
import { readBodyWithin } from "@/lib/read-body";
import { completeCardDeposit } from "@/services/billing";

// Card top-up results (Razorpay Payment Links / Stripe Checkout). Only a verified provider
// signature confirms a card deposit; retries are harmless (complete_card_deposit: first verdict wins).
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: name } = await params;
  const provider = cardProviderByName(name);
  if (!provider) return new NextResponse("Unknown provider", { status: 404 });

  const raw = await readBodyWithin(request, 256 * 1024);
  if (raw === null) return new NextResponse(null, { status: 413 });
  let result;
  try {
    result = await provider.parseWebhook(raw.toString("utf8"), request.headers);
  } catch (error) {
    await logIntegrationEvent("cards", name, "webhook", "rejected", error instanceof Error ? error.message : "bad request");
    return new NextResponse("Invalid signature", { status: 400 });
  }
  if (!result) return NextResponse.json({ ok: true, ignored: true });

  try {
    await completeCardDeposit(result.reference, result.outcome, result.detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logIntegrationEvent("cards", name, "webhook", "error", message);
    return message.startsWith("DEPOSIT_NOT_FOUND") ? NextResponse.json({ ok: true, ignored: true }) : new NextResponse("Retry later", { status: 500 });
  }
  await logIntegrationEvent("cards", name, "webhook", "ok", result.outcome);
  return NextResponse.json({ ok: true });
}
