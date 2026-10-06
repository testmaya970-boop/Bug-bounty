import "server-only";
import { createHash } from "node:crypto";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { evidenceObjectStore, generateEvidenceObjectKey } from "@/lib/evidence-store";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportEvidence, ReportVisibility } from "@/types/report";

export { OrganizationServiceError };

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB -- see docs/decisions/0011-binary-evidence-storage.md

export type UploadInput = { filename: string; contentType: string; bytes: Uint8Array };

function validate(input: UploadInput) {
  const trimmedFilename = input.filename.trim();
  if (trimmedFilename.length === 0) throw new OrganizationServiceError("Choose a file to upload.", "INVALID_EVIDENCE");
  if (trimmedFilename.length > 255) throw new OrganizationServiceError("File name must be 255 characters or fewer.", "INVALID_EVIDENCE");
  if (input.bytes.byteLength === 0) throw new OrganizationServiceError("The selected file is empty.", "INVALID_EVIDENCE");
  if (input.bytes.byteLength > MAX_SIZE_BYTES) throw new OrganizationServiceError("File must be 10 MB or smaller.", "INVALID_EVIDENCE");
  if (input.contentType.length > 255) throw new OrganizationServiceError("The file type is not valid.", "INVALID_EVIDENCE");
}

type FileEvidenceRow = {
  id: string;
  report_id: string;
  author_id: string;
  author_context: ReportEvidence["authorContext"];
  visibility: ReportVisibility;
  evidence_type: ReportEvidence["evidenceType"];
  content: string | null;
  object_key: string | null;
  original_filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  created_at: string;
};

function mapFileEvidenceRow(row: FileEvidenceRow): ReportEvidence {
  return {
    id: row.id,
    reportId: row.report_id,
    authorId: row.author_id,
    authorName: "Unknown",
    authorContext: row.author_context,
    visibility: row.visibility,
    evidenceType: row.evidence_type,
    content: row.content,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

/**
 * Upload order is validate (cheap, local, no I/O) -> rate-limit (one network round trip,
 * but still zero storage I/O) -> bytes-then-row (see 0011 for the bytes-then-row half):
 * the rate-limit check happens BEFORE any storage I/O, via a dedicated RPC
 * (check_evidence_upload_rate_limit, docs/decisions/0019-public-onboarding-abuse-
 * hardening.md) rather than being folded into either finalize RPC -- those RPCs are only
 * ever reached AFTER the (expensive, 10 MiB-capable) storage write already happened, so
 * checking the limit there would reject a request only after the abuse it exists to
 * prevent had already occurred. Only once the limit check passes is the object written
 * to storage; the report_evidence row is only inserted if THAT succeeds, and is deleted
 * from storage (best-effort) if the subsequent RPC then fails -- an evidence row never
 * persists pointing at bytes that were never written, and a failed finalize never leaves
 * an unbounded orphan by design (only a rare, disclosed residual case does; see 0011).
 */
async function uploadAndFinalize(
  actorId: string | null,
  functionName: "public.add_researcher_file_evidence" | "public.add_organization_file_evidence",
  reportId: string,
  input: UploadInput,
  visibility?: ReportVisibility,
): Promise<ReportEvidence> {
  validate(input);

  // Before any storage write: the caller must at least be able to see the report (RLS on
  // public.reports). The finalize RPC below still makes the real add-evidence decision;
  // this only stops any signed-in user from writing bytes against an arbitrary report id.
  let allowedRows;
  let canSeeReport = false;
  try {
    allowedRows = await withActorTransaction(actorId, async (client) => {
      const visible = await client.query("select 1 from public.reports where id = $1", [reportId]);
      canSeeReport = (visible.rowCount ?? 0) > 0;
      return callRpc<{ check_evidence_upload_rate_limit: boolean }>(client, "public.check_evidence_upload_rate_limit");
    });
  } catch (error) {
    mapError(error as { message: string });
  }
  if (!canSeeReport) throw new OrganizationServiceError("Report not found.", "REPORT_NOT_FOUND");
  if (allowedRows[0]?.check_evidence_upload_rate_limit === false) throw new OrganizationServiceError("Too many uploads recently. Try again later.", "RATE_LIMITED");

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const objectKey = generateEvidenceObjectKey();

  await evidenceObjectStore.putObject(objectKey, input.bytes, input.contentType || "application/octet-stream");

  const args =
    functionName === "public.add_researcher_file_evidence"
      ? [reportId, objectKey, input.filename.trim(), input.contentType || "application/octet-stream", input.bytes.byteLength, sha256]
      : [reportId, objectKey, input.filename.trim(), input.contentType || "application/octet-stream", input.bytes.byteLength, sha256, visibility!];

  let rows;
  try {
    rows = await withActorTransaction(actorId, (client) => callRpc<FileEvidenceRow>(client, functionName, args));
  } catch (error) {
    try {
      await evidenceObjectStore.deleteObject(objectKey);
    } catch {
      // Best-effort only -- the residual orphan-cleanup strategy is documented in 0011,
      // not implemented as an automated job in this slice.
    }
    mapError(error as { message: string });
  }

  return mapFileEvidenceRow(rows[0]);
}

export async function addResearcherFileEvidence(reportId: string, input: UploadInput): Promise<ReportEvidence> {
  const actor = await getCurrentUser();
  return uploadAndFinalize(actor?.id ?? null, "public.add_researcher_file_evidence", reportId, input);
}

export async function addOrganizationFileEvidence(reportId: string, input: UploadInput, visibility: ReportVisibility): Promise<ReportEvidence> {
  const actor = await getCurrentUser();
  return uploadAndFinalize(actor?.id ?? null, "public.add_organization_file_evidence", reportId, input, visibility);
}

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
