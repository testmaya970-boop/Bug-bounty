// Phase 6 data migration: copies every real object in Supabase Storage's "evidence"
// bucket into the new S3/MinIO bucket, in place -- SAME key, SAME bytes, SAME content
// type. No database row is touched (report_evidence.object_key is never written by this
// script): the object_key format (evidence/<uuid>) is identical on both sides, so once
// the bytes exist at the same key in the new bucket, every existing DB reference
// resolves correctly with zero schema/data changes.
//
// Source: Supabase Storage's REST API (works against a local or hosted Supabase
// project) via the service-role key. Destination: the S3_* env vars already used by
// lib/evidence-store.ts.
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import pg from "pg";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_DB_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_DB_URL are all required");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
const bucket = process.env.S3_BUCKET;

const db = new pg.Client({ connectionString: SUPABASE_DB_URL });
await db.connect();

// The database's own record of which objects exist is the source of truth for what to
// migrate -- report_evidence.object_key, not Supabase Storage's own object listing --
// since that's exactly what every DB reference will look up post-migration. This also
// naturally skips any orphaned storage object with no owning row (see the evidence-store
// module's own comment on the documented, disclosed residual-orphan case).
const { rows } = await db.query("select object_key, content_type from public.report_evidence where object_key is not null");
console.log(`Found ${rows.length} file-evidence object(s) referenced in the database.`);

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const { object_key: objectKey, content_type: contentType } of rows) {
  try {
    // Skip if already migrated (idempotent re-run safety).
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      console.log(`skip (already present): ${objectKey}`);
      skipped++;
      continue;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 404) throw error;
    }

    const downloadUrl = `${SUPABASE_URL}/storage/v1/object/evidence/${objectKey.replace(/^evidence\//, "")}`;
    const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY } });
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: bytes, ContentType: contentType ?? "application/octet-stream" }));
    console.log(`migrated: ${objectKey} (${bytes.byteLength} bytes)`);
    migrated++;
  } catch (error) {
    console.error(`FAILED: ${objectKey}: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

await db.end();

console.log(`\nDone. migrated=${migrated} skipped=${skipped} failed=${failed} total=${rows.length}`);
process.exitCode = failed > 0 ? 1 : 0;
