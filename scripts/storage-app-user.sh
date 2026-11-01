#!/usr/bin/env bash
# Creates (or updates) the scoped MinIO user the app connects as, so the app never holds
# MinIO root credentials. Idempotent.
#
#   bash scripts/storage-app-user.sh
#
# Reads MINIO_ROOT_USER / MINIO_ROOT_PASSWORD from .env (docker compose) and
# S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET from .env.local (the app's own keys).
# The policy allows object read/write/delete and bucket listing on S3_BUCKET only -- no
# other buckets, no admin API.
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash on Windows rewrites /tmp/... arguments into Windows paths before docker exec sees them.
export MSYS_NO_PATHCONV=1

get() { grep -E "^$2=" "$1" | tail -1 | cut -d= -f2-; }
ROOT_USER=$(get .env MINIO_ROOT_USER)
ROOT_PASSWORD=$(get .env MINIO_ROOT_PASSWORD)
APP_KEY=$(get .env.local S3_ACCESS_KEY_ID)
APP_SECRET=$(get .env.local S3_SECRET_ACCESS_KEY)
BUCKET=$(get .env.local S3_BUCKET)
CONTAINER=${MINIO_CONTAINER:-sentinel_native_minio}

if [ "$APP_KEY" = "$ROOT_USER" ]; then
  echo "S3_ACCESS_KEY_ID in .env.local is the MinIO root user -- set a separate app key first" >&2
  exit 1
fi

POLICY=$(cat <<JSON
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::${BUCKET}/*"]},
  {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::${BUCKET}"]}
]}
JSON
)

docker exec "$CONTAINER" mc alias set local http://localhost:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null
docker exec -i "$CONTAINER" sh -c "cat > /tmp/sentinel-app-policy.json" <<<"$POLICY"
docker exec "$CONTAINER" mc admin policy create local sentinel-app /tmp/sentinel-app-policy.json >/dev/null
docker exec "$CONTAINER" mc admin user add local "$APP_KEY" "$APP_SECRET" >/dev/null
docker exec "$CONTAINER" mc admin policy attach local sentinel-app --user "$APP_KEY" >/dev/null 2>&1 || true
docker exec "$CONTAINER" rm -f /tmp/sentinel-app-policy.json
echo "storage app user '$APP_KEY' limited to bucket '$BUCKET'"
