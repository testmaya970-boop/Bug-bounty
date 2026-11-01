import "server-only";
import { createHash, randomUUID } from "node:crypto";

export type EvidenceObjectStore = {
  putObject(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getSignedDownloadUrl(objectKey: string, downloadFilename: string): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
};

type StoredEvidenceObject = {
  bytes: Uint8Array;
  contentType: string;
  sha256: string;
};

const memoryEvidenceStore = new Map<string, StoredEvidenceObject>();

export function generateEvidenceObjectKey(): string {
  return `evidence/${randomUUID()}`;
}

export const s3EvidenceObjectStore: EvidenceObjectStore = {
  async putObject(objectKey, bytes, contentType) {
    if (memoryEvidenceStore.has(objectKey)) {
      throw new Error(`EvidenceObjectStore.putObject failed: object already exists at key ${objectKey}`);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    memoryEvidenceStore.set(objectKey, { bytes: new Uint8Array(bytes), contentType, sha256 });
  },

  async getSignedDownloadUrl(objectKey, downloadFilename) {
    const safeName = encodeURIComponent(downloadFilename);
    return `/api/evidence-mock/${encodeURIComponent(objectKey)}?filename=${safeName}`;
  },

  async deleteObject(objectKey) {
    memoryEvidenceStore.delete(objectKey);
  },
};

export async function getSignedEvidenceUploadUrl(objectKey: string, _contentType: string, sizeBytes: number): Promise<string> {
  const dummyBytes = new Uint8Array(Math.min(sizeBytes, 1024));
  const sha256 = createHash("sha256").update(dummyBytes).digest("hex");
  memoryEvidenceStore.set(objectKey, { bytes: dummyBytes, contentType: _contentType, sha256 });
  return `/api/evidence-mock/${encodeURIComponent(objectKey)}`;
}

export async function evidenceObjectSize(objectKey: string): Promise<number | null> {
  const stored = memoryEvidenceStore.get(objectKey);
  return stored ? stored.bytes.byteLength : null;
}

export async function inspectEvidenceObject(objectKey: string, headBytes = 64 * 1024): Promise<{ sha256: string; head: Uint8Array; size: number }> {
  const stored = memoryEvidenceStore.get(objectKey);
  if (!stored) {
    throw new Error(`Evidence object not found: ${objectKey}`);
  }
  const take = Math.min(headBytes, stored.bytes.byteLength);
  return {
    sha256: stored.sha256,
    head: stored.bytes.subarray(0, take),
    size: stored.bytes.byteLength,
  };
}

export const evidenceObjectStore: EvidenceObjectStore = s3EvidenceObjectStore;

export async function checkEvidenceStorageReachable(): Promise<void> {
  return;
}
