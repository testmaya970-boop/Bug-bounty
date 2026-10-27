import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// Contact requests (202610260009): organizations reach Unpatched before they have an account.
// Written by the server only; read and closed by platform staff.

export const CONTACT_TOPICS = {
  launch_program: "Launching a bug bounty or VDP",
  pricing: "Pricing and billing",
  security: "Security or a vulnerability in Unpatched",
  partnership: "Partnership",
  other: "Something else",
} as const;
export type ContactTopic = keyof typeof CONTACT_TOPICS;

export type ContactRequestInput = { name: string; email: string; company: string; website: string; topic: ContactTopic; message: string };

export type ContactRequest = ContactRequestInput & { id: string; status: "new" | "handled"; createdAt: string; handledAt: string | null };

/** clientKey is a hash of the caller's IP, so the rate limit never stores a raw address. */
export async function submitContactRequest(input: ContactRequestInput, clientKey: string): Promise<void> {
  try {
    await withServiceRoleTransaction((c) =>
      callRpc(c, "public.submit_contact_request", [input.name, input.email, input.company, input.website || null, input.topic, input.message, clientKey]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

type Row = { id: string; name: string; email: string; company: string; website: string | null; topic: ContactTopic; message: string; status: "new" | "handled"; created_at: string; handled_at: string | null };

export async function listContactRequests(): Promise<ContactRequest[]> {
  const actor = await getCurrentUser();
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (c) => callRpc<Row>(c, "public.list_contact_requests", [null]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, company: r.company, website: r.website ?? "", topic: r.topic, message: r.message, status: r.status, createdAt: new Date(r.created_at).toISOString(), handledAt: r.handled_at ? new Date(r.handled_at).toISOString() : null }));
}

export async function markContactRequestHandled(id: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (c) => callRpc(c, "public.mark_contact_request_handled", [id]));
  } catch (error) {
    mapError(error as { message: string });
  }
}
