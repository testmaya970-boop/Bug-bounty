#!/usr/bin/env node
// Creates the evidence bucket (S3_BUCKET) if it does not exist. Idempotent -- safe on every
// release. Until this existed the bucket was made by hand, so a fresh environment (CI, a
// new server) started with uploads failing and /api/health reporting storage down.
//
//   npm run storage:init
import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

const required = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`missing: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
const Bucket = process.env.S3_BUCKET;

try {
  await client.send(new HeadBucketCommand({ Bucket }));
  console.log(`bucket ${Bucket} already exists`);
} catch (error) {
  if (error?.$metadata?.httpStatusCode !== 404) {
    console.error(`cannot reach bucket ${Bucket}: ${error?.name ?? error}`);
    process.exit(1);
  }
  // Private by default: evidence is only ever served through short-lived signed URLs.
  await client.send(new CreateBucketCommand({ Bucket }));
  console.log(`created bucket ${Bucket}`);
}
