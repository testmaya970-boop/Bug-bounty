import { NextResponse } from "next/server";
import { completePayoutConnection } from "@/services/payout-connections";

// Where PayPal / Stripe send the researcher back after their consent page. The one-time state
// is checked against a pending connection this signed-in researcher started; the result is shown
// on Rewards & Payments (/settings/payments).
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const back = new URL("/settings/payments", process.env.APP_ORIGIN ?? url.origin);
  if (provider !== "paypal" && provider !== "stripe") return NextResponse.redirect(back);
  const result = await completePayoutConnection(provider, url.searchParams);
  if (result.ok) back.searchParams.set("connected", provider);
  else back.searchParams.set("connect_error", result.reason);
  return NextResponse.redirect(back);
}
