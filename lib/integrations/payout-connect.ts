import "server-only";
import { sandboxAllowed } from "./common";

// Researchers connect a PayPal or Stripe account to receive payouts, through the provider's own
// consent page (202610280003). Chosen by env, like every other provider:
//   PAYOUT_CONNECT_PAYPAL = none | sandbox | paypal
//   PAYOUT_CONNECT_STRIPE = none | sandbox | stripe
//
// Flow: Unpatched creates a pending connection with a one-time state, sends the researcher to
// authorizeUrl(), the provider sends them back to <APP_ORIGIN>/api/payout-connect/<provider>/callback
// with that state, and completeCallback() turns the provider's answer into an account.
//
// The live adapters are the one piece left: PayPal "Log in with PayPal" (authorize URL, then
// exchange the code at /v1/oauth2/token and read /v1/identity/oauth2/userinfo for the payer id)
// and Stripe Connect (create an Express account, send the researcher to an Account Link, read
// the account back on return). Until they are filled in, only the sandbox can connect.

export type PayoutConnectProviderName = "paypal" | "stripe";
export type ConnectedAccount = { accountReference: string; accountLabel: string };

export type PayoutConnectProvider = {
  readonly name: PayoutConnectProviderName;
  readonly mode: "sandbox" | "live";
  /** Where to send the researcher: the provider's consent page, carrying `state` and coming back to callbackUrl. */
  authorizeUrl(input: { state: string; callbackUrl: string; origin: string }): string;
  /** Turns the provider's callback parameters into the connected account. Throws if they are not a success. */
  completeCallback(params: URLSearchParams): Promise<ConnectedAccount>;
};

function sandbox(name: PayoutConnectProviderName): PayoutConnectProvider {
  return {
    name,
    mode: "sandbox",
    authorizeUrl: ({ state, origin }) => `${origin}/settings/payments/connect-sandbox?provider=${name}&state=${encodeURIComponent(state)}`,
    async completeCallback(params) {
      if (params.get("outcome") !== "allow") throw new Error("You declined on the provider's page.");
      const account = (params.get("account") ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account) || account.length > 200) throw new Error("The provider did not return an account.");
      return { accountReference: `sandbox:${account}`, accountLabel: account };
    },
  };
}

/** PayPal "Log in with PayPal". Not wired yet: fill in authorizeUrl/completeCallback here. */
function paypalLive(): PayoutConnectProvider | null {
  return null;
}

/** Stripe Connect. Not wired yet: fill in authorizeUrl/completeCallback here. */
function stripeLive(): PayoutConnectProvider | null {
  return null;
}

export function payoutConnectProviderName(name: PayoutConnectProviderName, env: NodeJS.ProcessEnv = process.env): string {
  return (name === "paypal" ? env.PAYOUT_CONNECT_PAYPAL : env.PAYOUT_CONNECT_STRIPE)?.trim() || "none";
}

export function selectPayoutConnectProvider(name: PayoutConnectProviderName, env: NodeJS.ProcessEnv = process.env): PayoutConnectProvider | null {
  const configured = payoutConnectProviderName(name, env);
  if (configured === "sandbox") return sandboxAllowed(env) ? sandbox(name) : null;
  if (configured !== name) return null;
  return name === "paypal" ? paypalLive() : stripeLive();
}
