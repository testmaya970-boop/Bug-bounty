"use server";

import { revalidatePath } from "next/cache";
import { OrganizationServiceError } from "@/services/rpc-error";
import { disconnectPayoutConnection, startPayoutConnection } from "@/services/payout-connections";

type Result = { ok: true; url?: string } | { ok: false; message: string };
const valid = (p: string): p is "paypal" | "stripe" => p === "paypal" || p === "stripe";

/** Returns the provider's consent page URL; the browser goes there. */
export async function startPayoutConnectionAction(provider: string): Promise<Result> {
  if (!valid(provider)) return { ok: false, message: "Choose PayPal or Stripe." };
  try {
    return { ok: true, url: await startPayoutConnection(provider) };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function disconnectPayoutConnectionAction(provider: string): Promise<Result> {
  if (!valid(provider)) return { ok: false, message: "Choose PayPal or Stripe." };
  try {
    await disconnectPayoutConnection(provider);
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/settings/payments");
  return { ok: true };
}
