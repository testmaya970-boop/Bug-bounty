import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";

export { OrganizationServiceError };

/** Hai (Turn 6/phase-9-ia, item 15): a real, persisted waitlist signup (public.
 * hai_waitlist_entries) -- no chat interface exists, and this deliberately does not
 * pretend one does. Idempotent per user: joining twice returns false the second time
 * (the RPC's own `on conflict do nothing`), never a duplicate row or a thrown error. */
export async function joinHaiWaitlist(): Promise<boolean> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ join_hai_waitlist: boolean }>(client, "public.join_hai_waitlist", []));
    return rows[0]?.join_hai_waitlist ?? false;
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function amIOnHaiWaitlist(): Promise<boolean> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ am_i_on_hai_waitlist: boolean }>(client, "public.am_i_on_hai_waitlist", []));
    return rows[0]?.am_i_on_hai_waitlist ?? false;
  } catch (error) {
    mapError(error as { message: string });
  }
}
