import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { evidenceLimits } from "@/lib/evidence-limits";
import { evidenceFileProblem, evidenceTypeFor, formatBytes } from "@/lib/evidence-policy";
import { evidenceObjectStore, evidenceObjectSize, getSignedEvidenceUploadUrl, inspectEvidenceObject } from "@/lib/evidence-store";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportVisibility } from "@/types/report";

/**
 * Every attachment, from the report composer (staged on a draft) or from an existing report's
 * thread (attached straight away), goes through these three steps:
 *
 *   start     name, type and size are checked against lib/evidence-policy.ts and the configured
 *             limits; the database records the upload (authorizing the draft or report and
 *             applying the upload rate limit) and the server signs a PUT bound to that exact
 *             key, type and size.
 *   (browser) the file goes straight to object storage, with real progress.
 *   complete  the server checks the stored object: its size must match, its first bytes must
 *             match the file type's signature, and its SHA-256 is computed from the stored
 *             bytes. Anything that fails is deleted. A report upload is then attached through
 *             the existing add_*_file_evidence functions, which make the real authorization
 *             decision; a draft upload waits for submit_report to attach it.
 *
 * Not done here: malware scanning. There is no scanning service in this deployment; evidence
 * is only ever served as a forced download of opaque bytes, which is the mitigation in place.
 */

export type StagedUpload = { id: string; filename: string; sizeBytes: number; contentType: string; status: "pending" | "ready" | "attached"; createdAt: string };

type UploadRow = {
  id: string;
  draft_id: string | null;
  report_id: string | null;
  visibility: ReportVisibility | null;
  object_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number | string;
  sha256: string | null;
  status: StagedUpload["status"];
  created_at: string;
};

function toStaged(row: UploadRow): StagedUpload {
  return { id: row.id, filename: row.original_filename, sizeBytes: Number(row.size_bytes), contentType: row.content_type, status: row.status, createdAt: row.created_at };
}

export type UploadTarget = { kind: "draft"; draftId: string } | { kind: "report"; reportId: string; visibility: ReportVisibility | null };

export async function startEvidenceUpload(actorId: string, target: UploadTarget, filename: string, sizeBytes: number): Promise<{ upload: StagedUpload; url: string; contentType: string }> {
  const limits = evidenceLimits();
  const problem = evidenceFileProblem({ name: filename, size: sizeBytes }, limits);
  if (problem) throw new OrganizationServiceError(problem, "INVALID_EVIDENCE");
  const type = evidenceTypeFor(filename)!;

  let rows: UploadRow[];
  try {
    rows = await withActorTransaction(actorId, (client) =>
      callRpc<UploadRow>(client, "public.create_evidence_upload", [
        target.kind === "draft" ? target.draftId : null,
        target.kind === "report" ? target.reportId : null,
        target.kind === "report" ? target.visibility : null,
        filename.trim(),
        type.mime,
        sizeBytes,
        limits.maxFiles,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return { upload: toStaged(row), url: await getSignedEvidenceUploadUrl(row.object_key, type.mime, sizeBytes), contentType: type.mime };
}

async function discard(actorId: string, uploadId: string): Promise<void> {
  try {
    const rows = await withActorTransaction(actorId, (client) => callRpc<{ delete_my_evidence_upload: string }>(client, "public.delete_my_evidence_upload", [uploadId]));
    const key = rows[0]?.delete_my_evidence_upload;
    if (key) await evidenceObjectStore.deleteObject(key).catch(() => {});
  } catch {
    // Already gone, or already attached (then it is evidence and must not be deleted).
  }
}

export async function completeEvidenceUpload(actorId: string, uploadId: string): Promise<{ upload: StagedUpload; evidenceId: string | null }> {
  let row: UploadRow | undefined;
  try {
    row = (await withActorTransaction(actorId, (client) => client.query<UploadRow>("select * from public.evidence_uploads where id = $1 and owner_id = $2", [uploadId, actorId]))).rows[0];
  } catch (error) {
    mapError(error as { message: string });
  }
  if (!row) throw new OrganizationServiceError("This upload no longer exists.", "UPLOAD_NOT_FOUND");
  if (row.status !== "pending") return { upload: toStaged(row), evidenceId: null };

  const declared = Number(row.size_bytes);
  const stored = await evidenceObjectSize(row.object_key);
  if (stored === null) throw new OrganizationServiceError("The file didn't finish uploading. Try again.", "UPLOAD_INCOMPLETE");
  const limits = evidenceLimits();
  const type = evidenceTypeFor(row.original_filename);
  if (stored !== declared || stored > limits.maxFileBytes || !type) {
    await discard(actorId, uploadId);
    throw new OrganizationServiceError(`${row.original_filename} didn't arrive intact. Upload it again (files must be ${formatBytes(limits.maxFileBytes)} or smaller).`, "INVALID_EVIDENCE");
  }

  const inspected = await inspectEvidenceObject(row.object_key);
  if (inspected.size !== declared || !type.signature(inspected.head)) {
    await discard(actorId, uploadId);
    throw new OrganizationServiceError(`${row.original_filename} doesn't look like a real ${type.label} file, so it wasn't attached.`, "INVALID_EVIDENCE");
  }

  try {
    return await withActorTransaction(actorId, async (client) => {
      const ready = (await callRpc<UploadRow>(client, "public.mark_evidence_upload_ready", [uploadId, inspected.sha256]))[0];
      if (!ready.report_id) return { upload: toStaged(ready), evidenceId: null };
      // Attach now, through the same functions every report file has always gone through.
      const args = [ready.report_id, ready.object_key, ready.original_filename, ready.content_type, declared, inspected.sha256];
      const evidence = ready.visibility
        ? (await callRpc<{ id: string }>(client, "public.add_organization_file_evidence", [...args, ready.visibility]))[0]
        : (await callRpc<{ id: string }>(client, "public.add_researcher_file_evidence", args))[0];
      await callRpc(client, "public.mark_evidence_upload_attached", [uploadId, evidence.id]);
      return { upload: { ...toStaged(ready), status: "attached" as const }, evidenceId: evidence.id };
    });
  } catch (error) {
    await discard(actorId, uploadId);
    mapError(error as { message: string });
  }
}

export async function removeEvidenceUpload(actorId: string, uploadId: string): Promise<void> {
  let key: string | undefined;
  try {
    const rows = await withActorTransaction(actorId, (client) => callRpc<{ delete_my_evidence_upload: string }>(client, "public.delete_my_evidence_upload", [uploadId]));
    key = rows[0]?.delete_my_evidence_upload;
  } catch (error) {
    mapError(error as { message: string });
  }
  if (key) await evidenceObjectStore.deleteObject(key).catch(() => {});
}

/** A draft's verified files, for restoring the composer. Owner-only (RLS). */
export async function listDraftUploads(actorId: string, draftId: string): Promise<StagedUpload[]> {
  try {
    const result = await withActorTransaction(actorId, (client) =>
      client.query<UploadRow>("select * from public.evidence_uploads where draft_id = $1 and owner_id = $2 and status = 'ready' order by created_at", [draftId, actorId]),
    );
    return result.rows.map(toStaged);
  } catch (error) {
    mapError(error as { message: string });
  }
}
