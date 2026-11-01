import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// Collusion signals (202610220001): researchers who signed in from the same network as an
// active member of an organization that awarded them. A signal for a person to look at before
// paying, never an automatic block: shared offices, VPNs and universities are innocent causes.

export type CollusionSignal = {
  researcherId: string;
  researcherName: string;
  researcherEmail: string | null;
  organizationId: string;
  organizationName: string;
  sharedNetworks: number;
  lastShared: string;
  awards: number;
  awardedMinorUnits: number;
  currency: string;
};

export async function listCollusionSignalsForAdmin(): Promise<CollusionSignal[]> {
  const actor = await getCurrentUser();
  type Row = { researcher_id: string; researcher_name: string; researcher_email: string | null; organization_id: string; organization_name: string; shared_networks: number; last_shared: Date; awards: number; awarded_minor_units: string; currency: string };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Row>(client, "public.list_collusion_signals_for_admin"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((r) => ({
    researcherId: r.researcher_id,
    researcherName: r.researcher_name,
    researcherEmail: r.researcher_email,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    sharedNetworks: r.shared_networks,
    lastShared: new Date(r.last_shared).toISOString(),
    awards: r.awards,
    awardedMinorUnits: Number(r.awarded_minor_units),
    currency: r.currency,
  }));
}
