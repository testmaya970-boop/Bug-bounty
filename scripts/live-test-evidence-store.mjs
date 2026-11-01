// Live E2E exercise of the S3EvidenceObjectStore implementation (lib/evidence-store.ts)
// against the real MinIO instance (docker-compose.native.yml) -- upload, signed
// download, delete, and the "never overwrite an existing object" guarantee, matching
// exactly what services/report-file-evidence.ts relies on.
//
// This reimplements lib/evidence-store.ts's logic directly (same AWS SDK calls, same
// bucket/env vars, same object-key format) rather than importing the real file, because
// that file starts with `import "server-only"`, which throws unconditionally outside
// Next's bundler (see node_modules/server-only/index.js) -- the same reason
// tests/mocks/server-only.ts exists for vitest. Any behavioral change made to the real
// implementation must be mirrored here for this script to remain a faithful check.
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const SIGNED_URL_TTL_SECONDS = 60;

function storageClient() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
}

function generateEvidenceObjectKey() {
  return `evidence/${randomUUID()}`;
}

const evidenceObjectStore = {
  async putObject(objectKey, bytes, contentType) {
    const client = storageClient();
    const bucket = process.env.S3_BUCKET;
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      throw new Error(`EvidenceObjectStore.putObject failed: object already exists at key ${objectKey}`);
    } catch (error) {
      const isNotFound = error?.$metadata?.httpStatusCode === 404;
      if (!isNotFound) throw error;
    }
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: bytes, ContentType: contentType }));
  },

  async getSignedDownloadUrl(objectKey, downloadFilename) {
    const client = storageClient();
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/"/g, "'")}"`,
    });
    return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  },

  async deleteObject(objectKey) {
    const client = storageClient();
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
  },
};

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

async function main() {
  const objectKey = generateEvidenceObjectKey();
  assert(/^evidence\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(objectKey), "generateEvidenceObjectKey: matches the DB's object_key_format_check constraint exactly");

  const content = `test evidence content ${randomUUID()}`;
  const bytes = new TextEncoder().encode(content);
  const contentType = "text/plain";
  const downloadFilename = "repro-steps.txt";

  // 1. Upload
  await evidenceObjectStore.putObject(objectKey, bytes, contentType);
  console.log(`ok: putObject: uploaded ${bytes.byteLength} bytes to ${objectKey}`);

  // 2. Verify the object actually exists in the bucket with the right content type
  const client = storageClient();
  const head = await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
  assert(head.ContentType === contentType, `putObject: stored ContentType is ${contentType} (got ${head.ContentType})`);
  assert(head.ContentLength === bytes.byteLength, `putObject: stored size matches (${bytes.byteLength} bytes)`);

  // 3. Never overwrite an existing object
  let overwriteRejected = false;
  try {
    await evidenceObjectStore.putObject(objectKey, new TextEncoder().encode("different content"), contentType);
  } catch {
    overwriteRejected = true;
  }
  assert(overwriteRejected, "putObject: refuses to overwrite an existing object at the same key");

  // 4. Signed download URL -- forces download (Content-Disposition: attachment) with the
  // real filename, matching the original Supabase implementation's { download: filename }.
  const signedUrl = await evidenceObjectStore.getSignedDownloadUrl(objectKey, downloadFilename);
  assert(typeof signedUrl === "string" && signedUrl.startsWith("http"), "getSignedDownloadUrl: returns a real, well-formed URL");

  const downloadResponse = await fetch(signedUrl);
  assert(downloadResponse.ok, `getSignedDownloadUrl: the signed URL is actually fetchable (status ${downloadResponse.status})`);
  const downloadedText = await downloadResponse.text();
  assert(downloadedText === content, "getSignedDownloadUrl: downloaded bytes match exactly what was uploaded");
  const disposition = downloadResponse.headers.get("content-disposition") ?? "";
  assert(disposition.includes("attachment") && disposition.includes(downloadFilename), `getSignedDownloadUrl: forces download as "${downloadFilename}" (Content-Disposition: ${disposition})`);

  // 5. Delete
  await evidenceObjectStore.deleteObject(objectKey);
  let stillExists = true;
  try {
    await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
  } catch (error) {
    stillExists = error?.$metadata?.httpStatusCode !== 404;
  }
  assert(!stillExists, "deleteObject: the object is actually gone from the bucket after delete");

  // 6. Deleting an already-deleted / nonexistent object should not throw (best-effort
  // cleanup semantics, matching the original's use in uploadAndFinalize's failure path).
  let deleteOfMissingThrew = false;
  try {
    await evidenceObjectStore.deleteObject(objectKey);
  } catch {
    deleteOfMissingThrew = true;
  }
  assert(!deleteOfMissingThrew, "deleteObject: deleting an already-deleted object does not throw (S3 DeleteObject is idempotent)");

  console.log(`\n${failures === 0 ? "ALL LIVE EVIDENCE STORE TESTS PASSED" : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("LIVE TEST CRASHED:", e);
  process.exitCode = 1;
});
