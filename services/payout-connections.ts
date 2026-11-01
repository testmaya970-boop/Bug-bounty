export interface PayoutConnectOption {
  provider: "paypal" | "stripe";
  available: boolean;
  mode: "live" | "sandbox";
  connection: {
    status: "connected" | "failed" | "pending";
    accountLabel: string;
    failureReason: string | null;
  } | null;
}

export async function listMyPayoutConnectOptions(): Promise<
  PayoutConnectOption[]
> {
  return [
    {
      provider: "stripe",
      available: Boolean(process.env.STRIPE_CONNECT_CLIENT_ID),
      mode: "sandbox",
      connection: null,
    },
    {
      provider: "paypal",
      available: Boolean(process.env.PAYPAL_CLIENT_ID),
      mode: "sandbox",
      connection: null,
    },
  ];
}

export async function startPayoutConnection(
  _provider: "paypal" | "stripe",
): Promise<string> {
  return "/settings/payments";
}

export async function disconnectPayoutConnection(
  _provider: "paypal" | "stripe",
): Promise<void> {}

export async function completePayoutConnection(
  _provider: "paypal" | "stripe",
  searchParams: URLSearchParams,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const state = searchParams.get("state");
  const code = searchParams.get("code");
  if (!state || !code) {
    return {
      ok: false,
      reason: "Missing authorization parameters from provider.",
    };
  }
  return { ok: true };
}
