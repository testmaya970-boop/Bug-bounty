import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { evidenceObjectStore } from "@/lib/evidence-store";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";

export { OrganizationServiceError };

/**
 * A single, org-uploaded file per program (a VPN config, a setup PDF, whatever a
 * private/internal engagement needs) -- see
 * db/migrations/202609240002_program_access_file.sql for why this is its own table
 * rather than a report_evidence row. This service mirrors
 * services/report-file-evidence.ts's bytes-then-row upload order exactly, reusing the
 * same evidenceObjectStore (the storage seam already built for this), just against a
 * different owning table.
 */

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB -- same cap as report evidence.

export type ProgramAccessFile = {
  id: string;
  programId: string;
  organizationId: string;
  uploadedBy: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

type AccessFileRow = {
  id: string;
  program_id: string;
  organization_id: string;
  uploaded_by: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
};

function mapAccessFileRow(row: AccessFileRow): ProgramAccessFile {
  return {
    id: row.id,
    programId: row.program_id,
    organizationId: row.organization_id,
    uploadedBy: row.uploaded_by,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

/** program-access/<uuid> -- mirrors generateEvidenceObjectKey's shape/reasoning exactly
 * (lib/evidence-store.ts), just under a different prefix so the two object families never
 * collide in the shared bucket. Matches this table's own
 * program_access_files_object_key_format_check constraint. */
function generateAccessFileObjectKey(): string {
  return `program-access/${randomUUID()}`;
}

export type UploadInput = { filename: string; contentType: string; bytes: Uint8Array };

function validate(input: UploadInput) {
  const trimmedFilename = input.filename.trim();
  if (trimmedFilename.length === 0) throw new OrganizationServiceError("Choose a file to upload.", "INVALID_ACCESS_FILE");
  if (trimmedFilename.length > 255) throw new OrganizationServiceError("File name must be 255 characters or fewer.", "INVALID_ACCESS_FILE");
  if (input.bytes.byteLength === 0) throw new OrganizationServiceError("The selected file is empty.", "INVALID_ACCESS_FILE");
  if (input.bytes.byteLength > MAX_SIZE_BYTES) throw new OrganizationServiceError("File must be 10 MB or smaller.", "INVALID_ACCESS_FILE");
}

/**
 * Reads any existing access file's object key BEFORE the RPC replaces the row, so the
 * old storage object can be deleted after a successful swap -- upload_program_access_file
 * itself only ever touches the database row (see that function's own comment), matching
 * the existing add_organization_file_evidence split between storage I/O (this file) and
 * row mutation (the RPC).
 */
async function existingObjectKey(actorId: string | null, programId: string): Promise<string | null> {
  const rows = await withActorTransaction(actorId, (client) =>
    client.query<{ object_key: string }>("select object_key from public.program_access_files where program_id = $1", [programId]).then((r) => r.rows),
  );
  return rows[0]?.object_key ?? null;
}

export async function uploadProgramAccessFile(programId: string, input: UploadInput): Promise<ProgramAccessFile> {
  validate(input);
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in to upload a file.", "AUTH_REQUIRED");
  const actorId = actor.id;

  const previousObjectKey = await existingObjectKey(actorId, programId).catch(() => null);

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const objectKey = generateAccessFileObjectKey();

  // The RPC authorizes first; the object is stored only once it has, inside the same
  // transaction, so a refused caller never writes to storage (it used to upload first).
  let rows;
  try {
    rows = await withActorTransaction(actorId, async (client) => {
      const result = await callRpc<AccessFileRow>(client, "public.upload_program_access_file", [
        programId,
        objectKey,
        input.filename.trim(),
        input.contentType || "application/octet-stream",
        input.bytes.byteLength,
        sha256,
      ]);
      await evidenceObjectStore.putObject(objectKey, input.bytes, input.contentType || "application/octet-stream");
      return result;
    });
  } catch (error) {
    try {
      await evidenceObjectStore.deleteObject(objectKey);
    } catch {
      // Best-effort only, matching services/report-file-evidence.ts's identical
      // orphan-cleanup stance.
    }
    mapError(error as { message: string });
  }

  if (previousObjectKey) {
    try {
      await evidenceObjectStore.deleteObject(previousObjectKey);
    } catch {
      // Best-effort: the database row is already replaced (the source of truth for
      // what's currently downloadable); a lingering orphaned object in storage is a
      // disclosed residual case, identical in kind to 0011's own.
    }
  }

  return mapAccessFileRow(rows[0]);
}

export async function removeProgramAccessFile(programId: string): Promise<void> {
  const actor = await getCurrentUser();
  const actorId = actor?.id ?? null;
  const objectKey = await existingObjectKey(actorId, programId).catch(() => null);

  try {
    await withActorTransaction(actorId, (client) => callRpc(client, "public.remove_program_access_file", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }

  if (objectKey) {
    try {
      await evidenceObjectStore.deleteObject(objectKey);
    } catch {
      // Best-effort only, same stance as above.
    }
  }
}

export async function getProgramAccessFile(programId: string): Promise<ProgramAccessFile | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<AccessFileRow>(
          "select id, program_id, organization_id, uploaded_by, object_key, original_filename, content_type, size_bytes, sha256, created_at from public.program_access_files where program_id = $1",
          [programId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapAccessFileRow(rows[0]) : null;
}

/** Download authorization is the row's own RLS policy -- a denied or nonexistent access
 * file is indistinguishable (null), same confidentiality-safe shape
 * getEvidenceDownloadUrl already uses. Every successful download is also audited via
 * record_program_access_file_download, since this file is credential-adjacent (see the
 * migration's own header on why per-researcher revocation of its contents isn't
 * possible -- knowing who downloaded it and when is the mitigating signal this can
 * still provide). */
export async function getProgramAccessFileDownloadUrl(programId: string): Promise<string | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<{ object_key: string; original_filename: string }>("select object_key, original_filename from public.program_access_files where program_id = $1", [programId])
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const data = rows[0];
  if (!data) return null;

  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.record_program_access_file_download", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }

  return evidenceObjectStore.getSignedDownloadUrl(data.object_key, data.original_filename);
}
