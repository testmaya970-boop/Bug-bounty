import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

/** A real, persisted submission (public.researcher_feedback) -- no response/ticketing
 * workflow exists yet; this is a real inbox for a human to read later, not a fake
 * "thanks!" over nothing. See docs/decisions/0055. */
export async function submitMyFeedback(message: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.submit_my_feedback", [message]));
  } catch (error) {
    mapError(error as { message: string });
  }
}
