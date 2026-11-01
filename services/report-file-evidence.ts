import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { evidenceObjectStore } from "@/lib/evidence-store";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";

export { OrganizationServiceError };


// Uploads: services/evidence-uploads.ts (direct-to-storage, verified before attaching).

/**
 * Download authorization: the caller's own session-scoped read is the real decision --
 * report_evidence's existing RLS policy (researcher_visible + own report, or org
 * oversight/program membership) governs whether this row comes back at all. A denied or
 * nonexistent evidence id is indistinguishable (null), the same confidentiality-safe
 * shape every other read in this codebase uses. Only after that succeeds is a short-lived
 * signed URL minted -- no storage credential or permanent path ever reaches the browser.
 * See docs/decisions/0011.
 */
export async function getEvidenceDownloadUrl(evidenceId: string): Promise<string | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<{ object_key: string | null; original_filename: string | null; evidence_type: string }>(
          "select object_key, original_filename, evidence_type from public.report_evidence where id = $1",
          [evidenceId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const data = rows[0];
  if (!data || data.evidence_type !== "file" || !data.object_key || !data.original_filename) return null;

  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.record_evidence_download", [evidenceId]));
  } catch (error) {
    mapError(error as { message: string });
  }

  return evidenceObjectStore.getSignedDownloadUrl(data.object_key, data.original_filename);
}
