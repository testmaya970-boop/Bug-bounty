import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getNativeEnv } from "./env";

/**
 * The domain (services/report-file-evidence.ts, the report_evidence table) knows only
 * "evidence object" -- never "storage-provider object." This is the entire surface a
 * future provider would need to implement to replace s3EvidenceObjectStore below;
 * nothing else in the codebase may import an S3 SDK type or reference a bucket name.
 * See docs/decisions/0011-binary-evidence-storage.md.
 *
 * NATIVE-POSTGRES MIGRATION EDIT (Phase 6, see db/migrations/README.md and the migration
 * plan): this file previously implemented this same interface against Supabase Storage
 * (supabaseEvidenceObjectStore, now removed). The interface itself, BUCKET, the object
 * key format, and every semantic guarantee documented on each method are unchanged --
 * this is a pure swap of the implementation behind the seam the original file already
 * built for exactly this purpose (its own comment said so verbatim). Callers
 * (services/report-file-evidence.ts) needed zero changes.
 */
export type EvidenceObjectStore = {
  /** Writes bytes to a fresh, opaque key. Never overwrites an existing object. */
  putObject(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A short-lived, authorization-already-decided URL that forces a download (never
   * inline rendering) regardless of the object's stored content type. */
  getSignedDownloadUrl(objectKey: string, downloadFilename: string): Promise<string>;
  /** Best-effort cleanup for an object whose evidence row failed to finalize -- never
   * exposed as a general "delete evidence" capability. */
  deleteObject(objectKey: string): Promise<void>;
};

const SIGNED_URL_TTL_SECONDS = 60;

let cachedClient: S3Client | null = null;

function storageClient(): S3Client {
  if (!cachedClient) {
    const env = getNativeEnv();
    cachedClient = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }
  return cachedClient;
}

function bucketName(): string {
  // getNativeEnv().S3_BUCKET is the actual configured bucket ("evidence" in every real
  // environment so far, the same bucket name as the Supabase Storage era this replaced --
  // object_key format/paths are bucket-relative and identical either way).
  return getNativeEnv().S3_BUCKET;
}

/** evidence/<uuid> -- a CSPRNG-generated key, never the filename, never derived from
 * organization/report/researcher ids. Unchanged from the Supabase Storage era: the
 * database's own `report_evidence_object_key_format_check` constraint
 * (db/migrations/202608270005_binary_evidence_storage.sql) still requires exactly this
 * shape, so this function is not part of the provider-specific surface at all. See
 * docs/decisions/0011. */
export function generateEvidenceObjectKey(): string {
  return `evidence/${randomUUID()}`;
}

export const s3EvidenceObjectStore: EvidenceObjectStore = {
  /** Never overwrites an existing object -- same guarantee the Supabase implementation's
   * `upsert: false` gave. S3's PutObject has no native "fail if exists" flag, so this
   * checks for the object's existence first via a HeadObject; the same CSPRNG key-space
   * (a v4 UUID) already makes a genuine collision astronomically unlikely, so this check
   * exists to preserve the documented contract explicitly, not because collisions are a
   * real operational risk. */
  async putObject(objectKey, bytes, contentType) {
    const client = storageClient();
    const bucket = bucketName();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      throw new Error(`EvidenceObjectStore.putObject failed: object already exists at key ${objectKey}`);
    } catch (error) {
      // A 404/NotFound from HeadObject is the expected, good case (the key is free) --
      // anything else (including the deliberate "already exists" throw above) must
      // propagate. The AWS SDK v3 raises NotFound with this $metadata.httpStatusCode.
      const isNotFound = typeof error === "object" && error !== null && "$metadata" in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
      if (!isNotFound) throw error;
    }
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: bytes, ContentType: contentType }));
    } catch (error) {
      throw new Error(`EvidenceObjectStore.putObject failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /** Forces a download (Content-Disposition: attachment) regardless of the object's
   * stored content type, identical to the Supabase implementation's `{ download:
   * downloadFilename }` option -- achieved here via ResponseContentDisposition on the
   * presigned GetObject request, an S3-native equivalent with the same effect: the
   * browser downloads the file as `downloadFilename` rather than rendering it inline. */
  async getSignedDownloadUrl(objectKey, downloadFilename) {
    const client = storageClient();
    const bucket = bucketName();
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        // ASCII fallback with quotes, backslashes and control characters removed, plus the real
        // name RFC 5987-encoded -- a raw CR/LF here would reach the response header.
        ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/[^ -~]|[\\"]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(downloadFilename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        // The stored Content-Type is whatever the uploader claimed (e.g. text/html). Always
        // serve evidence as opaque bytes so it can never render, wherever storage is hosted.
        ResponseContentType: "application/octet-stream",
      });
      return await getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
    } catch (error) {
      throw new Error(`EvidenceObjectStore.getSignedDownloadUrl failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async deleteObject(objectKey) {
    const client = storageClient();
    const bucket = bucketName();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    } catch (error) {
      throw new Error(`EvidenceObjectStore.deleteObject failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

/**
 * Direct uploads (202610260004): the browser PUTs the file straight to storage, so its bytes
 * never pass through the app server. The signature covers the key, the content type and the
 * exact byte length, and expires quickly: the URL can only write that one object, of that one
 * size, once the server has already authorized and recorded the upload.
 */
const SIGNED_UPLOAD_TTL_SECONDS = 15 * 60;

export async function getSignedEvidenceUploadUrl(objectKey: string, contentType: string, sizeBytes: number): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucketName(), Key: objectKey, ContentType: contentType, ContentLength: sizeBytes });
  return getSignedUrl(storageClient(), command, { expiresIn: SIGNED_UPLOAD_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) });
}

/** Size of a stored object, or null when it does not exist (the upload never arrived). */
export async function evidenceObjectSize(objectKey: string): Promise<number | null> {
  try {
    const head = await storageClient().send(new HeadObjectCommand({ Bucket: bucketName(), Key: objectKey }));
    return typeof head.ContentLength === "number" ? head.ContentLength : null;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

/** Streams a stored object once: its SHA-256 and its first `headBytes` bytes (for the file
 * signature check), without ever holding the whole file in memory. */
export async function inspectEvidenceObject(objectKey: string, headBytes = 64 * 1024): Promise<{ sha256: string; head: Uint8Array; size: number }> {
  const response = await storageClient().send(new GetObjectCommand({ Bucket: bucketName(), Key: objectKey }));
  const hash = createHash("sha256");
  const head = new Uint8Array(headBytes);
  let headLength = 0;
  let size = 0;
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    if (headLength < headBytes) {
      const take = Math.min(headBytes - headLength, chunk.byteLength);
      head.set(chunk.subarray(0, take), headLength);
      headLength += take;
    }
    size += chunk.byteLength;
  }
  return { sha256: hash.digest("hex"), head: head.subarray(0, headLength), size };
}

/** The active implementation. Swapping providers means writing a new EvidenceObjectStore
 * implementation and changing this one export -- nothing else in the codebase changes. */
export const evidenceObjectStore: EvidenceObjectStore = s3EvidenceObjectStore;

/** Health check only (app/api/health): can this process reach the evidence bucket with its
 * configured credentials? Throws on any failure. */
export async function checkEvidenceStorageReachable(): Promise<void> {
  await storageClient().send(new HeadBucketCommand({ Bucket: bucketName() }));
}
